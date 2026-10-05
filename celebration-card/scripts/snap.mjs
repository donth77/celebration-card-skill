#!/usr/bin/env node
// Headless QA for a celebration card: its own browser (safe to run in parallel), phone-sized,
// waits for boot, optionally taps the gate (checks audio), then captures exact frames with
// card.snap(t) and reports state, console errors and failed requests as JSON.
//
//   node snap.mjs http://localhost:8765/ --out qa/ --times gate,start,verse1+2bar,chorus1,finale+1bar,end
//        [--size 390x844] [--desktop] [--tap] [--play-into finale:3] [--scale 1] [--reduced]
//        [--webkit] [--landscape] [--notch] [--cpu 4]
//
// --times    comma list of times or section expressions; 'gate' = the closed gate (before tapping)
// --tap      click the gate first and report whether the audio clock runs (card.state())
// --play-into expr:sec  play from expr for sec seconds, then snap (shows cue-driven bursts)
// --desktop  also capture each time at 1440x900
// --webkit   run as an iPhone in Safari's engine (Playwright's WebKit build): an iPhone's user agent,
//            touch, 3x pixels and Safari's visible area (390x664 upright, 844x342 sideways, with its bars)
// --landscape  the phone turned sideways
// --notch    simulate a notched iPhone's safe areas through the card's --safe-* CSS variables, draw the
//            notch, rounded corners and home bar on the phone shots, and list any text or button under
//            them in qa-report.json ("unsafe"). Sideways is what Safari really shows (the notch at a side);
//            upright is the worst case (the page full screen behind the notch and the home bar).
// --cpu <n>  slow Chromium's CPU n times, like an older phone (with --play-into, the report gets the fps and
//            the quality tier; headless Chromium draws WebGL in software, so compare runs, not phones)
// --playwright <path>  use this installed copy of the `playwright` package
// --browser-path <path>  use this browser executable (a Chromium, or a Playwright WebKit build with --webkit)
// Needs the `playwright` package and its Chromium browser (and its WebKit browser for --webkit). It
// looks in the project first, then in the npx cache (e.g. the copy the Playwright MCP server uses). If
// the WebKit build that copy expects isn't installed, it uses the newest WebKit build that is.

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
const iphone = flag('webkit'), landscape = flag('landscape'), notch = flag('notch');
let [w, h] = opt('size', iphone ? '390x664' : '390x844').split('x').map(Number);
if (landscape) [w, h] = iphone && !opt('size', null) ? [844, 342] : [Math.max(w, h), Math.min(w, h)];
const scale = Number(opt('scale', iphone ? '3' : '1'));
// a notched iPhone's safe-area insets, in CSS pixels: upright the notch and the home bar, sideways the notch at a side
const INSETS = landscape ? { t: 0, r: 47, b: 21, l: 47 } : { t: 47, r: 0, b: 34, l: 0 };
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
  for (const t of tries) { try { const m = t(); if (m?.chromium && m?.webkit) return m; } catch { /* next */ } }
  console.error('Playwright not found. Add the playwright package and its Chromium browser to this project, or pass --playwright <path to an installed copy>.');
  process.exit(2);
}

// Playwright's browsers live in one folder per build (webkit-2359…); a copy of Playwright expects one build
function installedWebkit() {
  const home = os.homedir();
  for (const root of [path.join(home, 'Library', 'Caches', 'ms-playwright'), path.join(home, '.cache', 'ms-playwright'), path.join(home, 'AppData', 'Local', 'ms-playwright')]) {
    if (!fs.existsSync(root)) continue;
    const builds = fs.readdirSync(root).filter((d) => /^webkit-\d+$/.test(d)).sort((a, b) => Number(b.slice(7)) - Number(a.slice(7)));
    for (const b of builds) for (const exe of ['pw_run.sh', 'Playwright.exe']) { const p = path.join(root, b, exe); if (fs.existsSync(p)) return p; }
  }
  return null;
}

const pw = loadPlaywright();
const exePath = opt('browser-path', null);
const launchWebkit = async () => {
  try { return await pw.webkit.launch(exePath ? { executablePath: exePath } : {}); }
  catch (e) { const exe = !exePath && installedWebkit(); if (exe) return pw.webkit.launch({ executablePath: exe }); throw e; }
};
const browser = await (iphone ? launchWebkit() : pw.chromium.launch({ ...(exePath ? { executablePath: exePath } : {}), args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] }))
  .catch(async (e) => { console.error(String(e).split('\n')[0]); console.error(`Playwright's ${iphone ? 'WebKit' : 'Chromium'} browser is missing or out of date: download it with Playwright's own installer.`); process.exit(3); });
const NOISE = /placard|Button failed to load/;   // WebKit's own video controls logging, not the card

const report = { url, engine: iphone ? 'webkit (iPhone)' : 'chromium', size: `${w}x${h}`, insets: notch ? INSETS : null, shots: [], consoleErrors: [], pageErrors: [], failedRequests: [], unsafe: [] };

