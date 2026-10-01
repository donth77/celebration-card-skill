// Timed lyric captions (karaoke style) — a pure function of song time, so they scrub and seek.
// Only show lyrics you could actually time (word timestamps from Whisper/ElevenLabs, or lines
// marked by ear); mistimed lyrics feel worse than none.
//
//   content.lyrics = [{ t: 31.6, text: 'Every morning, every evening' },
//                     { t: 35.4, text: "Ain't we got fun?", words: [{ t: 35.4, w: "Ain't" }, { t: 35.7, w: 'we' }, …] }]
//   const lyr = lyricCaptions(ctx.layers.dom, content.lyrics);   // in a scene's init (or main.js)
//   lyr.update(ctx);                                              // every frame (or card.addSystem(lyr))
//   lyr.update(ctx, { visible: false });                          // hide during scenes that have their own text

export function lyricCaptions(container, lines = [], { lead = 0.2, hold = 4.5, className = 'lyrics' } = {}) {
  const el = document.createElement('p');
  el.className = className;
  el.setAttribute('aria-live', 'polite');
  container.appendChild(el);
  const sorted = [...lines].sort((a, b) => a.t - b.t);
  let shown = -1;
  const render = (i) => {
    el.textContent = '';
    if (i < 0) return;
    const line = sorted[i];
    if (line.words?.length) {
      line.words.forEach((w, k) => {
        const span = document.createElement('span');
        span.textContent = (k ? ' ' : '') + w.w;
        span.dataset.t = w.t;
        el.appendChild(span);
      });
    } else el.textContent = line.text;
  };
  return {
    el,
    update(ctx, { visible = true } = {}) {
      const t = ctx.t;
      // current line = last line that has started (with a small lead so it appears just before it's sung)
      let i = -1;
      for (let k = 0; k < sorted.length; k++) if (sorted[k].t - lead <= t) i = k; else break;
      const line = sorted[i];
      const end = line ? Math.min(sorted[i + 1]?.t ?? Infinity, line.t + (line.hold ?? hold)) : 0;
      const on = visible && line && t < end;
      if (i !== shown) { render(i); shown = i; }
      const fadeIn = line ? Math.min(1, (t - (line.t - lead)) / 0.25) : 0;
      const fadeOut = line ? Math.min(1, (end - t) / 0.3) : 0;
      el.style.opacity = on ? Math.max(0, Math.min(fadeIn, fadeOut)).toFixed(3) : '0';
      if (line?.words) for (const span of el.children) span.classList.toggle('is-sung', Number(span.dataset.t) <= t);
    },
  };
}
