---
name: celebration-card
description: Build an interactive, music-driven celebration card website the creator can send as a link. It covers birthdays, retirements, anniversaries, weddings, graduations, new babies, promotions, farewells, holidays, thank-yous and group cards from a team. Covers the whole pipeline. Concept first. Then audio (a Suno song prompt written first and the card built to match it, ElevenLabs music or voice, Claude-composed Web Audio music, or public-domain/CC0 recordings). Then optional photo/video prep, beat-synced 3D visuals, effects and transitions, mobile QA, and deploying a shareable link. Use this skill whenever someone wants an e-card, animated greeting, surprise page, birthday website, anniversary microsite, retirement tribute, virtual group card, or any 'make something special for X' web experience. That holds even without the word 'card', e.g. 'something fun for my mom's 60th', 'a surprise page for our anniversary with our photos and a song', 'write a Suno prompt for my dad's retirement and build a site around it'.
---

# Celebration Card

Build a short, personal, music-driven web experience that someone sends as a link to celebrate a person: a birthday, retirement, anniversary, graduation and so on. Done well, it feels like a tiny film made for one person, with their name, their story and a song that fits. They tap to open it, it plays for one to three minutes, and it ends on a keepsake they can keep reading and replay.

The output is a static folder (HTML, JS and assets) built from this skill's template. A small engine already handles the plumbing: the tap that unlocks audio, keeping visuals locked to the music, the scene timeline, QA hooks, and fallbacks for weak phones. Your job is the creative part: the concept, the words, the music, and the scenes.

## What makes a card great

- **Specific beats generic.** The concept should grow from the person: their hobbies, a running joke, the place they met, the milestone number. "Balloons + Happy Birthday" with a swapped name is what a template site does. Ask for two or three real details and build around them.
- **Music is the spine.** Pick the audio route first, because its structure (intro, verse, chorus, drop, outro) becomes the timeline. Big visual moments land on downbeats and section changes, which is the difference between a slideshow and something that feels alive.
- **One idea, a few strong moments.** The usual arc is gate → reveal → story → one interactive moment → climax → letter/keepsake. Contrast calm and bursts. Every effect should serve the concept.
- **Phone-first.** Most recipients open the link on a phone from a text message, so design for 390×844 portrait first and desktop second.
- **The gate is part of the gift.** Browsers block sound until a tap, so the opening tap (an envelope, a gift box, a door) does double duty as reveal and audio unlock.
- **Words matter most.** Short, specific, heartfelt copy beats paragraphs. The closing letter is the emotional peak; let the sender's voice come through. If you draft it, say so and invite edits.
- **Photos and video are optional.** Without them, lean on 3D objects, particles, typography and illustration. The template's default demo uses no photos at all.

## Workflow

### 1. Gather the story in one round

Work out what you already know from the request. Then ask only for what's missing and matters, in **one** round. If a structured question tool is available, put several questions in a single call. Must-haves:

