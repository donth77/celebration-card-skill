// Kinetic typography helpers. All reveals are pure functions of time, so they scrub and seek.
//
//   const spans = splitText(titleEl, { by: 'chars' });
//   // in scene.update(ctx, s):
//   revealSpans(spans, s.t, { start: 0.4, stagger: 0.05, dur: 0.7, from: { y: 0.8, blur: 10 } });
//   fitText(nameEl, { max: 220 });          // long names still fit on a phone

import { clamp, ease as E } from 'card/runtime/anim.js';

/** Split an element's text into spans (chars or words). Keeps the full text for screen readers. */
export function splitText(el, { by = 'chars', className = 'sp' } = {}) {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const spans = [];
  const words = text.split(/(\s+)/);
  for (const w of words) {
    if (/^\s+$/.test(w)) { el.appendChild(document.createTextNode(w)); continue; }
    if (by === 'words') {
      const s = document.createElement('span');
      s.className = className; s.textContent = w; s.setAttribute('aria-hidden', 'true');
      s.style.display = 'inline-block';
      el.appendChild(s); spans.push(s);
    } else {
      const word = document.createElement('span');
      word.style.display = 'inline-block'; word.style.whiteSpace = 'nowrap'; word.setAttribute('aria-hidden', 'true');
      for (const ch of Array.from(w)) {
        const s = document.createElement('span');
        s.className = className; s.textContent = ch; s.style.display = 'inline-block';
        word.appendChild(s); spans.push(s);
      }
      el.appendChild(word);
    }
  }
  spans.forEach((s, i) => s.style.setProperty('--i', i));
  return spans;
}

/**
 * Style spans for time t: each span animates from `from` to rest over `dur`, staggered.
 * from: { y (em), x (em), opacity, blur (px), scale, rotate (deg) }. Returns overall 0..1 progress.
 * Pass `out: { start, stagger, dur, to: {...} }` to animate them away again.
 */
export function revealSpans(spans, t, { start = 0, stagger = 0.04, dur = 0.7, ease = E.outCubic, from = { y: 0.6, opacity: 0, blur: 8 }, out = null } = {}) {
  let done = 0;
  spans.forEach((s, i) => {
    let u = ease(clamp((t - start - i * stagger) / dur));
    let fromState = from, k = 1 - u;
    if (out && t >= out.start) {
      const v = (out.ease || E.inCubic)(clamp((t - out.start - i * (out.stagger ?? stagger)) / (out.dur ?? dur)));
      fromState = out.to || from; k = v; u = 1 - v;
    }
    const y = (fromState.y ?? 0) * k, x = (fromState.x ?? 0) * k;
    const sc = 1 + ((fromState.scale ?? 1) - 1) * k, rot = (fromState.rotate ?? 0) * k;
    const op = 1 + ((fromState.opacity ?? 0) - 1) * k;
    const bl = (fromState.blur ?? 0) * k;
    s.style.transform = `translate(${x}em, ${y}em) scale(${sc}) rotate(${rot}deg)`;
    s.style.opacity = op.toFixed(3);
    s.style.filter = bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : '';
    done += u;
  });
  return spans.length ? done / spans.length : 1;
}

/**
 * Shrink-to-fit: largest font-size (px) between min and max at which the text fits.
 * Width defaults to the content box of the enclosing .scene (or the viewport) — not the parent,
 * which in a centred layout shrinks to fit its content.
 */
export function fitText(el, { min = 18, max = 240, lines = 1, width = null } = {}) {
  let maxW = width;
  if (!maxW) {
    const box = el.closest('.scene') || document.documentElement;
    const cs = getComputedStyle(box);
    maxW = (box.clientWidth || innerWidth) - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  }
  maxW *= 0.96;
  let lo = min, hi = max;
  el.style.whiteSpace = lines === 1 ? 'nowrap' : 'normal';
  // Measure the text itself (a Range), not the element box — a block's box is as wide as its container.
  const range = document.createRange();
  const textWidth = () => { range.selectNodeContents(el); return range.getBoundingClientRect().width; };
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = `${mid}px`;
    let fits = textWidth() <= maxW;
    if (fits && lines > 1) {
      // tight display line-heights let glyphs overflow, so allow at least 1.3em per line
      const lh = Math.max(parseFloat(getComputedStyle(el).lineHeight) || 0, mid * 1.3);
      fits = el.scrollHeight <= lh * lines + 2;
    }
    if (fits) lo = mid; else hi = mid;
  }
  el.style.fontSize = `${Math.floor(lo)}px`;
  return lo;
}

/** Typewriter: show the first n characters at time t (characters per second). */
export function typewriter(el, text, t, { start = 0, cps = 26, caret = true } = {}) {
  const n = clamp(Math.floor((t - start) * cps), 0, text.length);
  el.textContent = text.slice(0, n);
  el.classList.toggle('is-typing', caret && n < text.length && t >= start);
  return n / text.length;
}

/** Count up a number (e.g. "30 years", "10,950 days together") as a function of time. */
export function countUp(el, to, t, { start = 0, dur = 2, from = 0, format = (v) => Math.round(v).toLocaleString(), ease = E.outExpo } = {}) {
  const v = from + (to - from) * ease(clamp((t - start) / dur));
  el.textContent = format(v);
  return v;
}