// --notch: what a notched iPhone covers, and which text or buttons sit under it
const unsafeCheck = (page, label) => page.evaluate(({ i, label }) => {
  const W = innerWidth, H = innerHeight, zones = [];
  if (i.t) zones.push(['top (notch, status bar)', 0, 0, W, i.t]);
  if (i.b) zones.push(['bottom (home bar)', 0, H - i.b, W, i.b]);
  if (i.l) zones.push(['left (notch side)', 0, 0, i.l, H]);
  if (i.r) zones.push(['right (notch side)', W - i.r, 0, i.r, H]);
  // text a scrolling box can move clear of the top or bottom (a long letter) is fine where it is
  const scrolls = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (/auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) return true; } return false; };
  const shown = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false; } return true; };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.width * r.height > 0.6 * W * H) continue;
    const control = el.matches('button, a[href], input, select, textarea, [role="button"]');
    if (!control && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const zone = zones.find(([, x, y, zw, zh]) => Math.min(r.right, x + zw) - Math.max(r.left, x) > 2 && Math.min(r.bottom, y + zh) - Math.max(r.top, y) > 2);
    if (!zone || !shown(el) || ((zone[0].startsWith('top') || zone[0].startsWith('bottom')) && scrolls(el))) continue;
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    out.push({ shot: label, zone: zone[0], el: el.tagName.toLowerCase() + cls, text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40), rect: [r.left, r.top, r.width, r.height].map(Math.round) });
  }
  return out.slice(0, 20);
}, { i: INSETS, label });
const drawPhone = (page, on) => page.evaluate(({ i, on, side }) => {
  document.getElementById('qa-phone')?.remove();
  if (!on) return;
  const d = document.createElement('div'); d.id = 'qa-phone';
  d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  const box = (css) => { const b = document.createElement('div'); b.style.cssText = 'position:absolute;' + css; d.appendChild(b); };
  const band = ';background:rgba(255,40,90,.2)';
  box('inset:0;border-radius:46px;box-shadow:0 0 0 300px #000');   // the screen's rounded corners
  if (i.t) box(`left:0;right:0;top:0;height:${i.t}px${band}`);
  if (i.b) box(`left:0;right:0;bottom:0;height:${i.b}px${band}`);
  if (i.l) box(`left:0;top:0;bottom:0;width:${i.l}px${band}`);
  if (i.r) box(`right:0;top:0;bottom:0;width:${i.r}px${band}`);
  if (side) box('left:0;top:50%;width:32px;height:160px;margin-top:-80px;background:#000;border-radius:0 18px 18px 0');   // the notch, sideways
  else box('left:50%;top:0;width:160px;height:32px;margin-left:-80px;background:#000;border-radius:0 0 18px 18px');
  box(`left:50%;bottom:8px;width:${side ? 210 : 134}px;margin-left:-${side ? 105 : 67}px;height:5px;border-radius:3px;background:rgba(255,255,255,.85)`);   // the home bar
  document.body.appendChild(d);
}, { i: INSETS, on, side: landscape });

async function session(vw, vh, suffix, phone) {
  const ctx = await browser.newContext({
    ...(iphone && phone ? { userAgent: pw.devices['iPhone 13']?.userAgent } : {}),
    viewport: { width: vw, height: vh }, deviceScaleFactor: phone ? scale : Number(opt('scale', '1')), hasTouch: phone, isMobile: phone,
    reducedMotion: flag('reduced') ? 'reduce' : 'no-preference',
  });
  if (notch && phone) {
    await ctx.addInitScript((i) => {
      const add = () => { const s = document.createElement('style'); s.textContent = `:root { --safe-t: ${i.t}px !important; --safe-r: ${i.r}px !important; --safe-b: ${i.b}px !important; --safe-l: ${i.l}px !important; }`; document.head.appendChild(s); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
    }, INSETS);
  }
  const page = await ctx.newPage();
  const cpu = Number(opt('cpu', '1'));
  if (cpu > 1 && phone && !iphone) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) report.consoleErrors.push(m.text().slice(0, 300)); });
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
    if (notch && phone) { report.unsafe.push(...await unsafeCheck(page, label)); await drawPhone(page, true); }
    await page.screenshot({ path: file });
    if (notch && phone) await drawPhone(page, false);
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
    report.perf = { ...(await page.evaluate(() => { const st = window.card.state(); return { fps: st.fps, quality: st.quality }; })), cpuSlowdown: iphone ? 1 : cpu };   // the slowdown is Chromium's only
    await page.evaluate(() => window.card.snap(window.card.ctx.t));
    await shoot(`play-${expr}`);
  }
  report[`state_${suffix}`] = await page.evaluate(() => window.card?.state());
  await ctx.close();
}

await session(w, h, 'm', true);
if (flag('desktop')) await session(1440, 900, 'd', false);
await browser.close();
report.consoleErrors = [...new Set(report.consoleErrors)];
report.failedRequests = [...new Set(report.failedRequests)];
fs.writeFileSync(path.join(outDir, 'qa-report.json'), JSON.stringify(report, null, 2));
const s = report.state_m || {};
console.log(JSON.stringify({
  engine: report.engine, size: report.size, shots: report.shots.length, gateReadyMs: report.gateReadyMs,
  perf: report.perf, unsafe: notch ? report.unsafe.length : undefined, unsafeFirst: notch ? report.unsafe.slice(0, 4).map((u) => `${u.shot}: ${u.el} "${u.text}" (${u.zone})`) : undefined, failedScenes: s.failedScenes, errors: [...(s.errors || []), ...report.pageErrors, ...report.consoleErrors].slice(0, 8),
  failedRequests: report.failedRequests.slice(0, 5), afterTap: report.afterTap && { playing: report.afterTap.playing, clock: report.afterTap.clock, audioBlocked: report.afterTap.audioBlocked, t: report.afterTap.t },
  report: path.join(outDir, 'qa-report.json'),
}, null, 1));