- recipient name (plus nickname and pronunciation if it's unusual) and occasion
- who it's from (one person, a couple, a whole team)

Worth asking:

- relationship and tone (heartfelt, funny, elegant, epic, gentle)
- two or three personal details or memories
- the milestone number (age, years married, years of service)
- photos or videos, and where they are
- the message, or permission to draft one
- the audio route (offer a recommendation; see step 2)
- where it should end up: just the folder, or published for them on Cloudflare Pages, Vercel, Netlify or surge.sh. Ask which account or team, and whether they want a particular link name. Use what they give you (platform, project name, team) in step 8. Never ask them to paste a token into chat: they log in with the platform's CLI or set an environment variable.

If the user says "just make it", proceed on sensible defaults and list your assumptions at the end. Don't stall on optional details.

### 2. Choose the audio route, because it shapes the timeline

| Route | Best when | Read |
|---|---|---|
| **Suno song** | They want a real song *about* the person, with their name in the chorus | `references/suno.md` |
| **ElevenLabs** | Credits/MCP are available. Exact section timing; also voice messages and bespoke SFX. Costs money, so confirm first | `references/elevenlabs.md` |
| **Synthesized by you** | Free, instant, no licensing. Public-domain melodies (Happy Birthday, Auld Lang Syne, Canon in D…) or an original tune. The score *is* the timeline, so sync is perfect | `references/synth-music.md` |
| **Public-domain / CC0 recording** | A classic piece or an existing free track. Verify the *recording's* license (composition ≠ recording) and credit it | `references/audio-sources.md` |
| **User's own file / a song they already made** (Suno, ElevenLabs, anything) | They hand you audio up front. Analyze it **before** designing (below). Mention rights if it's a commercial recording going on a public page | `references/audio-sources.md` |

**If the user gives you audio up front, the song leads.** Analyze it before writing the brief, so the concept and scene plan are built on its real structure, not guesses:

1. Create the card folder from the template (step 5's `cp -R`), then copy the song to `<card>/assets/audio/song.mp3`, converting WAV/M4A/FLAC to MP3 with ffmpeg.
2. Run `scripts/analyze_audio.py` (step 6 shows the command) and read the report: tempo, meter, first downbeat, sections with energies, the climax, and the energy curve.
3. Pin down what the sections really are. Best evidence first:
   - **Lyric timestamps** for vocal songs. Use a local Whisper (`whisper song.mp3 --model small --word_timestamps True --output_format json`; free and offline) or ElevenLabs alignment, then match the known lyrics to the timings.
   - The energy shape.
   - The user marking section starts by ear in `?debug` (the M key).
   - Asking the user.
4. Re-run with the final names.

Then write the sync plan against those measured times. Put the big visual moments where the song actually lifts, give quiet passages to the letter and reflective scenes, let lyric lines that mention a memory trigger the matching visual, and fit the length of each scene to the section it lives in. The visuals follow the song, never the other way round.

**The Suno route is prompt-first** when you're the one writing the song. Write `suno-prompt.md` (title, styles, structured lyrics, settings) before building anything. Hand it to the user with clear steps. Then build the whole card against the prompt's planned structure:

```js
audio: { src: 'assets/audio/song.mp3', analysis: 'assets/audio/analysis.json', plan: { bpm, meter, sections } }
```

Until the MP3 exists, the card runs on the plan. Give it a **guide track**: render a quick instrumental with exactly the planned structure from `music/` (synth-music.md). That way the card isn't silent and the whole sync path can be tested now. When the song arrives, analyze it, map its real sections to your names, and re-check the timing. If nobody can generate the song right now (or you're running unattended), deliver the card on the guide track with exact instructions for dropping in the song and re-syncing.

### 3. Concept and sync plan

Write a short creative brief:

- **Concept:** one sentence tying the visuals to the person (e.g. "a night garden that blooms one flower per decade").
- **Look:** palette (3–5 colours, from the photos if there are any), type pairing, motion language.
- **Interactive moment:** blow out candles, pop balloons, catch stars, scratch to reveal, light lanterns.
- **Sync plan:** a table of section → time → scene → key moment on the beat.

Share the brief briefly unless the user asked you to just go. See `references/occasions.md` for per-occasion ideas and sensitivities (anniversary materials by year, retirement tone, memorial cards).

### 4. Prepare media (only if they gave photos or video)

```bash
python3 <skill>/scripts/prepare_media.py <their files or folders> --out <card>/assets/media
```

This fixes rotation, strips GPS and other metadata, resizes to WebP, transcodes video to H.264 MP4 with a poster frame, and writes `media.json` (sizes, dates, dominant colours). If it flags photographer or copyright metadata, the photo may not be the sender's own, so mention it before publishing. **Look at every photo** with your image-reading tool, then:

- write captions from what you actually see
- pick the hero shot
- set `focus: [x, y]` on the faces so zooms and crops never cut heads off
- order the photos (chronological works well for "through the years")

### 5. Build from the template

```bash
cp -R <skill>/assets/template <output-dir>/<card-slug>     # e.g. ./maya-30th-birthday
```

Read `references/runtime-api.md` before writing scenes; it covers the engine, the scene contract and every effect module. Then:

- `content.js`: every word, name, photo and caption goes here, so the sender can edit text later without touching code.
- `index.html`: `<title>`, `og:*` tags (static; link previews don't run JS), the gate markup restyled to the concept, and font links.
- `styles.css`: palette tokens (`--c-*`) and fonts. Canvas effects read the tokens, so colour lives in one place.
- `main.js`: audio route, scene timeline (anchored to section names like `'chorus'`, `'verse2+4bar'`), cues on the beat, shared effects.
- `scenes/*.js`: write scenes for *this* concept. The template's scenes (`opening`, `wish` 3D cake, `finale`, `letter`, optional `photo-gallery`) are worked examples of the mechanics. Adapt them freely or replace them, and delete what you don't use.
- `music/song.js` for the synthesized route; otherwise `assets/audio/`.

Principles that keep cards correct:

- **Animate as a pure function of time** (`s.t`, `ctx.t`, the `anim.js` helpers), never by accumulating per-frame deltas. That's what lets the card pause, seek, replay and be screenshotted at any moment, and it keeps everything locked to the music.
- **Anchor moments to the music** (`ctx.at('chorus')`, cues with `every: 'bar'`), not hard-coded seconds. When the timing changes (the real Suno song arrives), the visuals follow.
- **Text goes in the DOM, not on canvas.** It stays crisp, selectable and readable by screen readers. Fit long names with `fitText`.
- **3D objects must never interpenetrate.** Balloons, photo cards and props get spacing at placement plus a separation pass when they move. Check it numerically (see `references/qa.md`); clipping is the first thing viewers notice.
- **Budget for phones, starting with the first impression.** The gate should be tappable within a few seconds.
  - Every 3D scene shares one stage (`getStage(ctx)`), and each owns a group.
  - Call `stage.prime(group)` in `init` *without* awaiting it, so shaders compile in the background instead of freezing the first 3D frame after the tap.
  - Respect `ctx.quality` (particles, DPR, bloom) and `ctx.reducedMotion`.
  - The stage renders only while a scene calls `stage.show()`.

For techniques (3D scenes, particles, shader backgrounds, photo treatments, transitions, kinetic type, interactions) read `references/visual-cookbook.md`.

### 6. Sync to the music

**Synthesized songs** are already exact. **Every audio file** gets analyzed, whether it's Suno, ElevenLabs, PD/CC0, or a file the user provided. Never hand-guess timings for a real recording:

```bash
python3 <skill>/scripts/analyze_audio.py <card>/assets/audio/song.mp3 --out <card>/assets/audio/analysis.json [--bpm 96] [--meter auto|2|3|4]
```

It prints tempo, bar lines (3/4 vs 4/4 detected automatically) and a section table with guessed names and energies. Use `--meter 2` for cut-time songs: marches, fox-trots, polkas, many pre-1950 recordings. If it says the recording is quiet, normalize it with the printed ffmpeg command. Then:

1. Confirm the sections using lyric timestamps (ElevenLabs alignment or speech-to-text, ideally on a vocal stem), the song's known structure (Suno lyrics), the energy curve, or by asking the user.
2. Re-run with `--names …` or `--sections "0:intro,12.4:verse1,…"` so the names match what `main.js` uses.
3. Check the climax lands where the song actually lifts.

The JSON also gives the card:
- **The real beat grid.** `every: 'bar'` cues follow the measured beats, so a live drummer's drift is fine.
- **Loudness bands per frame.** They drive `ctx.levels` (bass/mid/treble/onset), so glows, pulses and particle bursts breathe with *this* recording, and stay identical on every replay and screenshot.

Use both. A scene that only knows section boundaries feels like a slideshow; one that also hits downbeats and swells with the bass feels like a music video.

### 7. QA in a real browser before calling it done

Follow `references/qa.md`. Serve the folder with `python3 <skill>/scripts/serve.py <card>`; ES modules don't load from `file://`, and this server supports the range requests audio seeking needs. Then:

- run `node <skill>/scripts/snap.mjs <url> --out <card>/qa --tap --desktop --times …` (or drive a browser yourself) at 390×844 and at desktop size
- tap the gate and confirm the clock runs (`card.state()`). `snap.mjs` also reports `gateReadyMs`; a cold-cache desktop should be ready in about 5 s or less.
- capture each scene with `await card.snap(t)` and look at every screenshot critically: legibility, cropping, overlap with the notch, empty frames, clipping 3D objects
- check the console for errors, reduced motion, `?quality=low`, and the end screen

Fix what you find, then look again.

### 8. Deliver

**If they want it published,** use `scripts/deploy.py` (details in `references/deploy-and-share.md`):

1. **Plan:** `python3 <skill>/scripts/deploy.py <card> --to cloudflare|vercel|netlify|surge [--name <slug>] [--team <team>]`. It prints the public URL, what will be uploaded, and whether the CLI is logged in. If it isn't, relay the exact login step it prints (e.g. `! npx wrangler login`) and wait.
2. **Confirm:** show the user the plan and get a clear yes. Publishing puts their photos and words on a public URL.
3. **Publish:** re-run with `--yes`. It writes absolute link-preview tags for the live address, deploys, checks the page, preview image and audio seeking over HTTPS, and saves the settings in `<card>/deploy.json`. Later edits redeploy with `deploy.py <card> --yes`.

**If not,** hand over the folder with the hosting options in `references/deploy-and-share.md`.

Either way, cover:
- privacy: an unguessable link name, `noindex`, and the fact that public hosts make the photos public
- a teaser `og.jpg` for link previews
- an optional QR code for a printed card
- a short "how to send it" note

Finish with a `README.md` in the card folder covering how to preview, edit text (`content.js`), swap the song, and deploy, plus `CREDITS.md` with audio and asset licenses.

## Guardrails, and why they matter

- **Sound needs a tap.** Start audio only from the gate's click handler (the runtime does this). On iOS, `navigator.audioSession.type = 'playback'` keeps Web Audio audible with the ringer switch off; the runtime and `sfx.js` already set it.
- **Licensing.** A public-domain *composition* (Beethoven, "Happy Birthday") doesn't make a *recording* free. Use PD/CC0 recordings or synthesize, record sources in `CREDITS.md`, and prefer CC0/CC-BY over CC-BY-SA. Don't host commercial songs on a public page without telling the user the risk.
- **People's voices and likeness.** Never clone a real person's voice without their consent; the sender cloning their *own* voice is fine. Don't generate fake photos of real people.
- **Privacy.** These pages hold family photos and names. The prep script strips GPS. Use unguessable URLs and `noindex`, and warn that public repos (GitHub Pages free tier) expose the photos.
- **Photosensitivity.** No full-screen flashes and no more than 3 flashes per second. Fireworks are local glows. Honour `prefers-reduced-motion`.
- **Sensitive occasions.** For memorials, get-well and farewells after hard news, use a calm palette, no confetti, gentle music and slower pacing. Be gentle in conversation too.
- **Spending the user's money.** ElevenLabs generation and Suno downloads cost credits or quota. Confirm before using paid generation.

## Reference files

| File | Read when |
|---|---|
| `references/runtime-api.md` | Before writing `main.js` or scenes. The engine, scene contract, timing expressions, every fx module |
| `references/visual-cookbook.md` | Designing scenes: 3D, particles, shaders, photo/video treatments, transitions, typography, interactions, design rules |
| `references/occasions.md` | Developing the concept for a specific occasion; group cards; sensitive occasions |
| `references/suno.md` | Suno route: prompt format, lyrics, pronunciation, settings, hand-off, syncing the delivered song |
| `references/elevenlabs.md` | ElevenLabs music (composition plans with exact timing), voice, SFX, lyric timestamps |
| `references/synth-music.md` | Composing with `music/music.js`: notation, presets, arrangement recipes, PD melodies, example songs |
| `references/audio-sources.md` | Public-domain / CC0 sources an agent can fetch, licence checks, credits, the user's own files |
| `references/qa.md` | Browser QA procedure, `card.snap()`, overlap checks, performance, checklist |
| `references/deploy-and-share.md` | Publishing with `deploy.py` (logins, tokens, teams, redeploys, take-down), other hosts, link previews, privacy, QR codes, the hand-off note |

Scripts:
- `scripts/prepare_media.py`: photos and video
- `scripts/analyze_audio.py`: beats, sections, loudness bands
- `scripts/serve.py`: local preview with seeking and no caching
- `scripts/snap.mjs`: headless QA screenshots and state report
- `scripts/deploy.py`: publish to Cloudflare Pages, Vercel, Netlify or surge.sh, with plan-then-confirm and live checks
