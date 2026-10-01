// Time-based animation helpers.
//
// Write every animation as a pure function of time (s.t / ctx.t), never by accumulating
// per-frame deltas. That is what lets the card seek, pause, replay and be screenshotted at
// any moment (?t=42&freeze) and stay locked to the music even when frames drop.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (a === b ? (x >= b ? 1 : 0) : clamp((x - a) / (b - a)));
export const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));
export const smoothstep = (a, b, x) => { const t = invLerp(a, b, x); return t * t * (3 - 2 * t); };
export const fract = (x) => x - Math.floor(x);

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

/** Eased 0→1 progress of `t` through the window [start, start + dur]. */
export const seg = (t, start, dur, fn = ease.linear) => fn(clamp((t - start) / dur));

/** 0→1→0 envelope: rises over `inDur` from `start`, holds, falls over `outDur` ending at `end`. */
export const envelope = (t, start, end, inDur = 0.5, outDur = 0.5, fn = ease.inOutSine) =>
  Math.min(fn(clamp((t - start) / inDur)), fn(clamp((end - t) / outDur)));

/** Beat pulse: 1.0 exactly on the beat, decaying toward 0 through the beat. `phase` is 0..1. */
export const pulse = (phase, sharpness = 5) => Math.exp(-phase * sharpness);

/** Start time for item i of n when staggering over `spread` seconds. */
export const stagger = (i, n, spread) => (n <= 1 ? 0 : (i / (n - 1)) * spread);

/** Deterministic PRNG (mulberry32). Same seed → same "random" layout every run and every seek. */
export function rng(seed = 1) {
  let a = typeof seed === 'string' ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 7) : seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  return next;
}

/** Smooth value noise in 1D, handy for organic drift: noise1(t * 0.3 + seed). Range -1..1. */
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}

// ---- colour ----
export function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
export const mixColor = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => lerp(v, B[i], t))); };
export const rgba = (hex, alpha = 1) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${alpha})`; };
