// Photos (and muted video clips) as framed cards in 3D space, with a camera that glides from
// one to the next. Layouts: 'corridor' (walk past photos on both walls), 'helix' (orbit a
// spiral), 'constellation' (photos as stars around you, joined by lines as the story unfolds),
// 'wall' (a gallery wall; zoom between photos, end on the whole wall).
//
//   const gallery = new Gallery3D(stage, content.photos, { layout: 'constellation', frame: 'polaroid' });
//   await gallery.load(ctx.track);                    // in scene.init
//   // in scene.update: position -1 = establishing shot, 0..N-1 = each photo, N = closing shot
//   gallery.setPosition(holdTravel(slot, 0.35), drift);
//   gallery.update(ctx);
//
// Items: { src, caption?, video?, aspect? }. Captions render in the polaroid margin.

import * as THREE from 'three';
import { rng, clamp, ease, fract } from '../runtime/anim.js';
import { glowTexture } from './stage3d.js';

/**
 * Map a continuous "slot" coordinate (photo k owns slot [k, k+1)) to a camera position that
 * travels during the first `travel` fraction of each slot and then holds on the photo.
 * Slot 0 travels in from the establishing shot (-1).
 */
export function holdTravel(slot, travel = 0.35, fn = ease.inOutCubic) {
  const k = Math.floor(slot);
  return k - 1 + fn(clamp(fract(slot) / travel));
}

