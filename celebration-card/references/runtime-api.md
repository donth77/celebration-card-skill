# Runtime & effects API

Everything in `assets/template/`. No build step: native ES modules plus an import map that pins `three`, `three/addons/` and `tone` on jsDelivr. A module is only downloaded if something imports it.

## Contents
1. [File layout](#file-layout)
2. [createCard()](#createcard)
3. [Timing & time expressions](#timing--time-expressions)
4. [Scenes](#scenes)
5. [Cues](#cues)
6. [The ctx object](#the-ctx-object)
7. [Card API, events, URL params](#card-api-events-url-params)
8. [Effect modules (fx/)](#effect-modules-fx)
9. [Music engine (music/)](#music-engine-music)
10. [Patterns & gotchas](#patterns--gotchas)

## File layout

```
index.html        layers (#bg #gl #stage #fx), gate, keepsake, UI, import map, OG tags
styles.css        tokens (--c-*, --font-*), gate/envelope, keepsake, UI, helpers
content.js        ALL words / names / photos / captions / credits (creator-editable)
main.js           composition: audio route, scene timeline, cues, shared fx
scenes/           opening.js, wish.js (3D cake), finale.js, letter.js, photo-gallery.js (optional), keepsake.js (helpers)
runtime/          card.js (engine), timing.js, clock.js, anim.js, debug.js        ← don't edit unless needed
fx/               layer, confetti, fireworks, points, background, stage3d, gallery3d, balloons3d, text, lyrics, photo, sfx, mic
music/            music.js (Tone.js engine + notation), melodies.js (PD tunes), song.js (this card's song)
assets/audio/     song.mp3 + analysis.json (file routes)
assets/media/     prepared photos/videos + media.json
```

Layer stack (bottom → top): `#bg` shader background → `#gl` Three.js → `#stage` DOM scenes → `#fx` 2D particles → `#keepsake` → `#gate` → `#ui`. `#gl` starts at opacity 0, and scenes set its opacity each frame.

## createCard()

```js
const card = await createCard({
  content,                                         // content.js
  audio: { synth: () => import('./music/song.js') },
  //  or { src: 'assets/audio/song.mp3', analysis: 'assets/audio/analysis.json' }
  //  or { src, analysis, plan: { bpm: 92, meter: 4, sections: [['intro', 4], ['verse1', 8], ['chorus1', 8]] } }
  //  or { plan }  /  { duration: 60 }               silent card
  scenes: [ { id: 'title', from: 'start', to: 'verse1', scene: titleScene }, … ],
  cues:   [ { at: 'chorus', run: (ctx) => confetti.cannons() }, … ],
  systems: [bg, fx],                               // anything with update(ctx), run every frame in order
  ctx: { bg, fx, confetti, fireworks, sfx },       // shared objects scenes read as ctx.confetti etc.
  onOpen: (ctx) => { sfx.unlock(); sfx.paper(); }, // runs inside the gate tap (audio unlocked here)
  onEnd: (ctx) => {}, onReplay: (ctx) => {},
  gateMaxWaitMs: 9000,                             // gate enables after scene init or this cap
});
```

Audio resolution:
- `synth` builds the song, and its exact timing becomes the card's timing.
- `src` is HEAD-checked. If the file is missing, the card runs **silently on `plan`**; this is the Suno "build before the song exists" mode. If the file is present, `analysis` JSON supplies beats, sections and bands. Without analysis, the card falls back to `plan` timing (with a console warning).
- If playback is blocked (no gesture, `?t=` QA mode), the card keeps running on a silent clock and shows a "🔊 Tap for sound" pill. Tapping it restores audio at the current position.

File audio plays through a plain `<audio>` element (robust on iOS, no CORS issues). Songs up to 15 MB are also downloaded into memory while the gate shows (`preload: 'auto'`). Seeking then works on any host, even one without HTTP Range support, and playback never stalls mid-song. If the viewer taps first, the card streams. Audio-reactive levels come from the analysis JSON's pre-computed bands, so they're deterministic. Synthesized songs use a live analyser.

## Timing & time expressions

`ctx.timing` (also `card.timing`) is a `Timing` (runtime/timing.js):

| member | meaning |
|---|---|
| `duration, bpm, meter, offset` | length (s), tempo, beats per bar, first downbeat (s) |
| `spb`, `spbar` | seconds per beat / per bar |
| `sections` | `[{ name, start, end, index }]` |
| `at(expr)` | resolve an expression to seconds (below) |
| `beatAt(t)` | `{ index, phase 0..1, bar, beatInBar, barPhase, isDownbeat, time, next }` |
| `section(t)` | the section at t |
| `grid(from, to, 'beat'\|'bar')` | beat or bar times in a range |
| `snap(t, unit)` | nearest beat or bar line |
| `bandsAt(t)` | pre-computed `{ bass, mid, treble, onset }` 0..1 (file audio) |
| `Timing.fromPlan({ bpm, meter, offset, sections: [[name, bars]…], tail })` | planned timing |

Expressions: `12.5` · `'start'` · `'end'` · `'end-3'` · `'chorus'` (first chorus) · `'chorus#2'` or `'chorus2'` (second chorus) · `'chorus.end'` · `'bridge.mid'` · `'verse1+2bar'` · `'outro-1b'` (beats) · `'drop+0.5s'` · `'climax'` (from analysis). Unknown section names throw, and the error lists the real names.

## Scenes

```js
export const myScene = {
  async init(ctx, entry) {},   // once, before the gate opens: build DOM/3D, load textures (wrap loads in ctx.track())
  enter(ctx, s) {},            // when the timeline enters the scene (also after seeking into it)
  update(ctx, s) {},           // every frame while active
  exit(ctx, s) {},             // when leaving (also on seek / replay)
};
// s (scene-local time): { t, p (0..1), dur, start, end, in(d) 0→1, out(d) 1→0, fade(din, dout) }
```

- Scenes may **overlap** (e.g. a 3D world spanning the whole song with DOM text scenes layered on top). Overlap a second or two for crossfades.
- A scene that throws is disabled and logged (`card.state().failedScenes`), so the rest of the card keeps playing.
- After the end, a scene whose `to` is `'end'` stays active with `s.p = 1`. Use `ctx.wall` for ambient motion there.
- Build DOM inside `ctx.layers.dom` (`#stage`) as `<section class="scene" hidden>` and toggle `hidden` in enter/exit. Add `.is-interactive` to anything clickable (the stage has `pointer-events: none`).

## Cues

```js
{ at: 'chorus', run: (ctx) => {} }                                  // once
{ at: 'chorus', offset: '-1b', run }                                 // one beat early (e.g. a rocket that bursts ON the downbeat)
{ every: 'bar', from: 'chorus', to: 'chorus.end', run: (ctx, i) => {} }
{ every: 'beat', from: 'drop', to: 'drop+4bar', skip: 1, run }       // every other beat
```

Cues fire only during forward playback, never for time skipped by a seek, so they suit one-shot effects (bursts, sfx). After a stall (a slow phone, a GC pause), a cue that was due fires late rather than being lost. Nothing older than 1.5 s piles up. Anything that must look right after a seek belongs in a scene's `update` as a function of time.

## The ctx object

| field | |
|---|---|
| `t, dt, wall, frame` | song time (s), frame delta, wall-clock seconds since load (ambient motion), frame count |
| `beat` | `timing.beatAt(t)` |
| `section` | current section |
| `levels` | `{ bass, mid, treble, onset, level, beat }` 0..1, smoothed; `beat` is a pulse that decays through each beat |
| `timing, clock, card, content, song, palette` | palette = `{ bg, ink, accents[] }` from CSS tokens |
| `quality` | `{ name: 'high'\|'medium'\|'low', dpr, particles (multiplier), bloom }`; drops automatically if FPS stays low |
| `reducedMotion` | user prefers reduced motion (or `?reduced`) |
| `layers` | `{ bg, gl, dom, fx, ui }` elements |
| `at(expr)`, `track(promise)` | resolve time; register a load for the gate's progress bar |
| + whatever you pass in `ctx:` | e.g. `ctx.confetti`, `ctx.fireworks`, `ctx.bg`, `ctx.sfx` |

## Card API, events, URL params

`window.card` (handy in DevTools and automation):
- `card.state()` returns `{ t, duration, started, opened, ended, paused, playing, clock, audioBlocked, muted, section, scenes, failedScenes, quality, fps, errors, boot }`.
- `card.snap(t)` seeks, renders a few frames, then **holds** that exact frame. It returns a promise and is the way to screenshot (see qa.md).
- `card.seek(t | expr)`, `card.play()`, `card.pause()`, `card.replay()`.
- `card.addSystem(sys, order)` adds a per-frame updater (lower order runs first; stage3d uses 40, debug 1000).
- `card.on(event, fn)`: `ready`, `unlock`, `open`, `scene` (id), `section`, `beat`, `bar`, `end`, `replay`, `mute`, `blocked`, `quality`.

URL params:
- `?debug`: overlay with time, section, bar/beat, scenes, levels and FPS, plus a clickable timeline.
  - Keys: Space (play/pause), ←/→ (±2 s, Shift ±10 s), ↑/↓ (sections), B (back a bar), D (hide).
  - **Tap-to-mark:** press M at each section start while the song plays (snapped to the nearest bar line) and C to copy a ready `analyze_audio.py --sections "…"` string. X clears. It's the fallback for syncing a real song by ear when lyric timestamps aren't available; the user can do it too.
- `?t=42` or `?t=chorus` skips the gate and starts there. Add `&freeze` to hold that frame.
- `?quality=low|medium|high` (an explicit tier is locked: no automatic downgrade, so QA is deterministic), `?reduced`, `?silent`.

## Effect modules (fx/)

**FxLayer** (`fx/layer.js`): one 2D canvas that effects draw into. `const fx = new FxLayer('#fx'); fx.add(effect)`. Add it to `systems`. Particle counts scale with `ctx.quality.particles`.

**Confetti** (`fx/confetti.js`)
```js
const confetti = fx.add(new Confetti({ colors, shapes: ['rect','circle','ribbon','star','heart', {emoji:'🎉'}] }));
confetti.burst({ x: .5, y: .6, count: 140, angle: 90, spread: 75, speed: 1, colors, shapes, scale });
confetti.cannons({ count: 90 });  confetti.rain({ duration: 4, rate: 60 });  confetti.clear();
```

**Fireworks** (`fx/fireworks.js`)
```js
const fw = fx.add(new Fireworks({ colors, onBurst: ({x, y, type, size}) => sfx.boom(.5) }));
fw.launch({ x, y, type: 'peony'|'ring'|'heart'|'willow'|'palm'|'text'|'shape', rise: 1.0, size, color, color2, crackle });
fw.launch({ type: 'text', text: 'MAYA', font: '900 200px "Fraunces"', mode: 'fill'|'outline', hold: 1.6, span: .62 });
fw.launch({ type: 'shape', shape: 'heart'|'star'|'circle', points?: [{x,y}] });
fw.burst({...}) /* no rocket */;  fw.salvo({ n: 6, over: 2.5 });
```
Load the font first (`await document.fonts.load('900 200px "Fraunces"')`) before text bursts.

**Points** (`fx/points.js`): `textPoints(text, { font, mode, max })`, `pathPoints(svgPath, …)`, and `shapes.heart() / star() / circle()`. These return normalized points (−0.5..0.5) for particles that gather into names, numbers or shapes.

**Background** (`fx/background.js`)
```js
const bg = createBackground('#bg', { preset: 'mesh'|'aurora'|'bokeh'|'sunset'|'starfield'|'rays'|'paper', colors: [c0,c1,c2,c3], intensity: 1, speed: 1 });
bg.set({ colors, intensity }, seconds);  // glide (e.g. warm up at the chorus)
bg.setPreset('rays');                    // instant switch; hide it under a transition
```
It renders at reduced resolution with grain (no banding). `uLevel`/`uBeat` make it react to the music. Without WebGL it falls back to a CSS gradient.

**Stage3D** (`fx/stage3d.js`). One shared stage per card, because two renderers can't share a canvas:
```js
// init
this.stage = await getStage(ctx, { fov: 45 });     // created once (first caller's options), registered as a system
if (this.stage) {
  this.group = new THREE.Group(); this.group.visible = false;   // everything this scene owns, lights included
  this.stage.scene.add(this.group);
  …build…
  this.stage.prime(this.group);                    // compile shaders + upload textures early; DON'T await (gate stays fast)
}
// enter:  this.group.visible = true; set camera.fov if yours differs (+ updateProjectionMatrix)
// update: this.stage.show(this, s.fade(1, 1)); …move the camera…   (renders only on frames someone calls show)
// exit:   this.group.visible = false
stage.scene / camera / renderer / loadTexture(url) / videoTexture(el) / viewSize(distance)
createStage('#gl', { quality, fov, bloom, environment, toneMapping: 'agx'|'neutral'|'aces' })   // low level; prefer getStage
glowTexture(size, '#rrggbb')   // soft sprite for glows, flames, sparkles
```
`show()` takes the highest opacity requested that frame, so two 3D scenes can crossfade. With no requests the canvas hides and nothing renders. Without `prime`, the first frame of a big 3D scene compiles every shader at once. On phones that's a visible freeze right after the tap, and the music runs ahead of the visuals.
- It returns `null` without WebGL, so scenes need a DOM fallback.
- `environment` adds RoomEnvironment reflections, which suit glossy balloons, metal and glass.
- Bloom needs an opaque scene (`bloom: true` + `scene.background`). The default is transparent, so `#bg` shows through.
- Photos: use `MeshBasicMaterial({ map, toneMapped: false })` to keep their true colours.

**Gallery3D** (`fx/gallery3d.js`): photos/videos as framed cards in 3D.
```js
const g = new Gallery3D(stage, content.photos, { layout: 'constellation'|'corridor'|'helix'|'wall', frame: 'polaroid'|'clean'|'none' });
await g.load(ctx.track);
g.setPosition(holdTravel(slot, .4), drift);  // -1 intro shot … N-1 photos … N outro shot
g.update(ctx); g.pauseVideos(); g.visible = false;
```
`holdTravel(slot, travel)` moves the camera during the first part of each photo's slot, then holds. Slots should be whole bars (see `scenes/photo-gallery.js`). Videos play muted while near the camera and show the poster until frames arrive.

**Balloons3D** (`fx/balloons3d.js`): glossy balloons that never intersect.
```js
const b = new Balloons3D(stage, { count: 12, colors, layout: 'bouquet'|'float', anchors?: [Vector3], height: 2.2, scale: .7 });
b.update(ctx, { appear: 0..1, lift: 0..1 });   // inflate in / fly away
const hit = b.pick(clientX, clientY); if (hit?.pop()) confetti.burst({ ...b.screenPos(hit), count: 40, spread: 360 });
b.reset();
```

**Text** (`fx/text.js`)
- `splitText(el, { by: 'chars'|'words' })` returns spans.
- `revealSpans(spans, t, { start, stagger, dur, ease, from: { y, x, opacity, blur, scale, rotate }, out })` is pure in t.
- `fitText(el, { min, max, lines })` gives the largest size that fits (use it for names).
- `typewriter(el, text, t, { cps })` and `countUp(el, to, t, { dur })` (e.g. "10,950 days").

**Lyrics** (`fx/lyrics.js`): timed captions, karaoke style, a pure function of t.
```js
const lyr = lyricCaptions(ctx.layers.dom, content.lyrics);   // [{ t, text, words?: [{ t, w }], hold? }]
lyr.update(ctx);                    // every frame (scene update or card.addSystem(lyr)); { visible: false } to hide
```
Only use timed lyrics: Whisper or ElevenLabs word timestamps, or lines marked by ear. Words highlight as they're sung when `words` are given.

**Photo** (DOM, `fx/photo.js`): `photoEl(item)`, `kenBurns(img, p, { focus, from, to })`, `develop(img, p)` (polaroid develop), `slideshow(container, items).update(slot)`, `decodeAll(imgs)`.

**SFX** (`fx/sfx.js`, synthesized, no files): `sfx.unlock()` (in the gate tap), then `pop() chime(note) sparkle() whoosh() boom(size) crackle() paper() cork() blow() tick() arp(notes)`. Mute it with `sfx.muted = m` (hook `card.on('mute')`).

**Mic** (`fx/mic.js`): `const mic = await listenForBlow({ onBlow, onLevel })` must be called from a tap. It returns `null` if mic access is denied or unavailable, so **always** offer a tap fallback. `mic.stop()`.

**anim.js**:
- easing and interpolation: `clamp lerp invLerp remap smoothstep fract ease.*`
- time helpers: `seg(t, start, dur, ease)` (0→1), `envelope(t, start, end, in, out)`, `pulse(phase)`, `stagger(i, n, spread)`
- motion noise: `rng(seed)` (deterministic: `.range .pick .int`) and `noise1(x)`
- colour: `hexToRgb rgbToHex mixColor rgba`

## Music engine (music/)

See `references/synth-music.md`. In short:
- `song({ bpm, meter, instruments, sections: [{ name, bars, parts }] })`, with parts from `melody()`, `chords()`, `arp()`, `bass()`, `drums()`, `riser()`, `hit()`, `layer()`, `shift()`, `repeat()`, `dyn()`.
- `MELODIES` holds public-domain tunes.
- `renderSongToWav(song)` exports audio.

## Patterns & gotchas

- **Pure-time animation.** For `x = f(s.t)`, use `seg`/`ease`/`revealSpans`. GSAP is fine too: build a paused timeline in `init` and call `tl.time(s.t)` in `update`.
- **Interactive state** (a wish made, a balloon popped) is the one allowed exception to pure time. Store *when* it happened in song time (`this.blownAt = ctx.t`) and derive visuals from that. Reset it in `enter` when seeking back before the interaction window. Always give the interaction a deadline tied to the music (the template auto-blows the candles on the lift), so the story continues if nobody taps.
- **Taps:**
  - Listen on `window` for `pointerdown` in `enter` and remove the listener in `exit`.
  - Ignore taps on UI: `e.target.closest('#ui, button, a, #keepsake, .lightbox')`.
  - When one scene handles a tap, set `e.cardHandled = true` so overlapping scenes skip it.
- **iOS:** only `click`, `pointerup` and `touchend` count as user activation for audio, not `pointerdown` or `touchstart`. The gate uses `click`.
- **Fonts:** load Google Fonts in `index.html`. Canvas text (captions, fireworks text) needs `await document.fonts.load('…')` first.
- **Static meta:** `<title>` and `og:*` must be literal in `index.html`, because link previewers don't run JS.
- **Don't leave 3D running when it's invisible.** With `getStage`, just stop calling `stage.show()` (and hide your group) in `exit`. The stage skips rendering on frames nobody asks for.
