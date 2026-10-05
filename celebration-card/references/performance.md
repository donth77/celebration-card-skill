# Performance: smooth on the phone it's sent to

A card is opened once, on whatever phone the person has: often a few years old, often on mobile data. It has to open quickly and move smoothly the whole way through. Plan for a five-year-old iPhone and a mid-range Android phone, not a laptop.

## Contents
1. [Budgets](#budgets)
2. [The first impression](#the-first-impression)
3. [Drawing: the GPU and the frame rate](#drawing-the-gpu-and-the-frame-rate)
4. [The page: JavaScript and layout](#the-page-javascript-and-layout)
5. [Media](#media)
6. [Older phones and Low Power Mode](#older-phones-and-low-power-mode)
7. [Measure](#measure)
8. [Checklist](#checklist)

## Budgets

| What | Budget |
|---|---|
| Gate ready to tap | about 3 s on a phone on 4G; ≤ 5 s on a cold-cache desktop (`gateReadyMs`) |
| First load before the gate is ready | ≤ 3 MB (fonts, the first scene, the song) |
| Whole card (no video) | ≤ 15 MB |
| Photos | 1920 px max, WebP q≈82, ~150–350 KB each |
| 3D model | a few MB: meshopt-compressed, WebP textures ≤ 2048 px |
| Draw calls (3D) | ≤ 150; InstancedMesh for repeats |
| Particles | ≤ 600 confetti / 1,500 spark segments at high, scaled by quality |
| Lights | 1 point light (candles); no real-time shadows: fake contact shadows with a radial-gradient plane |
| Frame rate | 60 fps on a recent phone; never under 30 on an old one |
| Full-screen video | no stall, skip or dropped frame in its first seconds |

## The first impression

- **Only the gate has to be fast.** Load what it needs first. Everything else loads while it shows.
- **No freeze after the tap.** Prime shaders in `init` without awaiting (`stage.prime(group)`), and draw one warm-up frame of each 3D scene, so the first frame after the tap doesn't stall while the GPU compiles.
- **The gate waits for the essentials.** The runtime holds it until every scene's `init`, the fonts and the song (in memory) are ready, capped by `gateMaxWaitMs`. So keep each `init` light: `card.state().boot` shows which phase is slow.
- **Late scenes load late.** Start their heavy assets in `init` without awaiting, or when the scene before them begins.
- **Fonts:** preconnect to the font host, `display=swap`, and only the weights you use.

## Drawing: the GPU and the frame rate

- **Pixels cost.** GPU work grows with width × height × DPR². A phone at 3× has nine times the pixels of 1×. The quality tiers cap the 3D's DPR: high 2, medium 1.5, low 1. On phones, a short trial at 2× works well: keep it only while the median frame stays under about 21 ms, and only ever step down.
- **Draw only what changes.**
  - Call `stage.show()` only from scenes that are visible.
  - Skip frames where nothing moved (a held still, a photo covering the 3D).
  - Under a menu or an overlay, about 30 frames a second is plenty.
  - When something covers the whole screen (a video), stop drawing, and skip the scene's per-frame work too (posing, physics).
- **Expensive:** glass and transmission materials, real-time shadows, many lights, big transparent particles (overdraw), bloom and other full-screen passes. Keep them to the high and medium tiers.
- **Scale counts** by `ctx.quality.particles`. The watchdog steps the tier down when the frame rate stays under about 38.

## The page: JavaScript and layout

- **Animate with `transform` and `opacity` only.** The compositor handles them without layout or repaint. Changing `top`, `width`, fonts or `filter` every frame costs layout or paint on every frame.
- **Measure once.** Lay out on enter and on resize, never in `update()`. Reading `getBoundingClientRect()` after writing styles forces a layout every frame.
- **No allocations in per-frame code** (new vectors, arrays, closures): reuse objects, or garbage collection shows up as hitches.
- **`will-change`** only on a few large moving layers. Big blurs and `backdrop-filter` are slow on older phones.
- **Bake heavy motion.** Skinned animation is sampled by time from clips; cloth, hair and physics are baked offline, not simulated on the phone.

## Media

- **The song** stays in memory, played by one `<audio>` element (the runtime does this for files up to 15 MB). It never stalls, and seeking works on any host. Don't stream a long file from a host without range requests (see `qa.md` → Phones and browsers).
- **Photos:** prepare them with `prepare_media.py`; decode the hero image before the gate opens (`img.decode()`).
- **Short clips:** prepared MP4 (H.264, 720p is plenty for B-roll), `muted playsinline`, with a poster.
- **Full-screen video in high quality** (a long sequence, a film):
  - **Stream it as HLS with several copies**, for example the original, 1080p, 720p, 480p and 360p. Safari plays HLS itself and starts on the first copy listed, so list the best first. Elsewhere use hls.js, even where the browser has its own HLS player: Chrome's picks a copy by the player's size, often 360p on a phone.
  - **Cut every copy at the same points, sound included.** Use a fixed keyframe interval (no scene-cut keyframes) and copy the same audio stream into each. If one copy is encoded differently (the untouched original next to re-encoded copies, one with B-frames and one without), ffmpeg cuts its sound at different points. Then a switch between copies leaves a gap: the player stalls, skips ahead, and the picture freezes while the sound goes on. Shift the odd one's decode times to match the others (for two B-frames at a 1/30 s timebase: `-bsf:v setts=dts=DTS-2`). Then check with ffprobe that every chunk's audio and video start and end at the same times in every copy.
  - **Warm it up.** While the menu shows, fetch the playlists and the first chunk of the best copy, so a tap starts at once at full quality. Use how fast that chunk came to choose hls.js's starting copy, so there's no switch in the first seconds.
  - **Stop drawing the 3D underneath** while it plays.
  - **Host limits:** Cloudflare Pages takes files up to 25 MB; keep an MP4 fallback under that.

## Older phones and Low Power Mode

- **iPhone Low Power Mode** caps animation at 30 frames a second and refuses autoplay, even muted. Animation that's a function of time stays in sync at any frame rate; check that the card still reads well at 30. Give every video a poster and a play button.
- **Memory:** a five-year-old iPhone (an iPhone 12 or 13) has 4–6 GB, and Safari ends a page that uses too much. A 4096 × 4096 texture takes about 90 MB of GPU memory with its mipmaps. Keep textures modest, and release what a finished scene no longer needs.
- **Heat:** a phone slows down as it warms up during a long card. Keep long scenes' GPU load modest, not just their peak.

## Measure

- **`card.state()`:** `fps`, `quality` and `boot` (the load phases). `?debug` shows the frame rate and tier live, and `?quality=low|medium|high` locks a tier.
- **`snap.mjs`:**
  - It reports `gateReadyMs`.
  - `--cpu 4` slows Chromium's CPU four times to imitate an older phone.
  - With `--play-into`, the report includes the frame rate and tier.
  - Headless Chromium draws WebGL in software, so its frame rate is lower than a phone's: use it to compare runs, not as the phone's number.
- **Video:** `video.getVideoPlaybackQuality()` counts dropped frames. With hls.js, note which copy each chunk comes from. A switch in the first seconds, or a `waiting` event or seek around a switch, means misaligned copies.
- **Real phones settle it.** Ask the user to open the card on their phone: an iPhone in Safari and an Android phone if they can, and an older one if they have it.
  - With a Mac and a cable, Safari's Web Inspector (Develop menu → the phone) shows an iPhone's console, network and timelines.
  - For Android, Chrome's remote debugging does the same (`chrome://inspect` on the computer).

## Checklist

- [ ] The gate is tappable in about 3 s on a phone; no `boot` phase over about a second that could wait
- [ ] No hitch on the first frames after the tap (shaders primed, a warm-up frame drawn)
- [ ] The busiest scene runs at 60 fps on a recent phone, and holds or steps down gracefully on an old one
- [ ] Nothing is drawn while hidden or covered; menus and overlays are throttled
- [ ] Payload within budget; images and video prepared
- [ ] Full-screen video: copies aligned (sound included), warmed up, no switch or stall in the first seconds
