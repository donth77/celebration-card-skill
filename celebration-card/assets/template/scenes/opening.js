// EXAMPLE SCENE — the title reveal. Replace with your concept's opening.
// Pattern: build DOM in init, show/hide in enter/exit, animate purely from s.t in update,
// and anchor key moments to the music with ctx.at('section+Nbar').

import { splitText, revealSpans, fitText } from 'card/fx/text.js';
import { seg, ease } from 'card/runtime/anim.js';

export const opening = {
  init(ctx) {
    const c = ctx.content.opening;
    const el = (this.el = document.createElement('section'));
    el.className = 'scene scene--opening';
    el.hidden = true;
    el.innerHTML = '<div class="opening__inner"><p class="kicker"></p><h1 class="display display--l opening__title glow"></h1><p class="display display--xl opening__name glow"></p></div>';
    el.querySelector('.kicker').textContent = c.kicker;
    el.querySelector('.opening__title').textContent = c.title;
    this.nameEl = el.querySelector('.opening__name');
    this.nameEl.textContent = c.name;
    ctx.layers.dom.appendChild(el);
    this.kicker = el.querySelector('.kicker');
    this.title = splitText(el.querySelector('.opening__title'));
    this.name = splitText(this.nameEl);
    // Musical anchors (absolute seconds)
    this.tTitle = ctx.at('intro+1bar');
    this.tName = ctx.at('intro+2bar');
  },
  enter() {
    this.el.hidden = false;
    requestAnimationFrame(() => fitText(this.nameEl, { max: 230 }));
  },
  update(ctx, s) {
    const t = s.t;
    this.kicker.style.opacity = seg(t, 1.2, 0.9).toFixed(3);
    revealSpans(this.title, t, { start: this.tTitle - s.start - 0.5, stagger: 0.06, dur: 0.9, from: { y: 0.7, opacity: 0, blur: 12 } });
    revealSpans(this.name, t, { start: this.tName - s.start, stagger: 0.1, dur: 1.1, ease: ease.outBack, from: { y: 0.35, scale: 0.3, opacity: 0, blur: 8 } });
    const pulse = ctx.reducedMotion ? 0 : ctx.levels.beat * 0.02;
    this.nameEl.style.transform = `scale(${1 + pulse})`;
    const out = s.out(1.0);
    this.el.style.opacity = out.toFixed(3);
    this.el.style.transform = `translateY(${((1 - out) * -40).toFixed(1)}px)`;
  },
  exit() { this.el.hidden = true; },
};
