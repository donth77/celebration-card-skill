// Three.js stage: renderer + scene + camera, sized to its canvas, DPR-capped by quality tier,
// with optional studio reflections (RoomEnvironment) and bloom. Returns null without WebGL —
// scenes should fall back to DOM/2D in that case.
//
// Use ONE stage per card, shared by every 3D scene (two renderers can't share a canvas):
//   const stage = await getStage(ctx);             // in scene.init — created once, registered as a system
//   this.group = new THREE.Group(); stage.scene.add(this.group);   // each scene owns a group (+ its lights)
//   stage.prime(this.group);                       // compile shaders/upload textures early (don't await)
//   // in scene.update:
//   stage.show(this, s.fade(1, 1));                // render this frame at this opacity (max over scenes)
//   this.group.visible = true;  …position the camera…
//   // in scene.exit: this.group.visible = false
// The stage only renders on frames where some scene called show(), so idle 3D costs nothing.
//
//   const tex = await stage.loadTexture('assets/media/img-01.webp');
//
// Notes
// - alpha:true (default) lets the #bg shader and DOM show through. Bloom needs an opaque
//   render: pass bloom:true and set stage.scene.background (colour or texture).
// - Photos: use MeshBasicMaterial({ map, toneMapped: false }) so they keep their true colours.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export async function createStage(canvas, { quality = { dpr: 1.5, name: 'medium', bloom: true }, alpha = true, bloom = false, bloomStrength = 0.55, bloomRadius = 0.5, bloomThreshold = 0.82, environment = true, fov = 45, near = 0.05, far = 200, toneMapping = 'agx', exposure = 1 } = {}) {
  canvas = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.name !== 'low', alpha: alpha && !bloom, powerPreference: 'high-performance' });
  } catch (e) {
    console.warn('[stage3d] WebGL unavailable — skipping 3D.', e);
    return null;
  }
  renderer.setPixelRatio(quality.dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = { agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping, none: THREE.NoToneMapping }[toneMapping] ?? THREE.AgXToneMapping;
  renderer.toneMappingExposure = exposure;
  if (alpha && !bloom) renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, near, far);
  camera.position.set(0, 0, 6);

  if (environment) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

  let composer = null, bloomPass = null;
  if (bloom && quality.bloom !== false) {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), bloomStrength, bloomRadius, bloomThreshold);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  const size = { w: 1, h: 1 };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    size.w = Math.max(1, r.width || innerWidth); size.h = Math.max(1, r.height || innerHeight);
    renderer.setPixelRatio(quality.dpr);
    renderer.setSize(size.w, size.h, false);
    composer?.setPixelRatio?.(quality.dpr);
    composer?.setSize(size.w, size.h);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const shown = new Map(); // owner → opacity requested this frame
  const stage = {
    THREE, renderer, scene, camera, composer, bloomPass, size,
    enabled: true, // false = never render (legacy switch); prefer show()
    /** Ask for the 3D layer this frame at `opacity` (0..1). Call every frame while your scene is visible. */
    show(owner, opacity = 1) { shown.set(owner, Math.max(shown.get(owner) || 0, opacity)); },
    /**
     * Compile shaders and upload textures for `object` ahead of time, so the first frame it appears
     * doesn't stall (a multi-second freeze right after the tap otherwise). Uses compileAsync where
     * available (non-blocking). Don't await it in init — let the gate become tappable meanwhile.
     */
    async prime(object = scene) {
      const was = object.visible;
      object.visible = true;
      try {
        if (renderer.compileAsync) await renderer.compileAsync(object, camera, scene);
        else renderer.compile(object, camera);
        if (renderer.initTexture) {
          object.traverse((o) => {
            const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
            for (const m of mats) for (const k of ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap']) if (m[k]) renderer.initTexture(m[k]);
          });
        }
      } catch (e) { console.warn('[stage3d] prime failed (will compile on first use)', e); }
      finally { object.visible = was; }
    },
    loadTexture(url) {
      return new Promise((resolve, reject) => loader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
        resolve(t);
      }, undefined, reject));
    },
    videoTexture(video) { const t = new THREE.VideoTexture(video); t.colorSpace = THREE.SRGBColorSpace; return t; },
    /** Plane size that fills `fraction` of the view at `distance` from the camera. */
    viewSize(distance, fraction = 1) {
      const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance;
      return { w: h * camera.aspect * fraction, h: h * fraction };
    },
    update(ctx) {
      const op = shown.size ? Math.max(...shown.values()) : 0;
      shown.clear();
      canvas.style.opacity = op.toFixed(3);
      if (!stage.enabled || op <= 0.001) return;
      if (ctx.quality && renderer.getPixelRatio() !== ctx.quality.dpr) resize();
      if (composer) composer.render(); else renderer.render(scene, camera);
    },
    resize,
    dispose() { renderer.dispose(); },
  };
  return stage;
}

/** The card's shared stage (created on first call, registered with the card as a system). */
export function getStage(ctx, opts = {}) {
  if (!ctx.__stage) {
    ctx.__stage = createStage(ctx.layers.gl, { quality: ctx.quality, ...opts }).then((stage) => {
      if (stage) ctx.card.addSystem(stage, 40); // after scenes have moved things
      return stage;
    });
  }
  return ctx.__stage;
}

/** Soft round sprite texture for glows, sparkles and bokeh. */
export function glowTexture(size = 128, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, color); grd.addColorStop(0.25, color + 'aa'); grd.addColorStop(1, color + '00');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
