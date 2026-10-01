// EXAMPLE SCENE — the letter arrives during the outro and stays as the keepsake.
// The letter DOM lives in #keepsake (built by keepsake.js); this scene only animates it in.
// When the show ends, the runtime reveals the rest of the keepsake (gallery, replay, credits).

import { seg, ease } from 'card/runtime/anim.js';

export const letter = {
  init() {
    this.ks = document.getElementById('keepsake');
    this.card = this.ks.querySelector('.letter');
    this.lines = [...this.card.children];
  },
  enter() {
    this.ks.hidden = false;
  },
  update(ctx, s) {
    const u = ease.outCubic(seg(s.t, 0.2, 1.4));
    this.card.style.opacity = u.toFixed(3);
    this.card.style.transform = ctx.reducedMotion ? '' : `perspective(900px) translateY(${((1 - u) * 70).toFixed(1)}px) rotateX(${((1 - u) * 28).toFixed(2)}deg)`;
    // Lines appear one by one; reading continues on the keepsake after the music ends.
    this.lines.forEach((line, i) => { line.style.opacity = seg(s.t, 0.9 + i * 0.9, 0.9).toFixed(3); });
  },
  exit() {
    if (!this.ks.classList.contains('is-visible')) this.ks.hidden = true;
    this.lines.forEach((l) => (l.style.opacity = ''));
  },
};
