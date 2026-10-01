// ?debug overlay: time, section, beat, active scenes, fps, plus a clickable timeline with the
// section map. Keys: Space play/pause · ←/→ ±2s (Shift ±10s) · ↑/↓ prev/next section ·
// B jump back one bar · D hide overlay.
// Tap-to-mark (for syncing a real song by ear): play from the start and press M at the first beat
// of each section (or each lyric line); X clears. The marks (snapped to the nearest bar line) are
// printed as a ready-to-paste `analyze_audio.py --sections "…"` string and copied with C.

export function installDebug(card) {
  const { timing, ctx } = card;
  const root = document.createElement('div');
  root.id = 'card-debug';
  root.innerHTML = `
    <style>
      #card-debug{position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;font:11px/1.4 ui-monospace,Menlo,monospace;color:#fff;pointer-events:none}
      #card-debug .info{display:inline-block;background:rgba(0,0,0,.72);padding:6px 8px;border-radius:6px;white-space:pre;margin-bottom:6px}
      #card-debug .bar{position:relative;height:26px;background:rgba(0,0,0,.72);border-radius:6px;overflow:hidden;pointer-events:auto;cursor:pointer}
      #card-debug .sec{position:absolute;top:0;bottom:0;border-right:1px solid rgba(255,255,255,.35);padding:2px 4px;overflow:hidden;white-space:nowrap;font-size:10px}
      #card-debug .scn{position:absolute;bottom:0;height:5px;opacity:.8}
      #card-debug .head{position:absolute;top:0;bottom:0;width:2px;background:#ff3b6b;box-shadow:0 0 6px #ff3b6b}
      #card-debug.hidden{display:none}
    </style>
    <div class="info"></div>
    <div class="bar"><div class="head"></div></div>`;
  document.body.appendChild(root);
  const info = root.querySelector('.info');
  const bar = root.querySelector('.bar');
  const head = root.querySelector('.head');
  const D = timing.duration;
  const hues = [200, 330, 45, 150, 270, 20, 100, 300];

  timing.sections.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'sec';
    el.style.left = `${(s.start / D) * 100}%`;
    el.style.width = `${((s.end - s.start) / D) * 100}%`;
    el.style.background = `hsla(${hues[i % hues.length]},70%,45%,.45)`;
    el.textContent = s.name;
    bar.appendChild(el);
  });
  card.entries.forEach((e, i) => {
    const el = document.createElement('div');
    el.className = 'scn';
    el.title = e.id;
    el.style.left = `${(e.start / D) * 100}%`;
    el.style.width = `${((e.end - e.start) / D) * 100}%`;
    el.style.bottom = `${(i % 3) * 5}px`;
    el.style.background = `hsl(${hues[(i + 3) % hues.length]},90%,65%)`;
    bar.appendChild(el);
  });
  bar.addEventListener('click', (ev) => {
    const r = bar.getBoundingClientRect();
    card.seek(((ev.clientX - r.left) / r.width) * D);
  });

  const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  let paused = false;
  const marks = [];
  const markString = () => {
    const names = timing.sections.map((s) => s.name);
    const pts = [0, ...marks.filter((m) => m > 0.5)];
    const label = (i) => (pts.length === names.length ? names[i] : i === 0 ? 'intro' : `s${i + 1}`);
    return `--sections "${pts.map((t, i) => `${t.toFixed(2)}:${label(i)}`).join(',')}"`;
  };
  addEventListener('keydown', (ev) => {
    if (ev.target.closest?.('input,textarea')) return;
    const secs = timing.sections;
    const cur = ctx.section ? secs.indexOf(ctx.section) : 0;
    switch (ev.key) {
      case ' ': ev.preventDefault(); paused = !paused; paused ? card.pause() : card.play(); break;
      case 'ArrowRight': card.seek(ctx.t + (ev.shiftKey ? 10 : 2)); break;
      case 'ArrowLeft': card.seek(ctx.t - (ev.shiftKey ? 10 : 2)); break;
      case 'ArrowDown': if (secs[cur + 1]) card.seek(secs[cur + 1].start); break;
      case 'ArrowUp': card.seek(ctx.t - (ctx.section?.start ?? 0) > 1 ? ctx.section.start : secs[Math.max(0, cur - 1)]?.start ?? 0); break;
      case 'b': case 'B': card.seek(ctx.t - timing.spbar); break;
      case 'd': case 'D': root.classList.toggle('hidden'); break;
      case 'm': case 'M': {
        const raw = ctx.t, snapped = timing.snap(raw, 'bar');
        marks.push(Math.abs(snapped - raw) < timing.spbar * 0.3 ? snapped : raw);
        console.log('[debug] mark', fmt(raw), '→', markString());
        break;
      }
      case 'x': case 'X': marks.length = 0; break;
      case 'c': case 'C': navigator.clipboard?.writeText(markString()).catch(() => {}); console.log(markString()); break;
    }
  });

  card.addSystem({
    update(c) {
      head.style.left = `${(c.t / D) * 100}%`;
      const st = card.state();
      const L = c.levels;
      const meter = (v) => '█'.repeat(Math.round(v * 8)).padEnd(8, '·');
      info.textContent =
        `${fmt(c.t)} / ${fmt(D)}  ${st.clock}${st.audioBlocked ? ' (blocked)' : ''}${st.muted ? ' muted' : ''}  fps ${st.fps ?? '–'}  q:${st.quality}\n` +
        `section ${c.section?.name ?? '–'}  bar ${c.beat.bar} beat ${c.beat.beatInBar + 1}/${timing.meter}  ${timing.bpm.toFixed(1)} bpm\n` +
        `scenes  ${st.scenes.join(', ') || '–'}${st.failedScenes.length ? `  FAILED: ${st.failedScenes.join(', ')}` : ''}\n` +
        `bass ${meter(L.bass)} mid ${meter(L.mid)} tre ${meter(L.treble)} beat ${meter(L.beat)}` +
        (marks.length ? `\nmarks   ${marks.map(fmt).join('  ')}   (C copies --sections)` : '') +
        (st.errors.length ? `\nerrors  ${st.errors.slice(-2).join(' | ')}` : '');
    },
  }, 1000);
}
