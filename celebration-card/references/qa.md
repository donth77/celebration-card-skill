# QA: verify in a real browser before you call it done

A card that's broken on the recipient's phone is worse than no card. Test like the recipient: phone-sized, from the tap, with sound. Then use the QA hooks to inspect every moment.

## Contents
1. [Serve it](#serve-it)
2. [Drive it](#drive-it)
3. [Screenshot every moment](#screenshot-every-moment)
4. [What to look for](#what-to-look-for)
5. [Numeric checks](#numeric-checks)
6. [Checklist](#checklist)

## Serve it

ES modules don't load from `file://`, so always serve over http, with the bundled server:

```bash
python3 <skill>/scripts/serve.py <card> --port 8765      # run in the background; it prints the URL (next free port if taken)
```

Use it instead of `python3 -m http.server`, which ignores HTTP Range requests. Without them, browsers can't seek in an audio file: `?t=`, `card.snap()`, `card.seek()` and debug scrubbing silently jump back to 0. `serve.py` also disables caching, so edits to modules show up on reload.

## Drive it

**Fastest: the bundled script.** It runs its own headless browser, so it's safe to use in parallel with other agents:

```bash
node <skill>/scripts/snap.mjs http://localhost:8765/ --out <card>/qa --tap --desktop \
  --times gate,start,intro+2bar,verse1+2bar,chorus1,bridge,chorus3+1bar,outro+1bar,end --play-into chorus3:3
```

It writes phone (and, with `--desktop`, 1440×900) screenshots plus `qa-report.json`: card state, failed scenes, console errors, failed requests, and whether audio started after the tap. **Then open every PNG and look at it.** The script captures; you judge. It needs the `playwright` package and its Chromium browser. It looks in the project first, then in the npx cache (for example the copy the Playwright MCP server uses). If neither has one, add Playwright to the project, or point at an installed copy with `--playwright <path>`.

**Interactive:** use whatever browser automation the environment has (Playwright MCP, Chrome DevTools MCP). It suits poking at interactions. If there's none, ask the user to open the page and report what they see.

1. Set the viewport to **390×844**. Open `/?debug` and wait for the gate to be ready (`#gate.is-ready`).
2. Check the console for errors and failed requests.
3. **Click the gate:** use the gate element, not a pulsing child, because automation may refuse to click an element that is still animating. Then wait 2 s and evaluate:
   ```js
   card.state()   // → started: true, playing: true, clock: 'synth'|'file', audioBlocked: false, errors: [], failedScenes: []
   ```
   - `audioBlocked: true` in automation is normal when there was no real gesture.
   - With a real click it should be `false`.
   - `failedScenes` must be empty.
4. **Check boot timing.** `snap.mjs` reports `gateReadyMs`, and `card.state().boot` breaks it into phases (module download, audio, fonts, each scene's init).
   - Budget: about 5 s or less on a cold-cache desktop, and the envelope is visible immediately.
   - If one scene's `init` dominates, defer the heavy parts. Don't await `stage.prime()`, and lazy-load textures for scenes that start late.

## Screenshot every moment

Continuous WebGL rendering can make automated screenshots return **stale frames**. Always freeze first:

```js
await card.snap(42)        // or card.snap('chorus1+2bar'); resolves after the frame is rendered and held
```

Then take the screenshot. For effects triggered by cues (fireworks, confetti), play into the moment and then snap the current time:

```js
card.seek('finale-1bar'); card.play();
// wait ~2–3 s of real time, then:
await card.snap(card.ctx.t)
```

Capture at least:
- the gate
- the first title moment
- the middle of each scene
- every interaction prompt, before and after
- the climax
- the letter
- the end screen (`await card.snap(card.timing.duration)`)

Do it at 390×844 and again at desktop size (1440×900).

## What to look for

Look at each screenshot as the recipient would:
- **Text:**
  - readable contrast
  - not cut off by the notch or screen edges
  - long names fit
  - no orphaned last words
  - no overlap with UI
- **Framing:**
  - the subject centred and fully visible on portrait
  - faces not cropped (check `focus`)
  - 3D subject not too close or too far
- **Clipping/intersections:** 3D objects passing through each other (balloons, photo cards, props), particles drawn through text. Fix these; viewers notice immediately.
- **Empty or broken frames:** a black canvas (WebGL failed → is there a fallback?), placeholder art left in, missing images (404s in the network log).
- **Sync:**
  - with `?debug`, check the big moments sit on bar lines and section boundaries
  - the title lands with the intro
  - the climax hits the chorus or drop
  - the letter has quiet time
- **The end state:** the letter is fully readable; replay works (`card.replay()` → `card.state().t` resets); the keepsake gallery opens the lightbox.
- **Variants:**
  - `?reduced`: still beautiful, no fast motion
  - `?quality=low`: still works
  - `?silent`: the visuals don't depend on audio

## Numeric checks

Some problems are easier to catch with a quick evaluation than by eye.

**3D overlap.** Sample the scene over time and assert minimum distances. For example, with Balloons3D:

```js
const B = card.entries.find(e => e.id === 'wish').scene.balloons;
let worst = 0;
for (let wall = 0; wall < 40; wall += .25) for (const appear of [.3, 1]) for (const lift of [0, .5]) {
  B.update({ wall, reducedMotion: false, levels: { beat: 1 } }, { appear, lift });
  B.items.forEach((a, i) => B.items.forEach((b, j) => { if (j > i) {
    const min = .6 * (a.scale + b.scale), d = B._c[i].distanceTo(B._c[j]);
    worst = Math.max(worst, (min - d) / min); } }));
}
worst   // must be ≤ 0
```

Write the equivalent for any custom 3D layout: photo cards, lanterns, flying caps.

**Music levels** (synth route): open `/song-preview.html?song=song.js` and check `peakDb` ≤ −1, `clipped` = 0, and no notation warnings.

**Payload:**
```bash
du -sh <card> && find <card> -size +3M
```
Large images mean the media wasn't prepared. Videos should be prepared MP4s.

**Leftovers:**
```bash
grep -rn "Alex\|Sam\|TODO\|placeholder" <card>/content.js <card>/index.html
```
This catches template names left behind. Also check `index.html` `<title>`/`og:*` say the right name.

## Checklist

- [ ] No console errors; `failedScenes` empty; no 404s
- [ ] Gate → audio plays on the first tap; mute works; the "Tap for sound" fallback appears when blocked
- [ ] Every scene looks right at 390×844 and 1440×900 (snapshots reviewed)
- [ ] Big moments land on the music; the letter has reading time; the end screen stays
- [ ] Interactions work by tap; mic/motion features have fallbacks and deadlines
- [ ] No 3D interpenetration (numeric check for anything moving)
- [ ] Reduced motion and low quality render properly
- [ ] Text: names spelled right everywhere (content.js, title, OG tags, Suno lyrics), drafts marked for the sender to edit
- [ ] Credits for every non-original asset; licences OK for public hosting
- [ ] Privacy: EXIF stripped (prepare_media), `noindex` present, no personal data the sender didn't intend to publish
- [ ] Payload sane (≤ ~15 MB without video); `README.md` + `CREDITS.md` written
