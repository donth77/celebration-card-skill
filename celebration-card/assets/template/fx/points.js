// Turn text or shapes into point clouds — for fireworks that spell a name, particles that
// gather into a number, constellations shaped like a heart, etc.
// Points are normalised: centred on 0,0, largest dimension spans -0.5..0.5.

/**
 * Sample points from rendered text. Make sure the font is loaded first:
 *   await document.fonts.load('900 200px "Fraunces"');
 *   const pts = textPoints('30', { font: '900 200px "Fraunces"', mode: 'outline' });
 */
export function textPoints(text, { font = '900 200px system-ui, sans-serif', mode = 'fill', step = 0, max = 420 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = font;
  const m = g.measureText(text);
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] || 200);
  const w = Math.ceil(m.width + size * 0.2), h = Math.ceil(size * 1.3);
  c.width = w; c.height = h;
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.fillText(text, w / 2, h / 2);
  return rasterPoints(g, w, h, { mode, step: step || Math.max(2, Math.round(size / 42)), max });
}

/** Sample points from a Path2D / SVG path string (drawn into a box of `size` px). */
export function pathPoints(path, { size = 200, viewBox = [0, 0, 100, 100], mode = 'fill', step = 4, max = 420 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  const [vx, vy, vw, vh] = viewBox;
  const s = size / Math.max(vw, vh);
  g.setTransform(s, 0, 0, s, -vx * s, -vy * s);
  g.fillStyle = '#fff';
  g.fill(typeof path === 'string' ? new Path2D(path) : path);
  return rasterPoints(g, size, size, { mode, step, max });
}

function rasterPoints(g, w, h, { mode, step, max }) {
  const data = g.getImageData(0, 0, w, h).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 128;
  const pts = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (!on(x, y)) continue;
      if (mode === 'outline' && on(x - step, y) && on(x + step, y) && on(x, y - step) && on(x, y + step)) continue;
      pts.push([x, y]);
    }
  }
  return normalise(thin(pts, max), w, h);
}

function thin(pts, max) {
  if (pts.length <= max) return pts;
  const out = [];
  const k = pts.length / max;
  for (let i = 0; i < max; i++) out.push(pts[Math.floor(i * k)]);
  return out;
}

function normalise(pts, w, h) {
  if (!pts.length) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, s = Math.max(x1 - x0, y1 - y0) || 1;
  return pts.map(([x, y]) => ({ x: (x - cx) / s, y: (y - cy) / s }));
}

/** Built-in shapes as outline point lists. */
export const shapes = {
  heart(n = 90) {
    return normalise(Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
    }), 0, 0);
  },
  star(n = 100, points = 5, inner = 0.45) {
    const verts = Array.from({ length: points * 2 }, (_, i) => {
      const a = (i * Math.PI) / points - Math.PI / 2, r = i % 2 ? inner : 1;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    const out = [];
    for (let i = 0; i < n; i++) {
      const f = (i / n) * verts.length, k = Math.floor(f), u = f - k;
      const a = verts[k], b = verts[(k + 1) % verts.length];
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    return normalise(out, 0, 0);
  },
  circle(n = 80) { return normalise(Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2), Math.sin((i / n) * Math.PI * 2)]), 0, 0); },
  ring(n = 80) { return shapes.circle(n); },
};
