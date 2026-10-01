// Fireworks on a transparent 2D layer: rockets, peony/ring/heart/willow/palm bursts, crackle,
// and bursts that form text or shapes ("30", "MAYA", a heart) before falling away.
//
//   const fw = fx.add(new Fireworks({ colors: ctx.palette.accents }));
//   fw.launch({ x: 0.3, y: 0.3, type: 'peony' });               // rocket rises, then bursts
//   fw.launch({ x: 0.5, y: 0.35, type: 'text', text: '30', font: '900 200px "Fraunces"', size: 1.2 });
//   fw.burst({ x: 0.7, y: 0.25, type: 'ring' });                // burst immediately, no rocket
//
// Land a burst exactly on a beat: schedule the cue one rise-time early, e.g.
//   cues: [{ at: 'chorus-1b', run: (ctx) => fw.launch({ x: .5, y: .3, rise: ctx.timing.spb }) }]
//
// Photosensitivity: bursts are local glows, never full-screen flashes. Keep it that way.

import { textPoints, shapes as SHAPES } from './points.js';

const TAU = Math.PI * 2;

export class Fireworks {
  constructor({ colors = ['#ffd166', '#ef476f', '#06d6a0', '#8ecae6', '#ffffff'], gravity = 1, onBurst = null, onLaunch = null } = {}) {
    this.colors = colors; this.gravity = gravity;
    this.onBurst = onBurst; this.onLaunch = onLaunch;
    this.rockets = []; this.sparks = []; this.flashes = [];
    this._pointsCache = new Map();
  }
  get alive() { return this.rockets.length + this.sparks.length + this.flashes.length > 0; }
  resize(w, h) { this.w = w; this.h = h; this.unit = Math.min(w, h) / 800; }
  clear() { this.rockets.length = this.sparks.length = this.flashes.length = 0; }
  _n(n) { return Math.max(8, Math.round(n * (this.layer?.particleScale ?? 1))); }
  _color() { return this.colors[Math.floor(Math.random() * this.colors.length)]; }

  /** Rocket from the bottom to (x, y), bursting after `rise` seconds. */
  launch(opts = {}) {
    const { x = 0.5, y = 0.3, from = null, rise = 1.0, delay = 0 } = opts;
    this.rockets.push({ x0: (from ?? x + (Math.random() - 0.5) * 0.08) * this.w, y0: this.h + 10, x1: x * this.w, y1: y * this.h, t: -delay, rise, opts, trail: [] });
  }

  /** Burst immediately at (x, y). */
  burst(opts = {}) { this._explode((opts.x ?? 0.5) * this.w, (opts.y ?? 0.35) * this.h, opts); }

  /** A quick salvo: n random bursts over `over` seconds. */
  salvo({ n = 6, over = 2.5, types = ['peony', 'ring', 'willow', 'peony', 'palm'], y = [0.18, 0.42] } = {}) {
    for (let i = 0; i < n; i++) {
      this.launch({ x: 0.15 + Math.random() * 0.7, y: y[0] + Math.random() * (y[1] - y[0]), type: types[i % types.length], delay: (i / n) * over, rise: 0.8 + Math.random() * 0.4 });
    }
  }

  _explode(px, py, o) {
    const type = o.type || 'peony';
    const color = o.color || this._color();
    const color2 = o.color2 || (Math.random() < 0.5 ? this._color() : color);
    const size = (o.size ?? 1) * this.unit;
    const v0 = 420 * size;
    this.onBurst?.({ x: px / this.w, y: py / this.h, type, size: o.size ?? 1 });
    this.flashes.push({ x: px, y: py, r: 90 * size, age: 0, color });

    const add = (vx, vy, extra = {}) => this.sparks.push({
      x: px, y: py, vx, vy, age: 0, life: 1.3 + Math.random() * 0.6, color, drag: 1.9, grav: 1, w: 2.2, ...extra,
    });

    if (type === 'text' || type === 'shape') {
      const pts = type === 'text' ? this._textPts(o.text || '♥', o.font, o.mode || 'fill') : (Array.isArray(o.points) ? o.points : SHAPES[o.shape || 'heart']());
      const span = (o.span ?? 0.62) * Math.min(this.w, this.h * 1.4) * (o.size ?? 1);
      const form = o.form ?? 0.7, hold = o.hold ?? 1.6;
      for (const p of pts) {
        const tx = px + p.x * span, ty = py + p.y * span;
        this.sparks.push({ x: px, y: py, sx: px, sy: py, tx, ty, form, hold, age: 0, life: form + hold + 1.4, color: Math.random() < 0.85 ? color : color2, drag: 1.4, grav: 1, w: 2.6, shape: true, tw: Math.random() * TAU });
      }
      return;
    }

    const n = this._n(o.count ?? (type === 'palm' ? 14 : type === 'willow' ? 110 : 140));
    for (let i = 0; i < n; i++) {
      let a = (i / n) * TAU + Math.random() * 0.05, v;
      switch (type) {
        case 'ring': v = v0 * 0.85; add(Math.cos(a) * v, Math.sin(a) * v * (o.tilt ?? 0.6), { life: 1.4 }); break;
        case 'heart': {
          const t = (i / n) * TAU;
          const hx = 16 * Math.sin(t) ** 3, hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
          add(hx * v0 * 0.055, hy * v0 * 0.055, { drag: 2.4, grav: 0.35, life: 1.6 }); break;
        }
        case 'willow': a = Math.random() * TAU; v = v0 * (0.3 + Math.random() * 0.6); add(Math.cos(a) * v, Math.sin(a) * v, { life: 2.6 + Math.random(), drag: 2.6, grav: 1.6, color: o.color || '#ffcf70', w: 1.6, trail: [] }); break;
        case 'palm': v = v0 * (0.9 + Math.random() * 0.2); add(Math.cos(a) * v, Math.sin(a) * v - v0 * 0.15, { life: 2.0, drag: 1.5, grav: 1.4, w: 3.2, trail: [] }); break;
        default: { // peony
          a = Math.random() * TAU; v = v0 * Math.sqrt(Math.random()) * (0.75 + Math.random() * 0.3);
          add(Math.cos(a) * v, Math.sin(a) * v, { color: Math.random() < 0.7 ? color : color2, crackle: o.crackle ?? Math.random() < 0.25 });
        }
      }
    }
  }