export class Gallery3D {
  constructor(stage, items, opts = {}) {
    this.stage = stage;
    this.items = items || [];
    this.o = {
      layout: 'corridor', frame: 'polaroid', frameColor: '#fbf8f1', captionColor: '#2a2a2a',
      captionFont: '500 64px "Caveat", "Bradley Hand", "Segoe Print", cursive',
      tilt: 3.5, seed: 7, fill: 0.74, bob: 0.03, parallax: 1, glow: '#ffffff', lines: '#ffffff',
      ...opts,
    };
    this.group = new THREE.Group();
    stage.scene.add(this.group);
    this.cards = [];
    this._keys = null; this._aspect = 0;
    this.pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    this.pos = -1;
    addEventListener('pointermove', (e) => { this.pointer.x = (e.clientX / innerWidth) * 2 - 1; this.pointer.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  }

  get count() { return this.cards.length; }
  set visible(v) { this.group.visible = v; }
  get visible() { return this.group.visible; }

  async load(track = (p) => p) {
    if (this.o.frame === 'polaroid' && document.fonts) await document.fonts.load(this.o.captionFont).catch(() => {});
    const R = rng(this.o.seed);
    const results = await Promise.allSettled(this.items.map((item) => track(this._texture(item))));
    results.forEach((r, i) => {
      const item = this.items[i];
      const { tex, aspect, video, videoTex } = r.status === 'fulfilled' ? r.value : { tex: null, aspect: item.aspect || 4 / 3 };
      if (r.status !== 'fulfilled') console.warn(`[gallery3d] couldn't load ${item.src || item.video}`, r.reason);
      const card = this._makeCard(tex, aspect, item, R, video);
      if (video && videoTex && tex !== videoTex) {
        video.addEventListener('playing', () => { card.photoMat.map = videoTex; card.photoMat.needsUpdate = true; }, { once: true });
      }
      this.cards.push(card);
    });
    this._place();
    return this;
  }

  async _texture(item) {
    if (item.video) {
      const v = document.createElement('video');
      Object.assign(v, { src: item.video, muted: true, loop: true, playsInline: true, preload: 'auto' });
      v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      // Show the poster until the clip actually plays (iOS Low Power Mode refuses autoplay).
      const poster = item.poster ? await this.stage.loadTexture(item.poster).catch(() => null) : null;
      await new Promise((res) => { v.addEventListener('loadedmetadata', res, { once: true }); v.addEventListener('error', res, { once: true }); setTimeout(res, 5000); });
      const videoTex = this.stage.videoTexture(v);
      const aspect = v.videoWidth ? v.videoWidth / v.videoHeight : poster ? poster.image.width / poster.image.height : item.aspect || 16 / 9;
      return { tex: poster || videoTex, aspect, video: v, videoTex };
    }
    const tex = await this.stage.loadTexture(item.src);
    return { tex, aspect: tex.image.width / tex.image.height };
  }

  _makeCard(tex, aspect, item, R, video) {
    const max = 1.6;
    const w = aspect >= 1 ? max : max * aspect, h = aspect >= 1 ? max / aspect : max;
    const g = new THREE.Group();
    const photoMat = tex ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshBasicMaterial({ color: 0x777777 });
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(w, h), photoMat);
    let fw = w, fh = h;
    if (this.o.frame === 'polaroid') {
      const m = 0.07, bottom = item.caption ? 0.34 : 0.1;
      fw = w + m * 2; fh = h + m + bottom;
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshBasicMaterial({ color: this.o.frameColor, toneMapped: false }));
      g.add(frame);
      photo.position.set(0, (bottom - m) / 2, 0.004);
      if (item.caption) {
        const cap = new THREE.Mesh(new THREE.PlaneGeometry(fw, bottom), new THREE.MeshBasicMaterial({ map: this._captionTexture(item.caption, fw, bottom), transparent: true, toneMapped: false }));
        cap.position.set(0, -fh / 2 + bottom / 2 + 0.005, 0.004);
        g.add(cap);
      }
    } else if (this.o.frame === 'clean') {
      fw = w + 0.04; fh = h + 0.04;
      g.add(new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshBasicMaterial({ color: this.o.frameColor, toneMapped: false })));
      photo.position.z = 0.004;
    }
    g.add(photo);
    if (this.o.layout === 'constellation') {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(128, this.o.glow), blending: THREE.AdditiveBlending, transparent: true, opacity: 0.35, depthWrite: false }));
      glow.scale.set(fw * 2.2, fh * 2.2, 1); glow.position.z = -0.05;
      g.add(glow);
    } else {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(fw * 1.25, fh * 1.25), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.5, depthWrite: false }));
      sh.position.set(0.04, -0.06, -0.03);
      g.add(sh);
    }
    g.rotation.z = THREE.MathUtils.degToRad((R() - 0.5) * 2 * this.o.tilt);
    g.userData.spin = g.rotation.z;
    this.group.add(g);
    return { mesh: g, w: fw, h: fh, item, video, photoMat, phase: R() * 6.28 };
  }

  _captionTexture(text, fw, bh) {
    const W = 1024, H = Math.round((W * bh) / fw);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    let size = parseFloat(/(\d+)px/.exec(this.o.captionFont)?.[1] || 64) * 1.4;
    const font = (s) => this.o.captionFont.replace(/\d+px/, `${Math.round(s)}px`);
    g.font = font(size);
    while (g.measureText(text).width > W * 0.88 && size > 20) { size -= 2; g.font = font(size); }
    g.fillStyle = this.o.captionColor; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, H * 0.5);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  _place() {
    const N = this.cards.length, L = this.o.layout, R = rng(this.o.seed + 11);
    this.cards.forEach((c, i) => {
      const m = c.mesh;
      if (L === 'helix') {
        const a = i * 0.95, y = (i - (N - 1) / 2) * 0.62;
        m.position.set(Math.sin(a) * 3.3, y, Math.cos(a) * 3.3);
        m.rotation.y = a;
      } else if (L === 'constellation') {
        const yv = N > 1 ? 0.42 - (0.84 * i) / (N - 1) : 0;
        const a = i * 2.39996;
        const r = Math.sqrt(1 - yv * yv);
        const dir = new THREE.Vector3(Math.sin(a) * r, yv, -Math.cos(a) * r).normalize();
        m.position.copy(dir.multiplyScalar(7));
        m.lookAt(0, 0, 0);
        m.rotateZ(c.mesh.userData.spin);
      } else if (L === 'wall') {
        const cols = Math.max(1, Math.ceil(Math.sqrt(N * 1.6)));
        const rows = Math.ceil(N / cols);
        const col = i % cols, row = Math.floor(i / cols);
        m.position.set((col - (cols - 1) / 2) * 2.15 + (R() - 0.5) * 0.2, ((rows - 1) / 2 - row) * 2.3 + (R() - 0.5) * 0.2, (R() - 0.5) * 0.3);
      } else { // corridor
        const side = i % 2 ? 1 : -1;
        m.position.set(side * 1.55, (R() - 0.5) * 0.35, -i * 2.7);
        m.rotation.y = -side * 0.62;
      }
      c.base = m.position.clone();
    });
    if (L === 'constellation') this._constellationExtras();
    this._keys = null;
  }

  _constellationExtras() {
    const R = rng(this.o.seed + 3);
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, r = 30 + R() * 30, s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * s * r, u * r, Math.sin(a) * s * r], i * 3);
    }
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ size: 0.16, map: glowTexture(64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }));
    this.group.add(stars);
    const pts = this.cards.map((c) => c.mesh.position.clone().multiplyScalar(1.04)); // just behind each card
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    lineGeo.setDrawRange(0, 0);
    this.lines = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: this.o.lines, transparent: true, opacity: 0.45 }));
    this.group.add(this.lines);
  }

  _fitDistance(c) {
    const cam = this.stage.camera, t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    return Math.max(c.h / 2 / t, c.w / 2 / (t * cam.aspect)) / this.o.fill;
  }

  _keyframes() {
    const cam = this.stage.camera;
    if (this._keys && this._aspect === cam.aspect) return this._keys;
    this._aspect = cam.aspect;
    const keys = this.cards.map((c) => {
      const dir = new THREE.Vector3(); c.mesh.getWorldDirection(dir);
      const look = c.base.clone();
      return { pos: look.clone().add(dir.multiplyScalar(this._fitDistance(c))), look };
    });
    if (!keys.length) keys.push({ pos: new THREE.Vector3(0, 0, 6), look: new THREE.Vector3() });
    const first = keys[0], last = keys[keys.length - 1];
    const back = (k, amount, up) => {
      const v = k.pos.clone().sub(k.look);
      return { pos: k.look.clone().add(v.multiplyScalar(amount)).add(new THREE.Vector3(0, up, 0)), look: k.look.clone() };
    };
    let intro = back(first, 2.6, 0.7), outro = back(last, 2.2, 0.6);
    if (this.o.layout === 'wall' || this.o.layout === 'helix') {
      const box = new THREE.Box3(); this.cards.forEach((c) => box.expandByPoint(c.base));
      const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
      const d = Math.max((size.y + 2.4) / 2 / t, (size.x + 2.4) / 2 / (t * cam.aspect)) * 1.05;
      outro = { pos: center.clone().add(new THREE.Vector3(0, 0.3, d + (this.o.layout === 'helix' ? 4 : 0))), look: center };
    }
    if (this.o.layout === 'constellation') {
      intro = { pos: new THREE.Vector3(0, 0, 0.5), look: first.look.clone().multiplyScalar(1.6) };
      outro = { pos: new THREE.Vector3(0, 0.8, 1.2), look: last.look.clone().multiplyScalar(1.4) };
    }
    this._keys = [intro, ...keys, outro];
    return this._keys;
  }

  /** Place the camera. pos: -1 (intro shot) … N (outro shot); fractions glide between. drift 0..1 slowly dollies in. */
  setPosition(pos, drift = 0) {
    const keys = this._keyframes();
    const N = this.cards.length;
    pos = clamp(pos, -1, N);
    this.pos = pos;
    const i = Math.floor(pos), u = pos - i;
    const a = keys[clamp(i + 1, 0, keys.length - 1)], b = keys[clamp(i + 2, 0, keys.length - 1)];
    const cam = this.stage.camera;
    const look = a.look.clone().lerp(b.look, u);
    let p;
    if (this.o.layout === 'helix') {
      const ca = Math.atan2(a.pos.x, a.pos.z), cb = Math.atan2(b.pos.x, b.pos.z);
      let d = cb - ca; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const ang = ca + d * u;
      const ra = Math.hypot(a.pos.x, a.pos.z), rb = Math.hypot(b.pos.x, b.pos.z);
      const r = ra + (rb - ra) * u + Math.sin(Math.PI * u) * 0.8;
      p = new THREE.Vector3(Math.sin(ang) * r, a.pos.y + (b.pos.y - a.pos.y) * u, Math.cos(ang) * r);
    } else {
      p = a.pos.clone().lerp(b.pos, u);
      if (this.o.layout === 'wall') p.z += Math.sin(Math.PI * u) * 2.2;
      if (this.o.layout === 'corridor') p.y += Math.sin(Math.PI * u) * 0.15;
    }
    // slow dolly toward the subject while holding
    if (drift) p.lerp(look, Math.min(0.12, drift * 0.12));
    // pointer parallax
    const P = this.pointer;
    const right = new THREE.Vector3().subVectors(look, p).cross(new THREE.Vector3(0, 1, 0)).normalize();
    p.addScaledVector(right, P.sx * 0.12 * this.o.parallax).add(new THREE.Vector3(0, -P.sy * 0.08 * this.o.parallax, 0));
    cam.position.copy(p);
    cam.lookAt(look);

    if (this.lines) this.lines.geometry.setDrawRange(0, clamp(Math.floor(pos + 1.0001) + 1, 0, N));
    for (let k = 0; k < N; k++) {
      const v = this.cards[k].video;
      if (!v) continue;
      const near = Math.abs(pos - k) < 0.8 && this.visible;
      if (near && v.paused) v.play().catch(() => {});
      if (!near && !v.paused) v.pause();
    }
  }

  /** Idle motion + pointer smoothing; call every frame from the scene. */
  update(ctx) {
    const P = this.pointer, k = 1 - Math.exp(-ctx.dt * 4);
    P.sx += (P.x - P.sx) * k; P.sy += (P.y - P.sy) * k;
    if (ctx.reducedMotion) return;
    for (const c of this.cards) {
      c.mesh.position.y = c.base.y + Math.sin(ctx.wall * 0.8 + c.phase) * this.o.bob;
    }
  }

  /** Pause any videos (call on scene exit). */
  pauseVideos() { this.cards.forEach((c) => c.video?.pause()); }
}

let _shadow = null;
function shadowTexture() {
  if (_shadow) return _shadow;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 26; g.shadowOffsetX = S;
  g.fillStyle = '#000'; g.fillRect(-S + 34, 34, S - 68, S - 68);
  _shadow = new THREE.CanvasTexture(c);
  return _shadow;
}
