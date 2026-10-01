// EXAMPLE SCENE — the climax: big number on the downbeat, words on the next bar, and an
// interactive sky (tap to launch fireworks). Confetti/firework *bursts* are cues in main.js.

import { splitText, revealSpans, fitText } from '../fx/text.js';
import { seg, ease } from '../runtime/anim.js';

export const finale = {
  async init(ctx) {
    const c = ctx.content.finale;
    const el = (this.el = document.createElement('section'));
    el.className = 'scene scene--finale';
    el.hidden = true;
    el.innerHTML = '<div><p class="display display--xl finale__big glow"></p><p class="display finale__line"></p></div><p class="hint finale__hint"></p>';
    this.big = el.querySelector('.finale__big');
    this.big.textContent = c.big;
    this.lineEl = el.querySelector('.finale__line');
    this.lineEl.textContent = c.line;
    this.lineEl.style.fontSize = 'clamp(26px, 7vw, 56px)';
    this.hint = el.querySelector('.finale__hint');
    this.hint.textContent = c.hint || '';
    ctx.layers.dom.appendChild(el);
    this.words = splitText(this.lineEl, { by: 'words' });
    this.tDrop = ctx.at('finale');
    // Fireworks that spell text need the font loaded before sampling.
    await document.fonts?.load('900 200px "Fraunces"').catch(() => {});

    this.onTap = (e) => {
      if (e.cardHandled || e.target.closest?.('#ui, button, a, #keepsake, .lightbox')) return;
      ctx.fireworks?.burst({ x: e.clientX / innerWidth, y: e.clientY / innerHeight, type: Math.random() < 0.3 ? 'heart' : 'peony', size: 0.8 });
    };
  },
  enter(ctx) {
    this.el.hidden = false;
    requestAnimationFrame(() => fitText(this.big, { max: 260 }));
    addEventListener('pointerdown', this.onTap);
    ctx.bg?.set({ colors: [ctx.palette.bg, '#4a1a3f', '#ffc857', '#ff6b9a'], intensity: 1.35 }, 1.2);
  },
  update(ctx, s) {
    const tDrop = this.tDrop - s.start;
    const u = seg(s.t, tDrop, 0.9, ease.outBack);
    const pulse = ctx.reducedMotion ? 0 : ctx.levels.beat * 0.035;
    this.big.style.transform = `scale(${(0.25 + 0.75 * u) * (1 + pulse)})`;
    this.big.style.opacity = seg(s.t, tDrop - 0.1, 0.3).toFixed(3);
    revealSpans(this.words, s.t, { start: tDrop + ctx.timing.spbar, stagger: 0.12, dur: 0.8, from: { y: 0.5, opacity: 0, blur: 6 } });
    this.hint.style.opacity = (seg(s.t, tDrop + 3 * ctx.timing.spbar, 1) * s.out(1.5) * 0.85).toFixed(3);
    this.el.style.opacity = s.out(0.9).toFixed(3);
  },
  exit(ctx) {
    this.el.hidden = true;
    removeEventListener('pointerdown', this.onTap);
    ctx.bg?.set({ colors: [ctx.palette.bg, '#2a1450', '#7ae7ff', '#ff6b9a'], intensity: 0.8 }, 3);
  },
};
