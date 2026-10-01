// EXAMPLE SCENE — no photos needed: a 3D birthday cake with number candles for the milestone,
// glossy balloons drifting up with the music (tap to pop), and an interactive "make a wish"
// moment: blow into the mic (or tap) to put the candles out. If the viewer doesn't, the
// candles go out by themselves on the lift into the finale, so the story stays on the beat.
//
// Musical anchors: verse1 = reveal + orbit · verse2 = "make a wish" · lift = auto blow-out ·
// finale = camera tilts up as the balloons fly away · outro = fade out.

import * as THREE from 'three';
import { getStage, glowTexture } from 'card/fx/stage3d.js';
import { Balloons3D } from 'card/fx/balloons3d.js';
import { listenForBlow } from 'card/fx/mic.js';
import { seg, ease, lerp, clamp, noise1, rng } from 'card/runtime/anim.js';

const FONT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r186/examples/fonts/helvetiker_bold.typeface.json';

export const wish = {
  async init(ctx) {
    this.ctx = ctx;
    this.stage = await getStage(ctx); // shared by every 3D scene in the card
    this.buildDom(ctx);
    if (!this.stage) return; // no WebGL: the DOM prompt still works (see update)
    // Everything this scene owns (lights included) lives in one group, so other 3D scenes
    // sharing the stage aren't lit or cluttered by it.
    const scene = (this.group = new THREE.Group());
    this.group.visible = false;
    this.stage.scene.add(this.group);

    scene.add(new THREE.HemisphereLight(0xd9c8ff, 0x2a1450, 0.7));
    const key = (this.key = new THREE.DirectionalLight(0xfff0dd, 1.4));
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 1.1);
    rim.position.set(-2, 3, -5);
    scene.add(rim);
    this.candleLight = new THREE.PointLight(0xffb05c, 6, 7, 2);
    this.candleLight.position.set(0, 1.9, 0.3);
    scene.add(this.candleLight);

    this.cake = await buildCake(ctx);
    scene.add(this.cake.group);
    this.balloons = new Balloons3D(this.stage, { count: ctx.quality.name === 'low' ? 8 : 14, colors: ctx.palette.accents });
    scene.add(this.balloons.group); // re-parent into this scene's group
    this.sparkles = makeSparkles(ctx);
    scene.add(this.sparkles);
    this.stage.prime(this.group); // compile shaders + upload textures now, not on the first frame (not awaited)

    // anchors (absolute seconds)
    this.tA = ctx.at('verse1');
    this.tWish = ctx.at('verse2');
    this.tAuto = ctx.at('lift');
    this.tFinale = ctx.at('finale');
    this.userBlowAt = null;
    this.pointer = { x: 0, y: 0 };

    this.onPointer = (e) => {
      if (e.target.closest?.('#ui, button, a, #keepsake, .lightbox')) return;
      const hit = this.balloons.pick(e.clientX, e.clientY);
      if (hit && hit.pop()) {
        e.cardHandled = true;
        const p = this.balloons.screenPos(hit);
        ctx.confetti?.burst({ x: p.x, y: p.y, count: 40, spread: 360, speed: 0.55, colors: ['#' + hit.mat.color.getHexString(), '#ffffff'] });
        ctx.sfx?.pop();
      }
    };
    this.onMove = (e) => { this.pointer.x = (e.clientX / innerWidth) * 2 - 1; this.pointer.y = (e.clientY / innerHeight) * 2 - 1; };
  },

  buildDom(ctx) {
    const el = (this.el = document.createElement('section'));
    el.className = 'scene scene--wish';
    el.hidden = true;
    el.innerHTML = `
      <div class="wish__prompt">
        <p class="display wish__title">Make a wish…</p>
        <button class="pill wish__btn is-interactive" type="button">🎂 Blow out the candles</button>
        <p class="wish__sub">tap, then blow into your mic — or tap again</p>
      </div>
      <p class="display wish__done glow">Wish made ✨</p>`;
    ctx.layers.dom.appendChild(el);
    this.prompt = el.querySelector('.wish__prompt');
    this.done = el.querySelector('.wish__done');
    this.sub = el.querySelector('.wish__sub');
    this.btn = el.querySelector('.wish__btn');
    this.btn.addEventListener('click', async () => {
      if (this.userBlowAt != null || ctx.t >= this.tAuto) return;
      if (this.listening) return this.blow(); // second tap
      this.listening = true;
      this.sub.textContent = 'blow into your mic… (or tap again)';
      this.mic = await listenForBlow({ onBlow: () => this.blow(), onLevel: (v) => { this.micLevel = v; } });
      if (!this.mic) this.blow(); // no mic / permission denied → tapping counts
    });
  },

  blow() {
    if (this.userBlowAt != null) return;
    const ctx = this.ctx;
    this.userBlowAt = ctx.t;
    this.mic?.stop();
    this.afterBlow();
  },

  afterBlow() {
    const ctx = this.ctx;
    ctx.sfx?.blow();
    setTimeout(() => {
      ctx.sfx?.sparkle();
      const p = this.stage ? this.project(new THREE.Vector3(0, 1.6, 0)) : { x: 0.5, y: 0.45 };
      ctx.confetti?.burst({ x: p.x, y: p.y, count: 120, spread: 100, speed: 0.9 });
    }, 450);
  },

  project(v) {
    const p = v.clone().project(this.stage.camera);
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
  },

  enter(ctx, s) {
    this.el.hidden = false;
    if (ctx.t < this.tWish) { this.userBlowAt = null; this.listening = false; this.sub.textContent = 'tap, then blow into your mic — or tap again'; }
    if (this.stage) {
      this.group.visible = true;
      const cam = this.stage.camera;
      if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); }
      if (ctx.t < this.tA + 1) this.balloons.reset();
    }
    addEventListener('pointerdown', this.onPointer);
    addEventListener('pointermove', this.onMove, { passive: true });
  },

  update(ctx, s) {
    const t = ctx.t;
    const blowAt = this.userBlowAt ?? this.tAuto;
    const lit = t < blowAt;
    // Auto blow-out happens on the lift if the viewer didn't do it (fires once, forward playback only).
    if (this.userBlowAt == null && this._prevT != null && this._prevT < this.tAuto && t >= this.tAuto && t - this._prevT < 0.5) this.afterBlow();
    this._prevT = t;

    // DOM: prompt during verse2 until blown; "wish made" for a few seconds after.
    const promptOn = seg(t, this.tWish + 0.3, 0.8) * (lit ? 1 : 0);
    this.prompt.style.opacity = promptOn.toFixed(3);
    this.prompt.style.visibility = promptOn > 0.01 ? 'visible' : 'hidden';
    this.prompt.style.transform = `translateY(${((1 - promptOn) * 16).toFixed(1)}px)`;
    // "Wish made" yields to the finale: it never shares the screen with the next big moment.
    const doneOn = lit ? 0 : seg(t, blowAt + 0.5, 0.6, ease.outBack) * (1 - seg(t, blowAt + 3.2, 0.8)) * (1 - seg(t, this.tFinale - 0.4, 0.35));
    this.done.style.opacity = clamp(doneOn).toFixed(3);
    this.done.style.transform = `scale(${(0.7 + 0.3 * doneOn).toFixed(3)})`;

    if (!this.stage) return;
    // Ask the shared stage to render this frame; opacity is a pure function of scene time.
    this.stage.show(this, s.fade(1.2, 1.6));

    // Camera choreography
    const pA = seg(t, this.tA, this.tWish - this.tA, ease.inOutSine);
    const pB = seg(t, this.tWish, this.tAuto - this.tWish, ease.inOutSine);
    // Tilt up to the sky starting on the lift, so the cake is already low in frame when the
    // finale's big number lands on the downbeat (the two "30"s never stack on top of each other).
    const pD = seg(t, this.tAuto, (this.tFinale - this.tAuto) + 1.4, ease.inOutCubic);
    const motion = ctx.reducedMotion ? 0.3 : 1;
    const cam = this.stage.camera;
    // Frame the cake for any screen shape: distance that fits ~3.6 units wide and ~3 units tall.
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const fit = Math.max(1.5 / tanH, 1.85 / (tanH * cam.aspect));
    const angle = (lerp(-0.6, 0.25, pA) + 0.18 * pB + 0.25 * pD) * motion + this.pointer.x * 0.06;
    const radius = fit * (lerp(1.3, 1.0, pA) - 0.22 * pB + 0.55 * pD);
    const height = lerp(1.0, 1.7, pA) + 0.5 * pB + 2.6 * pD - this.pointer.y * 0.08;
    const lookY = lerp(0.55, 0.7, pA) + 0.4 * pB + 4.4 * pD;
    const shake = ctx.reducedMotion ? 0 : 0.02;
    cam.position.set(Math.sin(angle) * radius + noise1(ctx.wall * 0.7) * shake, height + noise1(ctx.wall * 0.6 + 9) * shake, Math.cos(angle) * radius);
    cam.lookAt(0, lookY, 0);

    // Flames, glow, smoke
    const C = this.cake;
    C.flames.forEach((f, i) => {
      const flick = 1 + noise1(ctx.wall * 9 + i * 3.1) * 0.14 + (this.micLevel || 0) * 0.25 * Math.sin(ctx.wall * 40 + i);
      const out = lit ? 0 : seg(t, blowAt + i * 0.06, 0.18);
      const k = 1 - out;
      f.flame.scale.set(0.12 * k * (1 + (this.micLevel || 0) * 0.3), 0.27 * flick * k, 1);
      f.flame.position.x = f.base.x + noise1(ctx.wall * 3 + i) * 0.012 + (this.micLevel || 0) * 0.03;
      f.glow.material.opacity = 0.55 * k * (0.85 + 0.15 * flick);
      f.smoke.forEach((puff, j) => {
        const age = t - blowAt - j * 0.18 - i * 0.05;
        const on = !lit && age > 0 && age < 2.6;
        puff.visible = on;
        if (on) {
          puff.position.set(f.base.x + Math.sin(age * 2.2 + j) * 0.06 * age, f.base.y + 0.05 + age * 0.38, f.base.z);
          const sc = 0.08 + age * 0.22;
          puff.scale.set(sc, sc, 1);
          puff.material.opacity = 0.32 * (1 - age / 2.6);
        }
      });
    });
    const litness = lit ? 1 : 1 - seg(t, blowAt, 0.35);
    this.candleLight.intensity = 6 * litness * (0.9 + 0.1 * noise1(ctx.wall * 8));
    this.key.intensity = lerp(1.0, 1.5, litness) * (1 + 0.15 * pD);
    C.pool.material.opacity = 0.32 * litness + 0.06;

    // Balloons rise during verse1, fly away in the finale.
    this.balloons.update(ctx, { appear: seg(t, this.tA + 0.4, 7), lift: seg(t, this.tFinale, 9) });
    this.sparkles.rotation.y = ctx.wall * 0.05;
    this.sparkles.material.opacity = 0.6 + 0.4 * ctx.levels.beat;
  },

  exit(ctx) {
    this.el.hidden = true;
    removeEventListener('pointerdown', this.onPointer);
    removeEventListener('pointermove', this.onMove);
    this.mic?.stop();
    if (this.group) this.group.visible = false;
  },
};

