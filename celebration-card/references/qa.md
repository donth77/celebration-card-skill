# QA: verify in a real browser before you call it done

A card that's broken on the recipient's phone is worse than no card. Test like the recipient: phone-sized, from the tap, with sound. Then use the QA hooks to inspect every moment.

## Contents
1. [Serve it](#serve-it)
2. [Drive it](#drive-it)
3. [Screenshot every moment](#screenshot-every-moment)
4. [What to look for](#what-to-look-for)
5. [Phones and browsers](#phones-and-browsers)
6. [Numeric checks](#numeric-checks)
7. [Checklist](#checklist)

Speed and smoothness have their own guide: `performance.md`.

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

It writes phone (and, with `--desktop`, 1440×900) screenshots plus `qa-report.json`: card state, failed scenes, console errors, failed requests, and whether audio started after the tap. Then run it again as an iPhone, upright and sideways (`--webkit --notch`, see [Phones and browsers](#phones-and-browsers)). **Then open every PNG and look at it.** The script captures; you judge. It needs the `playwright` package and its Chromium browser. It looks in the project first, then in the npx cache (for example the copy the Playwright MCP server uses). If neither has one, add Playwright to the project, or point at an installed copy with `--playwright <path>`.

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
   - If one scene's `init` dominates, defer the heavy parts. Don't await `stage.prime()`, and lazy-load textures for scenes that start late. More in `performance.md`.

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

## Phones and browsers

Most people open the link on a phone: Safari on an iPhone, or Chrome (or Samsung Internet, Brave…) on Android, often not the newest. Every browser on an iPhone uses Safari's engine, and so do the in-app browsers of WhatsApp, Instagram and the like. So run `snap.mjs` as an iPhone too, upright and sideways:

```bash
node <skill>/scripts/snap.mjs http://localhost:8765/ --out <card>/qa/iphone --webkit --notch --tap --times gate,start,…,end
node <skill>/scripts/snap.mjs http://localhost:8765/ --out <card>/qa/iphone-side --webkit --notch --landscape --times gate,…,end
```

- `--webkit` uses Playwright's WebKit build (Safari's engine) at Safari's real visible size, once its bars take their share: 390×664 upright, 844×342 sideways.
- `--notch` draws the notch, the rounded corners and the home bar on the shots, and lists any text or button under them as `unsafe` in `qa-report.json`. Fix every one.
  - Sideways is what Safari really shows: the page runs under the notch's side.
  - Upright is the worst case: the page full screen behind the notch and the home bar, as when it's saved to the home screen.
  - It simulates the notch through the `--safe-t`, `--safe-r`, `--safe-b` and `--safe-l` CSS variables, so position things with those, never with `env()` directly.

### iPhone

- **Sound starts only inside a tap.** Call `play()` in the tap's handler itself, not after an `await` or in a `.then()`. That goes for the song and for any video with sound. After that, the same element can play again from code.
- **No full screen for pages, and no orientation lock.** Only a `<video>` can go full screen, in Apple's own player. Design around Safari's bars; to show something sideways, turn it with CSS while the phone is upright.
- **The visible area changes size** as the bars grow and shrink: `vh` is the largest size, `dvh` the current one. Layouts measured in JavaScript must measure again on `resize`, and ease to the new place rather than jump.
- **Volume is read-only:** mute with `muted`, not `volume` (the runtime does).
- **The silent switch:** `<audio>` and `<video>` play through it. Web Audio needs `navigator.audioSession.type = 'playback'`, which the runtime sets.
- **Low Power Mode:** 30 frames a second, and no autoplay, even muted. Give videos a poster and a play button.
- **Hosts without range requests.** Cloudflare Pages answers them with the whole file, and Safari can't seek in a file streamed from such a host, so replaying a streamed song freezes. The runtime plays the song from memory and holds the gate until it's loaded. For long video, use HLS (separate chunk files), not one big MP4.
- **Older iOS.** A phone a few years old may not be updated. The template needs iOS 15 (WebGL 2). Newer features need a fallback or a check:

  | Feature | Safari / iOS |
  |---|---|
  | `aspect-ratio`, WebGL 2 | 15 |
  | `dvh`/`svh`, `:has()`, `<dialog>` | 15.4 |
  | container queries, `cqw`/`cqh` units | 16 |
  | `color-mix()` | 16.2 (the template gives a plain colour first) |
  | import maps, `navigator.audioSession` | 16.4 (the template adds an import-map fallback; the runtime checks for the session) |
  | CSS nesting | 16.5 |
  | `backdrop-filter` without the `-webkit-` prefix | 18 (write both) |

- **Old Safari quirks.** The template handles these; keep them when you restyle.
  - A `<button>`'s contents may not centre with grid or flex. Centre icons by position, and draw them as SVG rather than characters such as ✕, whose position depends on the font.
  - `-webkit-` prefixes are still needed for `backdrop-filter`, `mask` and `backface-visibility` on older versions, and for `text-size-adjust`, `touch-callout` and `user-select`.
  - A quick second tap zooms the page and a long press opens a menu, unless `touch-action: manipulation` and `-webkit-touch-callout: none` are set.
  - Text grows when the phone turns, unless `-webkit-text-size-adjust: 100%` is set.
  - Hover styles stay on after a tap on a touch screen: put them in `@media (hover: hover)`.

### Android

- A page can go full screen and lock to landscape after a tap. The page changes size when it does, and when the address bar slides away: layouts must follow smoothly.
- Chrome's own HLS player picks a copy by the player's size, often 360p on a phone: play HLS with hls.js.
- After a tap on the site, video may play with sound.

### Hosts

- **Cloudflare Pages:** no range requests (the deploy's audio check shows 200, which the in-memory song handles) and files up to 25 MB.
- After publishing, open the live link on a phone: the link preview, the tap, the sound, and a replay.

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
- [ ] Checked as an iPhone (`--webkit --notch`, upright and sideways): no `unsafe` items, sound starts on the tap, a replay works
- [ ] Performance: the checklist in `performance.md`
- [ ] Big moments land on the music; the letter has reading time; the end screen stays
- [ ] Interactions work by tap; mic/motion features have fallbacks and deadlines
- [ ] No 3D interpenetration (numeric check for anything moving)
- [ ] Reduced motion and low quality render properly
- [ ] Text: names spelled right everywhere (content.js, title, OG tags, Suno lyrics), drafts marked for the sender to edit
- [ ] Credits for every non-original asset; licences OK for public hosting
- [ ] Privacy: EXIF stripped (prepare_media), `noindex` present, no personal data the sender didn't intend to publish
- [ ] Payload sane (≤ ~15 MB without video); `README.md` + `CREDITS.md` written
