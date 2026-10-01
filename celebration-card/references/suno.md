# Suno route: write the song prompt first, build to match, sync when it arrives

A song with the person's name in the chorus is the most moving thing a card can have. Suno has no public API, so the user generates the song themselves. Your job:
1. Write a great prompt.
2. Plan the card around the song's intended structure.
3. Build everything while they generate.
4. Sync precisely once the MP3 arrives.

Facts below are current as of late 2026 (Suno v6). Suno changes often: if the user's screen differs, adapt.

## Contents
1. [What Suno offers now](#what-suno-offers-now)
2. [The prompt file](#the-prompt-file)
3. [Styles](#styles)
4. [Lyrics](#lyrics)
5. [Planning the timeline before the song exists](#planning-the-timeline-before-the-song-exists)
6. [Handing off to the user](#handing-off-to-the-user)
7. [When the song arrives: sync](#when-the-song-arrives-sync)
8. [Optional: on-screen lyrics](#optional-on-screen-lyrics)
9. [Rights and limits](#rights-and-limits)
10. [Worked example](#worked-example)

## What Suno offers now

**Models**
- v6 is the default on Pro/Premier. v6-mini is the free-tier model.
- Older models (v4.5/v5) are retired, so ignore advice written for them.

**Create mode:** use **Advanced**. Simple mode may rewrite your lyrics.

**Fields and limits**
| Field | Limit | Note |
|---|---|---|
| Lyrics | up to 5,000 chars | best ≤ 3,000 |
| Styles | 1,000 chars | anything past the limit is silently cut, so put the important words first |
| Exclude styles | 1,000 chars | |
| Title | ~80 chars | |

**More Options**
- Vocal Gender
- Duration: Auto, or Custom from 10 s to 6 min. It's a target, not exact.
- **Variety: set it to 0** so the style text is used as written.
- Weirdness: ~30–40% for a safe, catchy result.
- Style Influence: ~65–75%.
- Instrumental toggle.

**Generation and editing**
- Each generation yields **two** takes.
- The Song Editor shows section clips and the tempo, and can crop, fade out or replace a line.
- Stems (vocals/instrumental) can be split on paid plans.

**Not reliable:**
- BPM/key in the prompt is a *hint*. Measure the delivered tempo instead.
- Exact intro or section lengths can't be guaranteed.

## The prompt file

Write `suno-prompt.md` in the card folder first, before any scene code. Use this shape:

```markdown
# A song for Maya — 30th birthday

## How to make it (≈5 minutes)
1. suno.com → Create → **Advanced** (use v6 if you have it).
2. Paste **Lyrics** into Lyrics, **Styles** into Styles, **Exclude styles** into Exclude Styles. Title: "Thirty Looks Good On You".
3. More Options: Vocal gender **Female** · Duration **Custom 2:20** · **Variety 0** · Weirdness ~35% · Style influence ~70%.
4. Create. You get 2 versions; listen for (a) "Maya" sung right, (b) a short instrumental intro, (c) a big final chorus. Make more if needed.
5. Download the best as **MP3** and save it to `maya-30/assets/audio/song.mp3`, then tell me.
   (Free plan has very few downloads, so download only your final pick.)

## Title
Thirty Looks Good On You

## Styles
upbeat 90s R&B pop, new jack swing groove, warm Rhodes, finger snaps, punchy drums, lush stacked harmonies, female lead vocal, joyful, celebratory, 98 BPM, crisp modern mix

## Exclude styles
rap, autotune heavy, distorted guitar, sad, slow ballad

## Lyrics
[Intro - short, instrumental, Rhodes and snaps]

[Verse 1]
…

## Planned structure (what the card is built to; the real song will differ a little)
| section | bars @ 98 BPM 4/4 | ≈ start |
| intro | 4 | 0:00 |
| verse1 | 8 | 0:10 |
…
```

## Styles

Order matters, because text past the limit is cut. Use this order:
1. genre + era
2. groove/feel
3. 2–4 signature instruments
4. vocal description
5. mood words
6. tempo as a number ("98 BPM")
7. production descriptor

| Mood | Example styles line |
|---|---|
| Joyful pop birthday | `bright modern pop, handclaps, plucky synths, big chorus, female vocal, euphoric, 112 BPM, polished mix` |
| Warm sentimental (anniversary) | `acoustic folk pop, fingerpicked guitar, soft piano, gentle strings, warm male and female duet, tender, 84 BPM, intimate` |
| Retirement anthem | `feel-good classic rock and soul, horn section, Hammond organ, gang vocals, triumphant, 104 BPM` |
| Funny/roast | `cheeky ska punk, upstroke guitars, brass stabs, playful male vocal, comedic, 150 BPM` |
| Elegant | `cinematic orchestral pop, strings, harp, piano, soaring female vocal, majestic, 76 BPM` |
| Kids / new baby | `gentle lullaby, music box, celesta, soft ukulele, whispery female vocal, dreamy, 70 BPM` |
| Retro 80s | `80s synthpop, gated reverb drums, analog synth bass, shimmering pads, male vocal, nostalgic, 118 BPM` |

Rules:
- **No artist or band names, and no song titles.** They're blocked or rewritten; describe the sound instead.
- **No conflicting cues** ("slow ballad, 140 BPM").
- **Put dislikes in Exclude styles**, not as negatives in Styles.
- If the user names a favourite artist, translate it into instrumentation and era words.

## Lyrics

**Shape for a card (2:00–2:30):**

```
[Intro - short, instrumental, <instrument>]          ← room for the gate opening + title
[Verse 1]            4 lines — a specific memory
[Pre-Chorus]         2 lines — optional lift
[Chorus]             4 lines — the name + the big feeling (repeatable, simple)
[Verse 2]            4 lines — another detail / the present
[Chorus]
[Bridge - drums drop out, intimate]   2–4 lines — the emotional or funny peak
[Final Chorus - bigger, key change up, harmonies]     ← the card's climax
[Outro - soft, <instrument>]          1–2 lines        ← the letter appears
[End]
```

- **About 120–200 words in total.** More words means a longer song.
- **Put real details in the verses:** the pancake place, the dog's name, the trip, the habit. The chorus stays universal and singable around the name.
- **Singable lines:**
  - 6–10 syllables per line, keeping the same count within a section
  - end rhymes or near-rhymes
  - plain words, no tongue-twisters
  - the name on a strong beat, often at the end of the chorus' first line
- **Pronunciation:**
  - Respell unusual names phonetically and keep the spelling consistent throughout (Siobhan → "Shi-vawn", Joaquín → "Wah-keen", Niamh → "Neeve"). Mention it to the user, because it shows up in Suno's lyrics.
  - Write numbers as words ("thirty", "twenty twenty-six") and spell out acronyms ("D-J").
- **Parentheses are sung** as backing vocals or echoes: `Happy birthday, Maya (Maya!)`. Never put instructions in parentheses.
- **Section tags carry direction:** `[Chorus - full band, big harmonies]`, `[Bridge - whispered, just piano]`, `[Final Chorus - key change up, euphoric]`, `[Outro - fade on the Rhodes]`. Repeat anything critical in Styles.
- **End cleanly:** give the outro 1–2 lines, then put `[End]` on the last line with nothing after it. Pair it with Custom duration.
- **Group cards:** a gang-vocal chorus (`[Chorus - group vocals, everyone singing]`) feels like the whole team.
- **Instrumental:** if they don't want vocals, tick Instrumental and write only section tags with directions. The structure still guides the timeline.

## Planning the timeline before the song exists

Turn the lyric structure into a **planned timing** so the whole card can be built and tested now. A bar lasts `meter × 60 / BPM` seconds (4/4 at 98 BPM = 2.45 s).

Typical bar counts per section:
| Section | Bars |
|---|---|
| intro | 4–8 |
| verse (4 lines) | 8 |
| pre-chorus | 4 |
| chorus | 8 |
| bridge | 4–8 |
| outro | 4 |

```js
// main.js — the card runs silently on this plan until song.mp3 + analysis.json exist
audio: {
  src: 'assets/audio/song.mp3',
  analysis: 'assets/audio/analysis.json',
  plan: { bpm: 98, meter: 4, sections: [['intro', 4], ['verse1', 8], ['prechorus1', 4], ['chorus1', 8],
          ['verse2', 8], ['chorus2', 8], ['bridge', 4], ['chorus3', 8], ['outro', 4]], tail: 2 },
},
```

Anchor every scene and cue to these **names** (`'chorus3'`, `'bridge+2bar'`), never to seconds. When the real song arrives with different timing, you only update the section times and everything follows.

## Handing off to the user

After writing the prompt, tell the user exactly what to do (the "How to make it" block) and that you'll build in the meantime. Then build the full card. When you finish before the song exists:
- The card plays silently on the planned timing. Say so plainly.
- Give them the one-line next step: "Save the MP3 as `assets/audio/song.mp3` and tell me, and I'll sync everything to it."

**Render a guide track.** Compose a quick instrumental in `music/` with exactly the planned sections, BPM and meter (synth-music.md). Export it (`song-preview.html` → WAV → `ffmpeg … guide-track.mp3`), analyze it, and let the card play it until the real song exists. The card is then never silent, the user can preview the pacing, and the whole file-audio sync path (analysis, `--sections`, re-timing) gets tested before the song arrives. Label it as a stand-in in the credits, and swap it out when `song.mp3` lands, e.g. `main.js` picks `song.mp3` + `analysis.json` if present, else the guide track.

If you're running unattended (no user to generate the song), deliver the card on the guide track with `suno-prompt.md` and a `README.md` section on syncing.

## When the song arrives: sync

1. **Get the file in place.** Save it as `assets/audio/song.mp3`. If they downloaded WAV, convert with `ffmpeg -i song.wav -codec:a libmp3lame -b:a 192k song.mp3` (smaller, plays everywhere). Fade or trim long silences if needed.
2. **Analyze:**
   ```bash
   python3 <skill>/scripts/analyze_audio.py assets/audio/song.mp3 --bpm 98 --out assets/audio/analysis.json
   ```
   Read the report: measured BPM (Suno often drifts from the hint), first downbeat, detected sections with energies, and the climax candidate.
3. **Identify the real sections.** The auto names are guesses. Best evidence first:
   - **Lyric timestamps** (most reliable for vocal songs):
     - **Local Whisper**, free and offline, if installed. Check `which whisper mlx_whisper whisper-cli`:
       ```bash
       whisper assets/audio/song.mp3 --model small --language en --word_timestamps True --output_format json --output_dir /tmp/lyrics
       ```
       It mishears sung words, so use it for **timing** only. Match its words to your known lyrics; each section starts at its first sung word (or the bar line just before it).
     - **ElevenLabs** (paid): the Forced Alignment API takes the audio plus your lyrics text (tags removed) and returns word timings, or use Scribe speech-to-text with word timestamps.

     Align on an isolated **vocal stem** if the user can split stems in Suno, because full mixes align worse.
   - **Tap-to-mark:** open the card with `?debug`, play the song, press M at each section start, and C copies a `--sections` string. You or the user can do this by ear.
   - **The user's Suno Song Editor** shows labelled section clips, so ask them to read off the times.
   - **The energy table**: choruses are the repeated high-energy blocks, the bridge is the dip before the last chorus, and the outro is the final low block.
4. **Write the final map** with names matching `main.js`:
   ```bash
   python3 <skill>/scripts/analyze_audio.py assets/audio/song.mp3 --out assets/audio/analysis.json \
     --sections "0:intro,9.8:verse1,29.4:prechorus1,39.2:chorus1,58.8:verse2,78.4:chorus2,98:bridge,107.8:chorus3,127.4:outro"
   ```
   Snap times to the nearest downbeat in the report.
5. **Re-check the moments:**
   - Does the title land with the first vocal?
   - Does the climax hit the final chorus?
   - Does the letter appear in the outro with enough reading time? If not, extend the keepsake; it persists after the music.

   Then run QA (qa.md).
6. If Suno made a song much longer or shorter than planned, adjust the plan's section list (more photos per verse, a longer finale) rather than squeezing scenes.

## Optional: on-screen lyrics

When you have word or line timestamps, a lyric line can fade in at the bottom (karaoke-style, one line at a time). It makes a custom song land even harder. Store it as `content.lyrics = [{ t: 9.8, text: 'Late-night pancakes on Fourth Street' }, …]` and render it in a small scene that shows the line whose `t` most recently passed. Never show lyrics you couldn't time; mistimed lyrics feel worse than none.

## Rights and limits

- **Ownership:** songs made on a **paid** plan belong to the user (commercial use allowed). Songs made on the **free** plan are owned by Suno and licensed for personal, non-commercial use, which a private card is.
- **Downloads are capped** (free accounts get very few, ever), so tell the user to download only the final pick, and to grab MP3 plus stems in the same download if they're on a paid plan.
- **Moderation:** Suno blocks real artist names, copyrighted lyrics and some words. Write original lyrics only.

## Worked example

**Input:** "Birthday card for my sister Maya, turning 30. She loves 90s R&B and plants, we always get pancakes at Lou's, she has a cat called Biscuit."

```
Title: Thirty Looks Good On You

Styles: upbeat 90s R&B pop, new jack swing groove, warm Rhodes, finger snaps, punchy drums, lush stacked harmonies, female lead vocal, joyful, celebratory, 98 BPM, crisp modern mix
Exclude: rap, heavy autotune, distorted guitar, sad

[Intro - short, instrumental, Rhodes and finger snaps]

[Verse 1]
Saturday mornings at Lou's on Main
Stacks of pancakes, we'd order the same
Biscuit on the windowsill, plants in a row
You make every little room feel like home

[Pre-Chorus]
And now the candles light the night (light the night)
Thirty never looked so bright

[Chorus - full band, big harmonies]
Happy birthday, Maya (Maya!)
Thirty looks good on you
Every year you're shining brighter
Like the sun breaking through

[Verse 2]
You water every friend like your monstera leaves
Patient and steady, you help us all grow
…

[Bridge - drums drop out, just Rhodes and voice]
Make a wish and close your eyes
We'll be right here by your side

[Final Chorus - key change up, euphoric, gang vocals]
Happy birthday, Maya (Maya!)
…

[Outro - soft Rhodes, finger snaps]
Thirty looks good on you
[End]
```

**Card plan built from it:**
| Section | What happens |
|---|---|
| intro | envelope opens to the title |
| verse 1 | a plant grows from a seed, leaves keyed to each line, with a pancake-stack 3D gag on "stacks of pancakes" |
| chorus | the name blooms in flowers on the downbeat |
| bridge | "make a wish": blow the candles out |
| final chorus | a petal-and-confetti storm, with "30" spelled out in fireflies |
| outro | the letter |