// ---------------------------------------------------------------- cake construction
async function buildCake(ctx) {
  const group = new THREE.Group();
  const P = ctx.palette;
  const pink = new THREE.Color(P.accents[1] || '#ff6b9a').lerp(new THREE.Color('#ffffff'), 0.25);
  const cream = new THREE.Color('#fff3e2');
  const gold = new THREE.Color(P.accents[0] || '#ffc857');
  const R = rng(11);

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.42, 0.08, 64), new THREE.MeshStandardMaterial({ color: 0xe9e6f2, metalness: 0.9, roughness: 0.22 }));
  plate.position.y = 0.04;
  group.add(plate);

  const tier = (r, h, y, color, dripColor) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 64), mat);
    body.position.y = y + h / 2;
    group.add(body);
    const icing = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.05, 64), new THREE.MeshStandardMaterial({ color: dripColor, roughness: 0.35 }));
    icing.position.y = y + h - 0.02;
    group.add(icing);
    // drips: capsules hanging from the top edge
    const n = Math.round(r * 26);
    const drips = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.045, 1, 4, 8), new THREE.MeshStandardMaterial({ color: dripColor, roughness: 0.35 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.08;
      const len = 0.05 + R() * 0.16;
      pos.set(Math.cos(a) * (r + 0.01), y + h - len / 2 - 0.01, Math.sin(a) * (r + 0.01));
      sc.set(1, len, 1);
      m.compose(pos, q.identity(), sc);
      drips.setMatrixAt(i, m);
    }
    group.add(drips);
    // pearls around the base
    const pn = Math.round(r * 30);
    const pearls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshStandardMaterial({ color: gold, metalness: 0.7, roughness: 0.25 }), pn);
    for (let i = 0; i < pn; i++) {
      const a = (i / pn) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * (r + 0.02), y + 0.045, Math.sin(a) * (r + 0.02));
      pearls.setMatrixAt(i, m);
    }
    group.add(pearls);
    return y + h;
  };
  const top1 = tier(1.15, 0.62, 0.08, pink, cream);
  const top2 = tier(0.78, 0.5, top1, cream, pink);

  // sprinkles on top
  const sn = 70;
  const sprinkles = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.012, 0.05, 2, 6), new THREE.MeshStandardMaterial({ roughness: 0.4 }), sn);
  const m = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < sn; i++) {
    const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 0.7;
    e.set(Math.PI / 2, 0, R() * Math.PI);
    m.compose(new THREE.Vector3(Math.cos(a) * rr, top2 + 0.012, Math.sin(a) * rr), q.setFromEuler(e), one);
    sprinkles.setMatrixAt(i, m);
    sprinkles.setColorAt(i, new THREE.Color(P.accents[i % P.accents.length]));
  }
  group.add(sprinkles);

  // candles: number candles for the milestone (e.g. "30"), else classic striped candles
  const flames = [];
  const tips = [];
  const digits = ctx.content.milestone != null ? String(ctx.content.milestone) : '';
  let made = false;
  if (digits && digits.length <= 3) {
    try {
      const [{ FontLoader }, { TextGeometry }] = await Promise.all([import('three/addons/loaders/FontLoader.js'), import('three/addons/geometries/TextGeometry.js')]);
      const font = await ctx.track(new FontLoader().loadAsync(FONT_URL));
      const mat = new THREE.MeshStandardMaterial({ color: gold, metalness: 0.85, roughness: 0.28 });
      const w = 0.42, gap = 0.06, total = digits.length * w + (digits.length - 1) * gap;
      [...digits].forEach((d, i) => {
        const geo = new TextGeometry(d, { font, size: 0.5, depth: 0.12, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.012, bevelSegments: 3 });
        geo.computeBoundingBox();
        geo.center();
        const h = geo.boundingBox.max.y - geo.boundingBox.min.y;
        const mesh = new THREE.Mesh(geo, mat);
        const x = -total / 2 + w / 2 + i * (w + gap);
        mesh.position.set(x, top2 + h / 2 + 0.02, 0.05);
        group.add(mesh);
        tips.push(new THREE.Vector3(x, top2 + h + 0.02, 0.05));
      });
      made = true;
    } catch (err) { console.warn('[wish] number candles unavailable, using classic candles', err); }
  }
  if (!made) {
    const stripes = stripeTexture(P.accents[1] || '#ff6b9a');
    const geo = new THREE.CylinderGeometry(0.035, 0.035, 0.42, 16);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const c = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5 }));
      c.position.set(Math.cos(a) * 0.42, top2 + 0.21, Math.sin(a) * 0.42);
      group.add(c);
      tips.push(new THREE.Vector3(c.position.x, top2 + 0.42, c.position.z));
    }
  }
  const wickGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6);
  const wickMat = new THREE.MeshBasicMaterial({ color: 0x2b2118 });
  const flameTex = flameTexture(), glowTex = glowTexture(128, '#ffb45a'), smokeTex = glowTexture(64, '#bfb8c8');
  for (const tip of tips) {
    const wick = new THREE.Mesh(wickGeo, wickMat);
    wick.position.copy(tip).add(new THREE.Vector3(0, 0.03, 0));
    group.add(wick);
    const base = tip.clone().add(new THREE.Vector3(0, 0.17, 0));
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flame.position.copy(base);
    flame.center.set(0.5, 0.25);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    glow.position.copy(base); glow.scale.set(0.9, 0.9, 1);
    const smoke = [0, 1, 2, 3].map(() => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true, opacity: 0 }));
      s.visible = false; group.add(s); return s;
    });
    group.add(glow, flame);
    flames.push({ flame, glow, smoke, base });
  }

  // warm pool of candle light on the "table" + a soft contact shadow
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: glowTexture(256, '#ffcf8a'), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.001;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: glowTexture(128, '#000000'), transparent: true, opacity: 0.55, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002;
  group.add(pool, shadow);
  group.position.y = -0.2;
  return { group, flames, pool };
}

function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 92, 2, 32, 80, 60);
  grd.addColorStop(0, 'rgba(255,255,240,1)'); grd.addColorStop(0.18, 'rgba(255,236,170,0.95)');
  grd.addColorStop(0.45, 'rgba(255,160,60,0.65)'); grd.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(46, 40, 58, 70, 52, 96);
  g.bezierCurveTo(46, 122, 18, 122, 12, 96);
  g.bezierCurveTo(6, 70, 18, 40, 32, 4);
  g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripeTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff8ef'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = color; g.lineWidth = 9;
  for (let k = -64; k < 128; k += 22) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
  return t;
}

function makeSparkles(ctx) {
  const n = ctx.quality.name === 'low' ? 120 : 260, R = rng(3), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(R() - 0.5) * 14, R() * 8 - 1, (R() - 0.5) * 10 - 2], i * 3);
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, map: glowTexture(64, '#fff2d6'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
}