  _textPts(text, font, mode) {
    const key = `${text}|${font}|${mode}`;
    if (!this._pointsCache.has(key)) this._pointsCache.set(key, textPoints(text, { font: font || '900 200px system-ui, sans-serif', mode, max: Math.round(380 * (this.layer?.particleScale ?? 1) + 80) }));
    return this._pointsCache.get(key);
  }

  update(dt) {
    const g = 260 * this.unit * this.gravity;
    for (const r of this.rockets) {
      r.t += dt;
      if (r.t < 0) continue;
      if (!r.launched) { r.launched = true; this.onLaunch?.(r.opts); }
      const u = Math.min(1, r.t / r.rise);
      const e = 1 - Math.pow(1 - u, 2.2);
      r.x = r.x0 + (r.x1 - r.x0) * e;
      r.y = r.y0 + (r.y1 - r.y0) * e;
      r.trail.push([r.x, r.y]); if (r.trail.length > 10) r.trail.shift();
      if (u >= 1) { r.done = true; this._explode(r.x1, r.y1, r.opts); }
    }
    this.rockets = this.rockets.filter((r) => !r.done);

    const extra = [];
    for (const s of this.sparks) {
      s.age += dt;
      if (s.shape) {
        if (s.age < s.form) {
          const u = s.age / s.form, e = 1 - Math.pow(1 - u, 3);
          s.x = s.sx + (s.tx - s.sx) * e; s.y = s.sy + (s.ty - s.sy) * e;
          continue;
        }
        if (s.age < s.form + s.hold) { s.x = s.tx + Math.sin(s.age * 3 + s.tw) * 0.6; s.y = s.ty; continue; }
        if (!s.released) { s.released = true; s.vx = (Math.random() - 0.5) * 40 * this.unit; s.vy = Math.random() * 30 * this.unit; }
      }
      const damp = Math.exp(-s.drag * dt);
      s.vx *= damp; s.vy = s.vy * damp + g * s.grav * dt;
      if (s.trail) { s.trail.push([s.x, s.y]); if (s.trail.length > 14) s.trail.shift(); }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.crackle && !s.cracked && s.age > s.life * 0.65) {
        s.cracked = true;
        for (let k = 0; k < 3; k++) extra.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 120 * this.unit, vy: (Math.random() - 0.5) * 120 * this.unit, age: 0, life: 0.35, color: '#fffbe6', drag: 3, grav: 0.5, w: 1.4 });
      }
    }
    if (extra.length) this.sparks.push(...extra);
    this.sparks = this.sparks.filter((s) => s.age < s.life);
    for (const f of this.flashes) f.age += dt;
    this.flashes = this.flashes.filter((f) => f.age < 0.35);
  }

  draw(g, dpr) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (const f of this.flashes) {
      const a = 1 - f.age / 0.35;
      const grd = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      grd.addColorStop(0, `rgba(255,250,235,${0.55 * a})`);
      grd.addColorStop(0.35, hexA(f.color, 0.25 * a));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
    for (const r of this.rockets) {
      if (r.t < 0 || !r.trail.length) continue;
      for (let i = 1; i < r.trail.length; i++) {
        g.globalAlpha = (i / r.trail.length) * 0.8;
        g.strokeStyle = '#ffe2a8'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(...r.trail[i - 1]); g.lineTo(...r.trail[i]); g.stroke();
      }
    }
    for (const s of this.sparks) {
      const lifeLeft = 1 - s.age / s.life;
      const flicker = lifeLeft < 0.3 ? 0.55 + 0.45 * Math.sin(s.age * 60 + s.x) : 1;
      g.globalAlpha = Math.max(0, Math.min(1, lifeLeft * 1.4)) * flicker;
      g.strokeStyle = s.color;
      g.lineWidth = s.w * (0.5 + lifeLeft * 0.7);
      g.beginPath();
      if (s.trail && s.trail.length > 1) {
        g.moveTo(...s.trail[0]);
        for (const p of s.trail) g.lineTo(p[0], p[1]);
      } else {
        const k = s.shape && !s.released ? 0 : 0.035;
        g.moveTo(s.x - (s.vx || 0) * k, s.y - (s.vy || 0) * k);
        g.lineTo(s.x + 0.01, s.y + 0.01);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
