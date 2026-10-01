// OPTIONAL SCENE — the sender's photos (and muted clips) in 3D; falls back to a DOM slideshow
// without WebGL. Add it to main.js only when there are photos:
//   import { photoGallery } from './scenes/photo-gallery.js';
//   { id: 'memories', from: 'verse1', to: 'chorus', scene: photoGallery },
// Photos change on bar lines: each photo gets a whole number of bars, the camera travels for
// the first part of its slot and then holds (with a slow dolly) while the music carries it.

import { getStage } from 'card/fx/stage3d.js';
import { Gallery3D, holdTravel } from 'card/fx/gallery3d.js';
import { slideshow } from 'card/fx/photo.js';
import { clamp, fract } from 'card/runtime/anim.js';

export const photoGallery = {
  async init(ctx) {
    this.photos = ctx.content.photos?.length ? ctx.content.photos : placeholderPhotos(ctx);
    const el = (this.el = document.createElement('section'));
    el.className = 'scene scene--memories';
    el.hidden = true;
    this.live = document.createElement('p');
    this.live.className = 'visually-hidden';
    this.live.setAttribute('aria-live', 'polite');
    el.appendChild(this.live);
    ctx.layers.dom.appendChild(el);

    this.stage = await getStage(ctx); // shared by every 3D scene in the card
    if (this.stage) {
      this.gallery = new Gallery3D(this.stage, this.photos, { layout: 'constellation', frame: 'polaroid', glow: '#ffd9a8' });
      await this.gallery.load(ctx.track);
      this.gallery.visible = false;
      this.stage.prime(this.gallery.group); // not awaited: the gate shouldn't wait for shader compiles
    } else {
      const box = document.createElement('div');
      el.appendChild(box);
      this.show = slideshow(box, this.photos);
    }
  },
  enter(ctx) {
    this.el.hidden = false;
    if (this.stage) {
      this.gallery.visible = true;
      const cam = this.stage.camera;
      if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); }
    }
    ctx.bg?.set({ intensity: 0.5 }, 2.5);
  },
  update(ctx, s) {
    const N = this.photos.length;
    const spbar = ctx.timing.spbar;
    const bars = Math.max(1, Math.floor(s.dur / spbar));
    const barsPer = Math.max(1, Math.floor((bars - 1) / N)); // keep ~1 bar for the closing shot
    const slot = s.t / (barsPer * spbar);
    const idx = clamp(Math.floor(slot), 0, N - 1);
    if (idx !== this._idx) { this._idx = idx; this.live.textContent = this.photos[idx]?.caption || ''; }
    if (this.gallery) {
      this.stage.show(this, s.fade(0.9, 0.9));
      const pos = slot < N ? holdTravel(slot, 0.4) : Math.min(N, N - 1 + (slot - N) * 1.2);
      const drift = slot < N ? clamp((fract(slot) - 0.4) / 0.6) : 0;
      this.gallery.setPosition(pos, ctx.reducedMotion ? 0 : drift);
      this.gallery.update(ctx);
    } else {
      this.show.update(Math.min(slot, N - 1 + 0.999));
      this.el.style.opacity = s.fade(0.8, 0.8).toFixed(3);
    }
  },
  exit(ctx) {
    this.el.hidden = true;
    if (this.stage) {
      this.gallery.pauseVideos();
      this.gallery.visible = false;
    }
    ctx.bg?.set({ intensity: 1 }, 1.5);
  },
};

/** Demo-only stand-ins so the template shows the gallery before real photos are added. */
function placeholderPhotos(ctx) {
  const items = [['🎈', 'Add your photos'], ['🌅', 'Captions go here'], ['🍰', 'Inside jokes welcome'], ['🎶', 'Synced to the music'], ['📸', 'Faces stay in frame'], ['💛', 'One more memory']];
  const cols = ctx.palette.accents;
  return items.map(([emoji, caption], i) => {
    const c = document.createElement('canvas');
    c.width = 800; c.height = i % 3 === 1 ? 1000 : 640;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, c.width, c.height);
    grd.addColorStop(0, cols[i % cols.length]); grd.addColorStop(1, cols[(i + 1) % cols.length]);
    g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
    g.font = '220px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, c.width / 2, c.height / 2);
    return { src: c.toDataURL('image/jpeg', 0.85), caption, focus: [0.5, 0.5] };
  });
}
