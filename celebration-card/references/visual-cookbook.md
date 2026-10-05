# Visual cookbook

Techniques and design rules for scenes. The API details are in runtime-api.md. Everything here assumes pure-time animation: compute a state from `s.t` / `ctx.t`; never accumulate.

## Contents
1. [Design rules](#design-rules)
2. [Phone-first composition](#phone-first-composition)
3. [Type & colour](#type--colour)
4. [Syncing visuals to music](#syncing-visuals-to-music)
5. [Kinetic typography](#kinetic-typography)
6. [3D scenes without photos](#3d-scenes-without-photos)
7. [Photos & video](#photos--video)
8. [Particles](#particles)
9. [Transitions](#transitions)
10. [Interactions](#interactions)
11. [Group cards & many messages](#group-cards--many-messages)
12. [Performance budget](#performance-budget)
13. [Accessibility](#accessibility)

## Design rules

- **One concept, expressed everywhere.** If the concept is "a garden that grows", the gate is a seed packet, the confetti is petals, the transition is a vine wipe, and the finale is the name written in flowers. Coherence reads as care.
- **Hierarchy per moment.** One focal thing on screen at a time: the name, a photo, or a line of text. Let it breathe (about 250 ms per word plus 1.5 s), then move on.
- **Contrast in energy.** Calm verse, burst on the chorus, near-silence for the wish, everything for the finale. Constant fireworks are numbing.
- **Specific over stock.** Their dog's name, the city skyline they live in, the number of years, the inside joke as a visual gag.
- **Finish with stillness.** The letter is static, readable, unhurried. Motion stops being the point.

## Phone-first composition

- Design at **390×844**, then check 1440×900. Center the important content, and keep text out of the top ~60 px (notch, mute button) and the bottom ~40 px (home indicator). `.scene` already pads with `env(safe-area-inset-*)`.
- In 3D, frame by **both** dimensions: compute the camera distance from the subject's size and `camera.aspect`, the way `scenes/wish.js` does with `fit = max(H/2/tan, W/2/(tan·aspect))`. A portrait phone sees a much narrower slice than desktop.
- Large type: headline 12–18 vw (fit long names with `fitText`), body ≥ 17 px, captions ≥ 15 px.
- Thumb-reachable controls in the lower half, at least 44×44 px.

## Type & colour

Pair one characterful display face with one quiet text face (Google Fonts):

| Tone | Display | Text | Hand/accent |
|---|---|---|---|
| Warm & joyful (default) | Fraunces (soft, wonky) | Inter | Caveat |
| Elegant / wedding / anniversary | Cormorant Garamond, Playfair Display | Montserrat, Lato | Pinyon Script, Great Vibes |
| Playful / kids | Fredoka, Baloo 2, Chewy | Nunito | Gaegu |
| Retro 70s/80s | Bungee, Monoton, Righteous | DM Sans | Pacifico |
| Modern / corporate team card | Space Grotesk, Syne | Inter | — |
| Literary / teacher / retirement | DM Serif Display, Libre Baskerville | Source Sans 3 | Homemade Apple |
| Gentle / memorial | EB Garamond, Lora | Source Serif 4 | — |

Non-Latin names need fonts with those glyphs: the Noto families (Noto Sans JP/SC/KR/Arabic/Hebrew/Devanagari). Set `dir="rtl"` on RTL text.

Palettes are 3–5 colours, with the darkest first as `--c-bg`. Derive them from:
- the occasion's material (25th: silver; 40th: ruby; 50th: gold)
- the person's favourite colour
- their photos (`media.json` → `palette`)

Keep text contrast at 4.5:1 or better. On busy backgrounds, add a soft text shadow or a scrim.

## Syncing visuals to music

| Technique | How |
|---|---|
| Scene changes on section boundaries | `scenes: [{ from: 'verse1', to: 'chorus1' }]` |
| A moment exactly on a downbeat | `ctx.at('chorus1')` inside update, or a cue `{ at: 'chorus1' }` |
| Something every bar or beat | `{ every: 'bar', from, to, run }`, e.g. a photo flip, a firework, a lantern rising |
| Things that need travel time (rockets, falling objects) | cue with `offset: '-1b'` and `rise: ctx.timing.spb` so they *arrive* on the beat |
| Breathing with the music | `ctx.levels.bass` → scale or glow, `levels.treble` → sparkle density, `levels.beat` → pulse (keep scale changes ≤ 3%) |
| Phrase-aware pacing | photos or lines change every 2 bars (`ctx.timing.spbar * 2`), not every N seconds |
| Background mood shifts | `bg.set({ colors, intensity }, seconds)` at the chorus, warmer and brighter at the climax |
| Silence before the drop | strip visuals for the last beat before the climax (`'chorus3-1b'`) and let the drop land |

## Kinetic typography

```js
// init
this.title = splitText(el.querySelector('h1'), { by: 'chars' });
// update — letters rise in, one per 16th note, starting on bar 2 of the intro
revealSpans(this.title, s.t, { start: ctx.at('intro+1bar') - s.start, stagger: ctx.timing.spb / 4, dur: 0.8, from: { y: 0.6, opacity: 0, blur: 10 } });
```

Variations:
- Words drop in one per beat (`by: 'words', stagger: spb`).
- The name scales up with `ease.outBack` on the downbeat.
- The typewriter style suits letters.
- `countUp` shows big numbers (days together: `Math.round((Date.now() - new Date('2001-06-16')) / 864e5)`).
- Outro text floats up and fades with `revealSpans(..., { out: { start, to: { y: -0.4, opacity: 0 } } })`.

Kerning matters at display sizes. Use `letter-spacing: -0.02em` for big serif headlines.

## 3D scenes without photos

Build from primitives with good materials; it looks premium and needs no assets.

- **Setup:**
  - `getStage(ctx)` returns one stage for the whole card. Give each scene its own `THREE.Group` with its own lights, call `stage.show(this, opacity)` in update, and run `stage.prime(group)` (unawaited) in init. See runtime-api.md.
  - The stage includes `environment: true` (RoomEnvironment) for free reflections.
  - Add a hemisphere light, a warm key light and a cool rim light from behind for depth.
  - The transparent canvas sits over the shader background.
- **Materials:**
  | Object | Material |
  |---|---|
  | balloons, ornaments | `MeshPhysicalMaterial({ roughness: .2, clearcoat: 1, sheen: .4 })` |
  | gold / silver | `MeshStandardMaterial({ metalness: .85, roughness: .28 })` |
  | frosting, paper, cloth | `roughness: .6` |
  | lanterns, candles | `emissive` |
  | soap bubbles | `iridescence: 1, transmission: .9, thickness: .2` (expensive: medium/high quality only) |
- **Objects that work:**
  | Object | Build |
  |---|---|
  | cake | stacked cylinders + capsule drips + instanced sprinkles; flames are sprites (see `scenes/wish.js`) |
  | balloons | `fx/balloons3d.js` |
  | gift box | box + ribbon boxes; lid hinge-rotates open on a cue, light pours out (glow sprite + particles) |
  | paper lanterns | cylinders, warm emissive + glow sprites, rising on a sine sway; one per message or per year |
  | stars / constellations | Points with `glowTexture`, joined by lines as the story unfolds |
  | flowers | petals as stretched spheres around a center, blooming with scale-in; instanced for a field |
  | 3D text | `TextGeometry` with a typeface font from `https://cdn.jsdelivr.net/gh/mrdoob/three.js@r186/examples/fonts/helvetiker_bold.typeface.json` (number candles, a big "50", names); or DOM text over the 3D |
  | planets / globe | a sphere with a canvas texture (dots for places they've lived), arcs between them for a journey |
  | paper planes | low-poly triangles flying along CatmullRom curves (good for farewells/travel) |
- **Camera choreography:**
  - Drive orbit angle, radius, height and look-at from `seg()` per section, the way wish.js does. Add slight noise (±0.02) for a handheld feel, and pointer parallax (±0.06 rad).
  - Big camera moves happen *across* a section boundary.
- **Never interpenetrate.** Place objects with minimum spacing (rejection sampling), keep moving things in non-overlapping lanes, or run a separation pass each frame (see `Balloons3D.update`). Then verify numerically (qa.md). Viewers instantly notice two balloons merging or a photo slicing through another.
- **Glows without bloom:** additive glow sprites (`glowTexture`) behind lights, flames and stars stay cheap and work with the transparent canvas. Real bloom (`bloom: true`) needs an opaque `scene.background`.
- Turn the stage off when no 3D scene is visible (`stage.enabled = false`).

## Photos & video

1. **Prepare** them with `prepare_media.py`, then look at each one: caption, `focus`, hero, order.
2. **3D gallery** (`fx/gallery3d.js`, `scenes/photo-gallery.js`):
   | Layout | Feels like | Fits |
   |---|---|---|
   | `constellation` | memories as stars around you, lines drawing the story | anniversaries, night themes |
   | `corridor` | walking a gallery hall | retirements, "through the years" |
   | `helix` | a spiral through time | birthdays with many photos |
   | `wall` | ends on a pull-back to the whole wall | group cards |
   Change photos every 1–2 bars with `holdTravel`.
3. **DOM treatments** (`fx/photo.js`):
   - Ken Burns toward the faces (`focus`)
   - polaroid `develop()` from white
   - cross-fading `slideshow()`
   - polaroids dropping onto a pile, with seeded random rotation and a shadow
4. **Then & now:** split screen or a slider wipe between an old and a recent photo on the beat.
5. **Video:**
   - **B-roll clips** run muted (`video` items in gallery3d, or `<video muted playsinline loop>` in the DOM) while the music continues.
   - **Video messages with their own sound** go in the keepsake (the lightbox plays them with controls), or in a dedicated quiet section with the music ducked.
   - Always provide a `poster`: iOS Low Power Mode refuses autoplay.
   - A video with sound starts with `play()` called inside the tap itself (an iPhone refuses it after an `await`).
   - A long video in high quality streams as HLS, with every copy cut at the same points, sound included: see `performance.md` → Media.
6. **No photos at all?** Don't fake them. Use illustration, 3D objects and words. Never generate fake photos of real people.

## Lyrics on screen

For a song with words that matter (a custom Suno song, the family's favourite), show timed lines with `fx/lyrics.js`, karaoke style, at the bottom.
- Hide them during scenes that carry their own big text.
- Highlight words as they're sung when you have word timings.
- A 1920s song suits a "bouncing ball" sing-along: a dot hops word to word, positioned from the word timings.

## Particles

- **Confetti** (`fx/confetti.js`): `burst` on downbeats, `cannons` for the climax, `rain` for the outro. Theme the shapes: hearts for anniversaries, stars for graduation, `{ emoji: '🌸' }` for a garden.
- **Fireworks** (`fx/fireworks.js`): `launch` with `rise` so it bursts on the beat. Use `type: 'text'` for the name or number and `heart` for love. Keep them away from text, or fade the text first.
- **Particles forming a shape:** take `textPoints('MAYA', { font })` or `shapes.heart()`, then lerp each particle from a random start to its target with `seg()`. Hold, then scatter on the next downbeat. Draw them in a small custom FxLayer effect (any object with `update(dt)`, `draw(g, dpr)` and an `alive` flag).
- **Sparkle trail** under the finger (pointermove → spawn small stars) makes the card feel touchable.
- Scale every count by `ctx.quality.particles`.

## Transitions

| Transition | How |
|---|---|
| Crossfade | overlap two scenes by about a beat; `el.style.opacity = s.fade(spb, spb)` |
| Iris / circle wipe | `el.style.clipPath = \`circle(${seg(s.t,0,0.8,ease.inOutCubic)*150}% at 50% 50%)\`` |
| Wipe | `clipPath: inset(0 ${100 - p*100}% 0 0)`; a diagonal uses a polygon |
| Zoom-through | the outgoing scene scales up toward the camera and fades while the next scales down from 1.1 |
| Curtain or envelope | two halves translate apart (the gate does a version of this) |
| Shader mood change | `bg.set({ colors }, 1.5)` across the boundary; switch `bg.setPreset()` while something opaque covers the screen |
| Flash-free whiteout | fade a full-screen warm cream layer to 0.85 and back over ≥ 0.6 s. Never a 1-frame white flash |

Align a transition's midpoint to the section boundary, so the new section's downbeat lands on the new scene.

## Interactions

Interactions turn a video into a gift. Rules:
- The music keeps going.
- Every interaction has a **deadline tied to the timeline** (the candles go out by themselves on the lift).
- Show a clear prompt.
- Give a tap fallback for anything sensor-based.

| Interaction | How |
|---|---|
| Tap to open (gate) | runtime-handled; restyle `#gate` (gift box, door, scroll, boarding pass) |
| Blow out candles | `listenForBlow()` from a button tap, tap fallback (see wish.js) |
| Pop balloons | `Balloons3D.pick()` → `hit.pop()` → confetti at `screenPos(hit)` + `sfx.pop()` |
| Scratch to reveal | a canvas over the message with `globalCompositeOperation = 'destination-out'` on pointermove; reveal fully after 60% is scratched or at a deadline |
| Catch falling stars or hearts | spawn on the beat; tap to catch → +1 counter and `sfx.chime` in the song's key |
| Drag to spin | pointer drag rotates a 3D object (gift, globe), with inertia |
| Make a wish / write a word | an input whose text floats up into the sky as a lantern; local only |
| Shake for confetti | DeviceMotion. iOS needs `DeviceMotionEvent.requestPermission()` from a tap, so make it optional |
| Easter egg | tap the moon, the dog, the logo → a small surprise, an inside joke |

Make interactive DOM elements `class="is-interactive"` (the stage ignores pointers otherwise). In window-level handlers, ignore taps on UI: `e.target.closest('#ui, button, a, #keepsake')`. When a scene consumes a tap, set `e.cardHandled = true`.

## Group cards & many messages

Many short messages (retirement, farewell, team birthday):
- Each message is a **lantern**, **paper plane**, **star** or **sticky note** arriving on successive bars. Tap one to read it in full, and keep each to about 2 bars on screen.
- A **movie-credits roll** at the end works well: "Starring Maya · Written by everyone who loves her · …" with every contributor's name. It's charming and readable.
- All messages also appear in the keepsake (a scrollable wall), because nobody reads 30 messages at song speed.
- Video messages from friends go to the keepsake, never into the timed show.

## Performance budget

The budgets (first load, payload, photos, draw calls, particles, lights, frame rate) and how to stay within them are in `performance.md`. In short: design for a five-year-old phone, draw only what changes, and scale counts by `ctx.quality`. The runtime drops the quality tier automatically if the frame rate stays under ~38; test `?quality=low` too.

## Accessibility

- Honour `ctx.reducedMotion`:
  - fades instead of flies
  - no camera shake
  - fewer particles
  - slower background
- Keep all meaningful text in the DOM (canvas text gets a DOM twin or `aria-label`), photo captions as `alt`, and a mute button that's always available.
- No flashing above 3 per second, and no full-screen white flashes.
- Interactions must never be required to finish the card.
