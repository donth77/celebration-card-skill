// Glossy 3D balloons that never pass through each other.
//
// Layouts
//   'bouquet' (default) — balloons tied in bunches to anchor points (e.g. beside a cake), strings
//                         converging on the anchor. Bunches sway and fly away as a unit.
//   'float'             — free balloons rising in separate vertical lanes (no two lanes overlap,
//                         so neither balloons nor hanging strings can cross each other).
// Placement guarantees spacing, and a per-frame separation pass resolves any residual contact
// from bobbing, beat pulses or inflating. Motion is a function of time (seekable); pops are state.
//
//   const balloons = new Balloons3D(stage, { count: 12, colors: ctx.palette.accents });
//   balloons.update(ctx, { appear: seg(t, start, 6), lift: seg(t, finale, 8) });   // every frame
//   const hit = balloons.pick(e.clientX, e.clientY); if (hit?.pop()) confetti.burst(balloons.screenPos(hit));

import * as THREE from 'three';
import { rng, noise1, clamp, ease } from '../runtime/anim.js';

const H = 1.24;        // balloon height in local units (knot at y=0, top at y=H)
const RADIUS = 0.6;    // collision sphere radius (local units), centred at y = H/2 — covers the tall axis
let _geo = null;
function balloonGeometry() {
  if (_geo) return _geo;
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = -Math.PI / 2 + t * Math.PI;
    const r = Math.cos(a) * (0.5 + 0.06 * Math.sin(a)) * (t < 0.12 ? 0.55 + 3.75 * t : 1);
    pts.push(new THREE.Vector2(Math.max(0.015, r), Math.sin(a) * (H / 2) + H / 2));
  }
  _geo = new THREE.LatheGeometry(pts, 40);
  return _geo;
}

const UP = new THREE.Vector3(0, 1, 0);

