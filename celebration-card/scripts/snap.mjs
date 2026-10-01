#!/usr/bin/env node
// Headless QA for a celebration card: its own browser (safe to run in parallel), phone-sized,
// waits for boot, optionally taps the gate (checks audio), then captures exact frames with
// card.snap(t) and reports state, console errors and failed requests as JSON.
//
//   node snap.mjs http://localhost:8765/ --out qa/ --times gate,start,verse1+2bar,chorus1,finale+1bar,end
//        [--size 390x844] [--desktop] [--tap] [--play-into finale:3] [--scale 1] [--reduced]
//
// --times    comma list of times or section expressions; 'gate' = the closed gate (before tapping)
// --tap      click the gate first and report whether the audio clock runs (card.state())
// --play-into expr:sec  play from expr for sec seconds, then snap (shows cue-driven bursts)
// --desktop  also capture each time at 1440x900
// --playwright <path>  use this installed copy of the `playwright` package
// Needs the `playwright` package and its Chromium browser. It looks in the project first, then in
// the npx cache (e.g. the copy the Playwright MCP server uses).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
if (!url) { console.error('usage: node snap.mjs <url> --out <dir> --times a,b,c [--tap] [--desktop]'); process.exit(1); }
const outDir = opt('out', 'qa');
const times = opt('times', 'gate,start,end').split(',').map((s) => s.trim()).filter(Boolean);
const [w, h] = opt('size', '390x844').split('x').map(Number);
const scale = Number(opt('scale', '1'));
fs.mkdirSync(outDir, { recursive: true });

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const tries = [() => req('playwright'), () => req(path.join(process.cwd(), 'node_modules', 'playwright'))];
  const given = opt('playwright', null);
  if (given) tries.unshift(() => req(path.resolve(given)));
  const npx = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npx)) {
    const found = fs.readdirSync(npx).map((d) => path.join(npx, d, 'node_modules', 'playwright')).filter((p) => fs.existsSync(path.join(p, 'package.json')))
      .map((p) => ({ p, v: JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8')).version }))
      .filter((x) => !/alpha|beta|next/.test(x.v))
      .sort((a, b) => b.v.localeCompare(a.v, undefined, { numeric: true }));
    for (const f of found) tries.push(() => req(f.p));
  }
  for (const t of tries) { try { const m = t(); if (m?.chromium) return m; } catch { /* next */ } }
  console.error('Playwright not found. Add the playwright package and its Chromium browser to this project, or pass --playwright <path to an installed copy>.');
  process.exit(2);
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] })
  .catch(async (e) => { console.error(String(e).split('\n')[0]); console.error("Playwright's Chromium browser is missing or out of date: download it with Playwright's own installer."); process.exit(3); });

const report = { url, size: `${w}x${h}`, shots: [], consoleErrors: [], pageErrors: [], failedRequests: [] };

async function session(vw, vh, suffix) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: scale, hasTouch: vw < 600, isMobile: vw < 600, reducedMotion: flag('reduced') ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));
  page.on('requestfailed', (r) => { const e = r.failure()?.errorText || ''; if (!/ERR_ABORTED/.test(e)) report.failedRequests.push(`${r.url()} ${e}`); }); // aborts = normal media seeks
  page.on('response', (r) => { if (r.status() >= 400) report.failedRequests.push(`${r.status()} ${r.url()}`); });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.card && (document.querySelector('#gate.is-ready') || window.card.state().started), null, { timeout: 30000 })
    .catch(() => report.pageErrors.push('card never became ready (window.card / #gate.is-ready)'));
  if (suffix === 'm') report.gateReadyMs = Date.now() - t0; // first impression: aim for < ~3 s on a desktop GPU
  const shoot = async (label) => {
    const file = path.join(outDir, `${suffix}${String(report.shots.length + 1).padStart(2, '0')}-${label.replace(/[^\w.+-]+/g, '_')}.png`);
    await page.screenshot({ path: file });
    report.shots.push(file);
  };
  if (times.includes('gate')) await shoot('gate');
  if (flag('tap') && suffix === 'm') {
    const gate = await page.$('#gate');
    if (gate) {
      const box = await gate.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.8); // tap the gate (avoid pulsing seal)
      await page.waitForTimeout(2500);
      report.afterTap = await page.evaluate(() => window.card.state());
    }
  }
  for (const t of times) {
    if (t === 'gate') continue;
    const target = t === 'start' ? 0 : t;
    const ok = await page.evaluate(async (tt) => {
      try { await window.card.snap(tt); return null; } catch (e) { return String(e.message || e); }
    }, target);
    if (ok) { report.pageErrors.push(`snap(${t}): ${ok}`); continue; }
    await page.waitForTimeout(150);
    await shoot(t);
  }
  const playInto = opt('play-into', null);
  if (playInto && suffix === 'm') {
    const [expr, secs] = playInto.split(':');
    await page.evaluate((e) => { window.card.seek(e); window.card.play(); }, expr);
    await page.waitForTimeout(Number(secs || 3) * 1000);
    await page.evaluate(() => window.card.snap(window.card.ctx.t));
    await shoot(`play-${expr}`);
  }
  report[`state_${suffix}`] = await page.evaluate(() => window.card?.state());
  await ctx.close();
}

await session(w, h, 'm');
if (flag('desktop')) await session(1440, 900, 'd');
await browser.close();
report.consoleErrors = [...new Set(report.consoleErrors)];
report.failedRequests = [...new Set(report.failedRequests)];
fs.writeFileSync(path.join(outDir, 'qa-report.json'), JSON.stringify(report, null, 2));
const s = report.state_m || {};
console.log(JSON.stringify({
  shots: report.shots.length, gateReadyMs: report.gateReadyMs, failedScenes: s.failedScenes, errors: [...(s.errors || []), ...report.pageErrors, ...report.consoleErrors].slice(0, 8),
  failedRequests: report.failedRequests.slice(0, 5), afterTap: report.afterTap && { playing: report.afterTap.playing, clock: report.afterTap.clock, audioBlocked: report.afterTap.audioBlocked, t: report.afterTap.t },
  report: path.join(outDir, 'qa-report.json'),
}, null, 1));
