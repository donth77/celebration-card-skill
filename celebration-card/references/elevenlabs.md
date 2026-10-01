# ElevenLabs route: music with exact timing, voice, sound effects, lyric timestamps

ElevenLabs can generate:
- **music**, with a composition plan whose section durations are honoured exactly, which makes it ideal for syncing
- **speech**, for a narrated greeting or a voice note from the sender
- **custom sound effects**
- **word timestamps** for lyrics

All generation spends the user's credits. Confirm before generating, unless they explicitly asked for ElevenLabs, and say roughly what you'll make.

Facts are as of late 2026. Check the tool descriptions in your session, because MCP tools lag behind the REST API.

## Contents
1. [Which interface you have](#which-interface-you-have)
2. [Music with a composition plan](#music-with-a-composition-plan)
3. [Turning the plan into card timing](#turning-the-plan-into-card-timing)
4. [Voice](#voice)
5. [Sound effects](#sound-effects)
6. [Lyric / word timestamps (for any song)](#lyric--word-timestamps)
7. [Costs, rights, restrictions](#costs-rights-restrictions)

## Which interface you have

- **ElevenLabs MCP tools** (names like `compose_music`, `create_composition_plan`, `text_to_speech`, `text_to_sound_effects`, `speech_to_text`, `check_subscription`):
  - Use them directly. Pass `output_directory` pointing at `<card>/assets/audio`, otherwise files land on the Desktop.
  - As of late 2026 the MCP `compose_music` offers `music_v1` / `music_v2`, with no timestamps.
  - `create_composition_plan` is free, and accepts 10–300 s.
- **REST API with an `ELEVENLABS_API_KEY`** (via curl):
  - It exposes newer models (`music_v2_5`), `/v1/music/detailed` with word timestamps, Forced Alignment, and stem separation.
  - Never print or commit the key.
- **Neither:** pick another route, or give the user a prompt to paste into the ElevenLabs web app (same structure as the Suno route).

Check credits first with `check_subscription` (MCP) when it's available.

## Music with a composition plan

On `music_v2`+ a plan is a list of **chunks**. Each chunk has:
- `text`: the section label, lyrics and inline directions
- `duration_ms`: 3,000–120,000, **enforced exactly**
- `positive_styles` and `negative_styles`
- `context_adherence`: `low` / `medium` / `high`

Other limits:
- Up to 30 chunks.
- The first chunk's styles set the overall sound, so give it 6–7 strong ones.
- Lyrics go in `text` with section tags, e.g. `"[Chorus]\nHappy birthday, Maya…"`. Instrumental chunks just describe the music.

Workflow:
1. **Draft the plan from the card's story.** Decide the scenes first, then make chunk durations whole bars at your chosen tempo, so visual changes land on bar lines.
   - Bar = `meter × 60 / BPM`. At 100 BPM in 4/4 a bar is 2,400 ms; an 8-bar chorus is 19,200 ms.
   - Put the BPM in the styles ("100 BPM").
2. Optionally call `create_composition_plan` (free) with a prompt and length to get a starting plan, then edit its chunks.
3. Call `compose_music` with `composition_plan` (and `model_id: music_v2` or newer) and `output_directory: <card>/assets/audio`. Rename the result `song.mp3`.
4. **Analyze it anyway** (`analyze_audio.py`). Durations are exact, but you still want the measured beat grid and loudness bands. Pass the plan's boundaries as `--sections` so names and times match exactly.

Example plan (instrumental birthday pop, 100 BPM, 4/4 → 2.4 s bars):

```json
{ "chunks": [
  { "text": "[Intro] warm piano and finger snaps, building anticipation", "duration_ms": 9600,
    "positive_styles": ["feel-good pop", "warm piano", "finger snaps", "handclaps", "joyful", "100 BPM", "polished mix"],
    "negative_styles": ["sad", "distorted", "vocals"], "context_adherence": "high" },
  { "text": "[Verse] light groove enters, bass and soft drums, playful melody on bells", "duration_ms": 19200,
    "positive_styles": ["bouncy bass", "glockenspiel melody"], "negative_styles": [], "context_adherence": "high" },
  { "text": "[Build] snare roll and rising synths into the drop", "duration_ms": 4800,
    "positive_styles": ["riser", "snare build"], "negative_styles": [], "context_adherence": "high" },
  { "text": "[Chorus] full band, big claps, euphoric hook", "duration_ms": 19200,
    "positive_styles": ["anthemic", "big drums", "bright synths"], "negative_styles": [], "context_adherence": "high" },
  { "text": "[Outro] piano alone, gentle, final chord rings", "duration_ms": 9600,
    "positive_styles": ["soft piano", "tender"], "negative_styles": ["drums"], "context_adherence": "high" }
] }
```

That song is 62.4 s long: intro 0–9.6, verse 9.6–28.8, build 28.8–33.6, chorus 33.6–52.8, outro 52.8–62.4.

Lyrics with the person's name work like Suno (see `suno.md`): phonetic spelling, numbers as words, short singable lines. No artist names or copyrighted lyrics. The API rejects them with a suggested rewrite.

## Turning the plan into card timing

```bash
python3 <skill>/scripts/analyze_audio.py assets/audio/song.mp3 --bpm 100 --out assets/audio/analysis.json \
  --sections "0:intro,9.6:verse1,28.8:build,33.6:chorus1,52.8:outro"
```

Then anchor scenes and cues to those names (`'build'`, `'chorus1'`). The drop at `chorus1` is your confetti/fireworks cue.

## Voice

- **Narrated greeting / voice of the card:** `text_to_speech` with a library voice that fits the tone.
  - Keep it short (10–25 s), and put it in the intro or a quiet section.
  - Duck the music under it with `clock.setVolume(0.35)` (file route). iOS ignores element volume, so leave headroom in the music instead, or render the voice into the song.
- **The sender's own voice:** they can record it themselves, which is best: a real voice note beats any synthesis. Clone a voice **only** with that person's explicit consent. Never clone or imitate the recipient, a celebrity, or anyone who hasn't agreed.
- Model notes (MCP): `eleven_v3` is the most expressive; `eleven_multilingual_v2` covers 29 languages.
- Treat a voice message like a video message: give it a caption (accessibility), and keep a transcript in `content.js`.

## Sound effects

`text_to_sound_effects` makes 0.5–5 s clips: "envelope tearing open", "champagne cork pop then fizz", "school bell ringing", "crowd cheering in a small room", "airplane cabin chime". Save them to `assets/audio/sfx/` and play them with `new Audio()` on interactions.

Synthesized `sfx.js` sounds cover pops, chimes, whooshes and booms for free. Use ElevenLabs for anything specific to the concept.

## Lyric / word timestamps

Useful for any vocal song (Suno, ElevenLabs, the user's file), to find where sections really start or to show karaoke lines:
- **ElevenLabs-generated songs (REST):** `POST /v1/music/detailed` with `with_timestamps: true` returns `words_timestamps: [{ word, start_ms, end_ms }]`.
- **Forced Alignment (REST):** `POST /v1/forced-alignment` takes the audio file plus the plain lyrics (remove `[tags]`) and returns `words: [{ text, start, end, loss }]`. This is the best way to time known lyrics.
- **Speech-to-text:** Scribe returns word timings via REST. The MCP `speech_to_text` returns text without timings, which is still useful to confirm the lyrics.

**Free alternative:** if a local Whisper is installed (`which whisper`), `whisper song.mp3 --model small --word_timestamps True --output_format json` gives word timings offline at no cost. Use them for timing and display the known lyrics.

Singing over a full mix aligns less reliably than speech. Use an isolated vocal stem where possible (a Suno stem download, or ElevenLabs stem separation), check that the timings run in order, and treat high `loss` words with suspicion. Fall back to section-level sync from `analyze_audio.py` when alignment is poor.

## Costs, rights, restrictions

- Music generation needs a paid plan. Self-serve paid plans allow broad use of the output; a personal card is fine.
- Ask before spending credits on long music. Plans are free; songs are not.
- No artist names, song titles or copyrighted lyrics in prompts.
- Voice cloning needs consent, and the service may verify it.