export class Balloons3D {
  /**
   * count, colors, seed, scale (overall size), strings (bool)
   * layout: 'bouquet' | 'float'
   * anchors: Vector3[] for bouquets (default: two bunches either side of the origin, behind it)
   * height: string length from anchor to the bunch (bouquet)
   * area: for 'float' — { x: [inner, outer] half-widths, z: [near, far], y: [low, high] resting heights }
   */
  constructor(stage, { count = 12, colors = ['#ff6b9a', '#ffc857', '#7ae7ff', '#b48cff'], seed = 5, scale = 0.7, strings = true, layout = 'bouquet', anchors = null, height = 2.2, area = null, weights = true } = {}) {
    this.stage = stage;
    this.layout = layout;
    this.group = new THREE.Group();
    stage.scene.add(this.group);
    this.items = [];
    this.raycaster = new THREE.Raycaster();
    const R = rng(seed);
    const aspect = stage.camera.aspect || 1;

    // Sizes first; placing the biggest first packs better.
    const sizes = Array.from({ length: count }, () => (0.8 + R() * 0.4) * scale).sort((a, b) => b - a);
    const placed = []; // centres + radii (+ string segments) for spacing checks
    const fits = (c, r, gap = 1.06) => placed.every((p) => p.c.distanceTo(c) >= (p.r + r) * gap);
    // A balloon must not sit across another balloon's string, and its own string must clear the others.
    const segDist = (pt, a, b) => { const ab = b.clone().sub(a), t = clamp(pt.clone().sub(a).dot(ab) / ab.lengthSq()); return a.clone().addScaledVector(ab, t).distanceTo(pt); };
    const stringsClear = (c, r, anchor) => {
      const knot = c.clone().addScaledVector(c.clone().sub(anchor).normalize(), -r);
      return placed.every((p) => (!p.knot || segDist(c, p.anchor, p.knot) >= r * 1.05) && segDist(p.c, anchor, knot) >= p.r * 1.05);
    };

    if (layout === 'bouquet') {
      const side = Math.min(3.2, Math.max(1.55, aspect * 2.6));
      this.anchors = (anchors || [new THREE.Vector3(-side, 0, -1.3), new THREE.Vector3(side, 0, -1.7)]).map((a) => a.clone());
      sizes.forEach((s, i) => {
        const b = i % this.anchors.length;
        const top = this.anchors[b].clone().add(new THREE.Vector3(0, height, 0));
        const r = RADIUS * s;
        let center = null;
        for (let k = 0; k < 400 && !center; k++) {
          const spread = 0.35 + (k / 400) * 1.4; // widen the search if the bunch is crowded
          const th = R() * Math.PI * 2, rho = Math.sqrt(R()) * spread;
          const c = top.clone().add(new THREE.Vector3(Math.cos(th) * rho, (R() - 0.3) * spread * 0.9, Math.sin(th) * rho * 0.8));
          if (fits(c, r) && stringsClear(c, r, this.anchors[b])) center = c;
        }
        if (!center) return; // no room left: skip it rather than intersect
        const knot = center.clone().addScaledVector(center.clone().sub(this.anchors[b]).normalize(), -r);
        placed.push({ c: center, r, anchor: this.anchors[b], knot });
        this.items.push(this._make(i, s, colors, R, strings, { bunch: b, offset: center.clone().sub(this.anchors[b]) }));
      });
    } else {
      const A = { x: [0.9, Math.min(5, Math.max(2.2, aspect * 3.2))], z: [-0.6, -4], y: [1.4, 3.6], ...(area || {}) };
      sizes.forEach((s, i) => {
        const r = RADIUS * s + 0.12; // + sway allowance
        let lane = null;
        for (let k = 0; k < 400 && !lane; k++) {
          const x = (i % 2 ? 1 : -1) * (A.x[0] + R() * (A.x[1] - A.x[0]));
          const z = A.z[0] + R() * (A.z[1] - A.z[0]);
          const c = new THREE.Vector3(x, 0, z); // lanes are vertical: compare in xz only
          if (fits(c, r, 1.04)) lane = c;
        }
        if (!lane) return;
        placed.push({ c: lane, r });
        this.items.push(this._make(i, s, colors, R, strings, { lane, rest: A.y[0] + R() * (A.y[1] - A.y[0]) }));
      });
    }
    if (this.items.length < count) console.info(`[balloons3d] placed ${this.items.length}/${count} balloons without overlap`);
    this._c = this.items.map(() => new THREE.Vector3());
    // Little gift-box weights so the bouquet strings are visibly tied to something.
    this.weights = layout === 'bouquet' && weights ? this.anchors.map((a, i) => {
      const w = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.26), new THREE.MeshStandardMaterial({ color: colors[(i + 1) % colors.length], roughness: 0.5 }));
      const rib = new THREE.MeshStandardMaterial({ color: 0xfff4e0, roughness: 0.4 });
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.225, 0.05), rib), r2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.225, 0.27), rib);
      w.add(box, r1, r2);
      w.position.copy(a).add(new THREE.Vector3(0, 0.11, 0));
      this.group.add(w);
      return w;
    }) : [];
  }

  _make(i, s, colors, R, strings, extra) {
    const color = new THREE.Color(colors[i % colors.length]);
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.4, sheenColor: color.clone().offsetHSL(0, 0, 0.2) });
    const g = new THREE.Group();
    const body = new THREE.Mesh(balloonGeometry(), mat);
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.09, 12), mat);
    knot.position.y = -0.02; knot.rotation.x = Math.PI;
    g.add(body, knot);
    this.group.add(g);
    let line = null;
    if (strings) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
      line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
      line.frustumCulled = false;
      this.group.add(line);
    }
    const item = { g, body, mat, line, s, popped: false, popAt: 0, delay: R() * 0.6, seed: R() * 100, len: 1.7 + R() * 0.6, k: 1, scale: s, ...extra };
    item.pop = () => this._pop(item);
    return item;
  }

  set visible(v) { this.group.visible = v; }

  _pop(it) {
    if (it.popped) return false;
    it.popped = true; it.popAt = performance.now();
    return true;
  }

  /** Un-pop everything (call when the scene restarts / on replay). */
  reset() { this.items.forEach((it) => { it.popped = false; it.g.visible = true; if (it.line) it.line.visible = true; }); }

  /**
   * appear: 0..1 — balloons inflate in, staggered ('float': rise from below the frame instead).
   * lift: 0..1 — bunches / balloons fly up and away.
   */
  update(ctx, { appear = 1, lift = 0, floor = -3.6, top = 12 } = {}) {
    const t = ctx.wall, sway = ctx.reducedMotion ? 0 : 1;
    const beat = 1 + (ctx.levels?.beat ?? 0) * 0.015;
    const L = ease.inQuad(clamp(lift));
    const C = this._c;

    // 1) ideal centres and scales
    this.items.forEach((it, i) => {
      const k = clamp((appear - it.delay * 0.5) / 0.5);
      if (this.layout === 'bouquet') {
        it.k = ease.outBack(k);
        it.scale = it.s * Math.max(0.001, it.k) * beat;
        const a = this.anchors[it.bunch];
        it.anchor = a.clone().add(new THREE.Vector3(0, L * top, 0));
        const rot = new THREE.Euler(noise1(t * 0.25 + it.bunch * 7) * 0.05 * sway, 0, noise1(t * 0.3 + it.bunch * 3) * 0.06 * sway);
        const off = it.offset.clone().multiplyScalar(1 + L * 0.35).applyEuler(rot); // bunch sways as one
        C[i].copy(it.anchor).add(off);
        C[i].addScaledVector(off.normalize(), Math.sin(t * 1.3 + it.seed) * 0.025 * sway);
      } else {
        it.k = ease.outCubic(k);
        it.scale = it.s * beat;
        const y = floor + (it.rest - floor) * it.k + L * (top - it.rest) * (0.8 + 0.4 * (it.seed % 1));
        C[i].set(it.lane.x + noise1(t * 0.35 + it.seed) * 0.1 * sway, y + Math.sin(t * 1.1 + it.seed) * 0.06 * sway + (H / 2) * it.s, it.lane.z);
      }
    });

    this.weights?.forEach((w, b) => { w.position.y = this.anchors[b].y + 0.11 + L * top; });

    // 2) separation pass: push apart any pair whose collision spheres overlap
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < this.items.length; i++) {
        const A = this.items[i];
        if (A.popped || A.scale < 0.05) continue;
        for (let j = i + 1; j < this.items.length; j++) {
          const B = this.items[j];
          if (B.popped || B.scale < 0.05) continue;
          const min = (RADIUS * A.scale + RADIUS * B.scale) * 1.02;
          const d = C[i].distanceTo(C[j]);
          if (d < min && d > 1e-6) {
            const push = C[j].clone().sub(C[i]).multiplyScalar((min - d) / d / 2);
            C[i].sub(push); C[j].add(push);
          }
        }
      }
    }

    // 3) transforms, strings, pops
    this.items.forEach((it, i) => {
      const center = C[i];
      const axis = this.layout === 'bouquet' ? center.clone().sub(it.anchor).normalize() : UP.clone();
      const knot = center.clone().addScaledVector(axis, -(H / 2) * it.scale);
      it.g.position.copy(knot);
      it.g.quaternion.setFromUnitVectors(UP, axis);
      it.g.rotateY(t * 0.2 + it.seed);
      let s = it.scale;
      if (it.popped) {
        const k = clamp((performance.now() - it.popAt) / 120);
        s *= 1 + k * 0.5;
        it.g.visible = k < 1;
      }
      it.g.scale.setScalar(s);
      if (it.line) {
        it.line.visible = !it.popped && it.scale > 0.05;
        const pos = it.line.geometry.attributes.position;
        const end = this.layout === 'bouquet' ? it.anchor : knot.clone().add(new THREE.Vector3(0, -it.len, 0));
        for (let p = 0, n = pos.count; p < n; p++) {
          const u = p / (n - 1);
          const bow = Math.sin(u * Math.PI);
          pos.setXYZ(p,
            knot.x + (end.x - knot.x) * u + bow * 0.05 * Math.sin(t + it.seed) * sway,
            knot.y + (end.y - knot.y) * u - bow * 0.06,
            knot.z + (end.z - knot.z) * u);
        }
        pos.needsUpdate = true;
        it.line.material.opacity = 0.55 * clamp(it.k);
      }
    });
  }

  /** Raycast a screen point; returns the balloon under it (not yet popped) or null. */
  pick(clientX, clientY) {
    const el = this.stage.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - el.left) / el.width) * 2 - 1, -((clientY - el.top) / el.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    const live = this.items.filter((it) => !it.popped && it.g.visible && it.scale > 0.2);
    const hits = this.raycaster.intersectObjects(live.map((it) => it.body), false);
    return hits.length ? live.find((it) => it.body === hits[0].object) || null : null;
  }

  /** A balloon's centre in 0..1 screen coordinates (for a confetti burst at the pop). */
  screenPos(it) {
    const i = this.items.indexOf(it);
    const v = (this._c[i] || it.g.position).clone().project(this.stage.camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }
}
