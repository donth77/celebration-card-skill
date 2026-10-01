// Confetti with real-feeling physics: bursts that slow in the air, paper that flips and
// flutters down, two-tone shading, ribbons, stars, hearts and emoji.
//
//   const confetti = fx.add(new Confetti({ colors: ctx.palette.accents }));
//   confetti.burst({ x: 0.5, y: 0.65, count: 160 });        // x/y are 0..1 of the canvas
//   confetti.cannons({ count: 90 });                         // from both bottom corners
//   confetti.rain({ duration: 5, rate: 70 });                // gentle fall from the top
//   confetti.burst({ shapes: ['heart'], colors: ['#ff4d6d', '#ffb3c1'] });
//   confetti.burst({ shapes: [{ emoji: '🎂' }, { emoji: '🎉' }], count: 30, scale: 2 });

import { mixColor } from '../runtime/anim.js';

const TAU = Math.PI * 2;

export class Confetti {
  constructor({ colors = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#ffffff'], shapes = ['rect', 'rect', 'rect', 'circle', 'ribbon', 'star'], gravity = 1, drag = 1, scale = 1, max = 1200 } = {}) {
    this.colors = colors; this.shapes = shapes;
    this.gravity = gravity; this.drag = drag; this.scale = scale; this.max = max;
    this.p = []; this.rains = [];
    this._dark = new Map();
    this._emoji = new Map();
  }
  get alive() { return this.p.length > 0 || this.rains.length > 0; }
  resize(w, h) { this.w = w; this.h = h; this.unit = Math.min(w, h) / 800; }
  clear() { this.p.length = 0; this.rains.length = 0; }
  _count(n) { return Math.max(1, Math.round(n * (this.layer?.particleScale ?? 1))); }
  _dk(c) { if (!this._dark.has(c)) this._dark.set(c, mixColor(c, '#000000', 0.32)); return this._dark.get(c); }

  _spawn(x, y, vx, vy, opts) {
    if (this.p.length >= this.max) this.p.shift();
    const shapes = opts.shapes || this.shapes, colors = opts.colors || this.colors;
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const size = (7 + Math.random() * 7) * (opts.scale ?? 1) * this.scale * Math.max(0.75, this.unit);
    this.p.push({
      x, y, vx, vy, shape, size,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 9,
      tilt: Math.random() * TAU, vt: 4 + Math.random() * 8,
      wob: Math.random() * TAU, vw: 2 + Math.random() * 3,
      age: 0, life: opts.life ?? 6 + Math.random() * 3,
      fall: 0.75 + Math.random() * 0.5,
    });
  }

  /** Explosion from a point. angle: direction in degrees (90 = up). spread: cone width (degrees). */
  burst({ x = 0.5, y = 0.6, count = 140, angle = 90, spread = 75, speed = 1, ...opts } = {}) {
    const n = this._count(count);
    const px = x * this.w, py = y * this.h;
    const v0 = 1250 * this.unit * speed;
    for (let i = 0; i < n; i++) {
      const a = ((angle + (Math.random() - 0.5) * spread) * Math.PI) / 180;
      const v = v0 * (0.45 + Math.random() * 0.75);
      this._spawn(px, py, Math.cos(a) * v, -Math.sin(a) * v, opts);
    }
  }

  /** Two cannons from the bottom corners, aimed up and inward. */
  cannons({ count = 90, y = 1.02, spread = 40, speed = 1.15, ...opts } = {}) {
    this.burst({ x: -0.02, y, count, angle: 62, spread, speed, ...opts });
    this.burst({ x: 1.02, y, count, angle: 118, spread, speed, ...opts });
  }

  /** Gentle rain from above for `duration` seconds at `rate` pieces per second. */
  rain({ duration = 4, rate = 60, ...opts } = {}) { this.rains.push({ left: duration, rate: rate * (this.layer?.particleScale ?? 1), acc: 0, opts }); }

  update(dt) {
    for (const r of this.rains) {
      r.left -= dt; r.acc += r.rate * dt;
      while (r.acc >= 1) { r.acc -= 1; this._spawn(Math.random() * this.w, -20, (Math.random() - 0.5) * 60, 40 + Math.random() * 80, r.opts); }
    }
    this.rains = this.rains.filter((r) => r.left > 0);
    const g = 1100 * this.unit * this.gravity;
    const k = 2.4 * this.drag;
    const damp = Math.exp(-k * dt);
    for (const q of this.p) {
      q.age += dt;
      q.vy += g * dt * q.fall;
      q.vx *= damp; q.vy *= damp;
      q.wob += q.vw * dt; q.tilt += q.vt * dt; q.rot += q.vr * dt;
      q.x += (q.vx + Math.sin(q.wob) * 40 * this.unit) * dt;
      q.y += q.vy * dt;
    }
    this.p = this.p.filter((q) => q.y < this.h + 60 && q.age < q.life);
  }

  draw(g, dpr) {
    for (const q of this.p) {
      const flip = Math.cos(q.tilt);
      const fade = Math.min(1, (q.life - q.age) / 0.6);
      g.globalAlpha = Math.max(0, fade);
      const c = Math.cos(q.rot), s = Math.sin(q.rot);
      const sy = q.shape === 'circle' ? 1 : flip;
      const sx = q.shape === 'circle' ? flip : 1;
      g.setTransform(dpr * c * sx, dpr * s * sx, -dpr * s * sy, dpr * c * sy, dpr * q.x, dpr * q.y);
      g.fillStyle = flip < 0 ? this._dk(q.color) : q.color;
      const z = q.size;
      if (typeof q.shape === 'object' && q.shape.emoji) this._drawEmoji(g, q.shape.emoji, z * 1.6);
      else switch (q.shape) {
        case 'circle': g.beginPath(); g.arc(0, 0, z * 0.38, 0, TAU); g.fill(); break;
        case 'ribbon': g.fillRect(-z * 0.12, -z * 0.9, z * 0.24, z * 1.8); break;
        case 'star': star(g, z * 0.55); break;
        case 'heart': heart(g, z * 0.6); break;
        default: g.fillRect(-z * 0.5, -z * 0.3, z, z * 0.6);
      }
    }
    g.globalAlpha = 1;
  }

  _drawEmoji(g, ch, size) {
    let img = this._emoji.get(ch);
    if (!img) {
      img = document.createElement('canvas');
      img.width = img.height = 96;
      const c2 = img.getContext('2d');
      c2.font = '80px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      c2.textAlign = 'center'; c2.textBaseline = 'middle';
      c2.fillText(ch, 48, 54);
      this._emoji.set(ch, img);
    }
    g.drawImage(img, -size / 2, -size / 2, size, size);
  }
}

function star(g, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}
function heart(g, r) {
  g.beginPath();
  g.moveTo(0, r * 0.35);
  g.bezierCurveTo(-r * 1.1, -r * 0.35, -r * 0.45, -r * 1.05, 0, -r * 0.45);
  g.bezierCurveTo(r * 0.45, -r * 1.05, r * 1.1, -r * 0.35, 0, r * 0.35);
  g.fill();
}
