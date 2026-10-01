// A 2D canvas that effects (confetti, fireworks, sparkles…) draw into every frame.
// Register it with the card as a system: card.addSystem(layer, 50) or systems: [layer].
//
//   const fx = new FxLayer('#fx');
//   const confetti = fx.add(new Confetti({ colors: ctx.palette.accents }));
//   confetti.burst({ x: 0.5, y: 0.7 });

export class FxLayer {
  constructor(canvas, { dprCap = 2 } = {}) {
    this.canvas = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
    this.g = this.canvas.getContext('2d');
    this.dprCap = dprCap;
    this.effects = [];
    this._dirty = true;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width || innerWidth);
    this.h = Math.max(1, r.height || innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    for (const e of this.effects) e.resize?.(this.w, this.h);
  }
  add(effect) {
    effect.layer = this;
    effect.resize?.(this.w, this.h);
    this.effects.push(effect);
    return effect;
  }
  /** Scale particle budgets with the card's quality tier (call from main.js: fx.quality = ctx.quality). */
  get particleScale() { return this.quality?.particles ?? 1; }
  update(ctx) {
    if (ctx.quality) this.quality = ctx.quality;
    const busy = this.effects.some((e) => e.alive);
    if (!busy && !this._dirty) return;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const e of this.effects) {
      e.update(ctx.dt, ctx);
      e.draw(g, this.dpr, ctx);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    this._dirty = busy;
  }
  clear() { for (const e of this.effects) e.clear?.(); this._dirty = true; }
}
