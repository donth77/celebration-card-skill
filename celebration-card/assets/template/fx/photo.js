// DOM photo treatments — crisp, accessible, cheap on phones, and a fallback when WebGL is off.
//
//   const el = photoEl(item);                         // <figure> with <img> + caption
//   kenBurns(el.img, s.p, { focus: item.focus });     // slow push-in toward the faces
//   develop(el.img, seg(s.t, 0.2, 2.5));              // polaroid "developing" from white
//   const show = slideshow(container, photos);         // cross-fading DOM slideshow
//   show.update(slotFloat);                            // e.g. (s.t / secondsPerPhoto)

import { clamp, lerp, ease } from '../runtime/anim.js';

/** <figure class="photo"><img><figcaption></figure> for a content.photos item. */
export function photoEl(item, { className = 'photo', caption = true } = {}) {
  const fig = document.createElement('figure');
  fig.className = className;
  const img = new Image();
  img.decoding = 'async';
  img.src = item.src;
  img.alt = item.alt || item.caption || '';
  if (item.focus) img.style.objectPosition = `${item.focus[0] * 100}% ${item.focus[1] * 100}%`;
  fig.appendChild(img);
  if (caption && item.caption) {
    const cap = document.createElement('figcaption');
    cap.textContent = item.caption;
    fig.appendChild(cap);
  }
  fig.img = img;
  return fig;
}

/** Wait for images to decode (use in scene.init with ctx.track). */
export function decodeAll(imgs) {
  return Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
}

/** Ken Burns pan/zoom as a function of progress p (0..1). focus = [x, y] 0..1 (where the faces are). */
export function kenBurns(img, p, { focus = [0.5, 0.42], from = 1.04, to = 1.16, drift = 2.5 } = {}) {
  const e = ease.inOutSine(clamp(p));
  const sc = lerp(from, to, e);
  const dx = (0.5 - focus[0]) * drift * e, dy = (0.5 - focus[1]) * drift * e;
  img.style.transformOrigin = `${focus[0] * 100}% ${focus[1] * 100}%`;
  img.style.transform = `translate(${dx}%, ${dy}%) scale(${sc})`;
}

/** Polaroid-style develop: washed-out & soft → full colour and sharp, p 0..1. */
export function develop(img, p) {
  const k = 1 - ease.outCubic(clamp(p));
  img.style.filter = k < 0.01 ? '' : `brightness(${1 + k * 1.1}) saturate(${1 - k * 0.9}) sepia(${k * 0.5}) contrast(${1 - k * 0.35}) blur(${k * 3}px)`;
}

/** Cross-fading slideshow with Ken Burns. update(slot) where slot k = photo k (fractional = transition). */
export function slideshow(container, items, { fade = 0.18, kb = true } = {}) {
  container.classList.add('slideshow');
  const figs = items.map((it) => { const f = photoEl(it, { className: 'slide' }); container.appendChild(f); return f; });
  return {
    figs,
    update(slot) {
      const n = figs.length;
      figs.forEach((f, i) => {
        const local = slot - i; // 0..1 while photo i is current; it fades in on top during [-fade, 0)
        let op = local < -fade ? 0 : local < 0 ? (local + fade) / fade : local < 1 || i === n - 1 ? 1 : 0;
        if (i === 0 && local < 0) op = 1;
        f.style.opacity = op.toFixed(3);
        f.style.zIndex = String(i);
        if (kb && op > 0) kenBurns(f.img, clamp((local + fade) / (1 + fade)), { focus: items[i].focus || [0.5, 0.42] });
      });
    },
  };
}
