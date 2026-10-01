# Audio sources: public domain, CC0, and the user's own files

Use this when the card needs an existing recording rather than a generated or synthesized one. The one rule that matters most:

> **A public-domain composition does not make a recording public domain.** Beethoven's Ode to Joy is free, but the Berlin Philharmonic's recording of it is not. Copyright in the composition and copyright in the recording are separate (US Copyright Office, Circular 56A). You need the **recording** to be PD/CC0, or licensed for this use, or you synthesize the composition yourself (synth-music.md).

## Contents
1. [Licence cheat-sheet](#licence-cheat-sheet)
2. [Sources an agent can actually fetch](#sources-an-agent-can-fetch)
3. [Downloading and checking](#downloading-and-checking)
4. [Credits](#credits)
5. [The user's own audio (or a song they already made)](#the-users-own-audio)
6. [Sound effects](#sound-effects)

## Licence cheat-sheet

| Licence | Use in a card? | Attribution | Notes |
|---|---|---|---|
| Public domain (PD mark), CC0 | ✅ | not required (credit anyway, it's kind) | best choice |
| CC BY 4.0 | ✅ | **required**, in the card's credits | e.g. Kevin MacLeod |
| CC BY-SA | ⚠️ | required, and syncing music to visuals counts as an adaptation, which triggers ShareAlike | prefer CC0/BY |
| CC BY-NC | ⚠️ | required | OK for a private, non-commercial card; not for anything sold or branded |
| Pixabay Content License | ⚠️ manual use only | not required | not CC0; no standalone redistribution; the site blocks bots |
| "Royalty free", YouTube Audio Library | ❌ usually | varies | terms are often tied to a platform or account |
| Commercial songs (Spotify, iTunes, etc.) | ❌ unless the user accepts the risk | — | hosting the file publicly is redistribution |

US sound recordings published in **1925 or earlier** are in the public domain (Music Modernization Act; 1926 recordings follow on 2027-01-01). That status is US-only. Many old 78 rpm recordings sound charmingly vintage, which suits retro-themed cards.

"Happy Birthday to You" (the song) is public domain in the US (2016 judgment) and in the EU (since 2017). Recordings of it still need their own clearance, or synthesize it (`MELODIES.happyBirthday`).

## Sources an agent can fetch

**Wikimedia Commons** is the best first stop: clear licence metadata and direct file URLs with no login.

- Search (CC0 or PD audio):
  ```
  https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&format=json&srsearch=filetype:audio+waltz+haswbstatement:P275=Q6938433
  ```
  (`P275=Q6938433` = CC0; `P6216=Q19652` = public domain). Add keywords; the results are full of pronunciation clips.
- Licence and URL for a file, plus an MP3 version of OGG files:
  ```
  https://commons.wikimedia.org/w/api.php?action=query&titles=File:NAME.ogg&prop=imageinfo|videoinfo&iiprop=url|extmetadata&viprop=derivatives&format=json
  ```
  Read `extmetadata.LicenseShortName`, `Artist`, `Credit`. The derivatives include `…/transcoded/…/NAME.ogg.mp3`.
- Example that works: a public-domain "Happy Birthday" arrangement:
  `https://upload.wikimedia.org/wikipedia/commons/transcoded/0/02/Happy_Birthday_to_You.ogg/Happy_Birthday_to_You.ogg.mp3`
- Send a descriptive User-Agent with curl (Wikimedia policy): `curl -L -A "celebration-card/1.0 (personal project)" -o song.mp3 URL`.

**Internet Archive**
- Metadata: `https://archive.org/metadata/<identifier>`. Files: `https://archive.org/download/<identifier>/<file>` (use `curl -L`).
- Search with `advancedsearch.php`:
  - `licenseurl:*publicdomain*` or `licenseurl:*zero*` (CC0)
  - for vintage 78s: `collection:(78rpm) AND year:[1900 TO 1925]` (PD in the US by date)
- Musopen's public-domain classical recordings are mirrored there, e.g. `musopen-chopin` (CC0) and `MusopenCollectionAsFlac`. Musopen's own site blocks automated downloads.
- The uploader sets the licence, so double-check it on the item page.

**Openverse** is a search engine over Commons, Freesound, Jamendo and more:
```
https://api.openverse.org/v1/audio/?q=happy+celebration&license=cc0,pdm
```
It works without an account, but results are noisy, so check each licence.

**OpenGameArt** has CC0 music (often upbeat or chiptune). Search with `opengameart.org/art-search-advanced?keys=Q&field_art_type_tid[]=12&field_art_licenses_tid[]=4`; files are direct links under `/sites/default/files/`.

**Incompetech (Kevin MacLeod)** is CC BY 4.0: a huge catalogue of moods, with an agent-friendly list at `https://incompetech.com/music/royalty-free/pieces.json` (feel, BPM, length) and direct MP3s. The credit is **required**, exactly in this form:
> "Title" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 https://creativecommons.org/licenses/by/4.0/

**Free Music Archive** has CC-licensed tracks, but downloads need an account. Suggest it to the user for manual download.

**Freesound** is great for SFX. Filter licence CC0; the public HQ MP3 previews (`cdn.freesound.org/previews/…-hq.mp3`) download without auth. Originals and the API need an account or key.

Pick a piece by:
- mood (match the occasion)
- tempo
- a clear structure (intro, build, climax): the card needs moments to sync to
- a length of 1:00–3:00. Trim with `ffmpeg -ss START -to END -i in.mp3 -af "afade=t=in:d=0.5,afade=t=out:st=<END-START-2>:d=2" out.mp3`.

## Downloading and checking

1. Record the source URL, title, creator, licence and licence URL **before** downloading.
2. `curl -L -o <card>/assets/audio/song.mp3 "<url>"`, then `ffprobe` it to confirm it's real audio and check its duration.
3. Run `analyze_audio.py` (see the SKILL.md sync step).
4. Add the credit to `content.credits` (shown on the end screen) and to `CREDITS.md`.

## Credits

`content.js`:
```js
credits: ['Music: "Gymnopédie No. 1" by Erik Satie, performed by … (Musopen, public domain)'],
```

`CREDITS.md` lists every external asset (audio, fonts, 3D models, images) with source URL and licence. Fonts from Google Fonts use the OFL and need no on-screen credit.

## The user's own audio

If the user hands you a song (a Suno track they made earlier, an ElevenLabs song, a recording of the family singing, a purchased track), the song leads the design:

1. **Prepare the file:**
   - **Convert** to MP3 and strip embedded cover art and tags: `ffmpeg -i input.m4a -map 0:a -map_metadata -1 -vn -b:a 192k assets/audio/song.mp3`.
   - **Trim** long leading or trailing silence.
   - **Normalize** quiet recordings (old 78s often sit around −35 LUFS): `-af loudnorm=I=-16:TP=-1.5:LRA=11`. `analyze_audio.py` warns when it's needed.
   - **Mono** recordings can be summed to mono (`-ac 1`) to halve the size.
   - Keep the file under ~6 MB (about 3–4 minutes at 192 kbps). Up to 15 MB still loads into memory for smooth seeking.
2. **Analyze before designing:** `analyze_audio.py song.mp3 --out analysis.json [--bpm …] [--meter auto|2|3|4]` gives tempo, bars, sections, energy and climax. The meter is detected (3/4 vs 4/4). Pass `--meter 2` for cut time: marches, fox-trots, polkas, much pre-1950 dance music.
3. **Learn the song's story.**
   - Ask for, or find, the lyrics. Suno song pages show them; old songs have published lyrics.
   - For vocal songs, get word timings with a local Whisper (`whisper song.mp3 --model small --word_timestamps True --output_format json`, free) or ElevenLabs (elevenlabs.md). Lines like "Saturday mornings at Lou's" can then trigger the matching visual.
   - Show the *published* words; Whisper mishears singing.
   - No speech-to-text? Mark sections by ear with `?debug` + M.
4. **Name the sections** with `--sections`/`--names` and plan scenes against those real times: the climax where it lifts, the letter in the quiet ending.
5. **Rights:**
   - A song they made on a paid Suno/ElevenLabs plan is theirs.
   - Free-plan Suno songs are fine for a personal card.
   - A commercial recording on a public URL is redistribution: tell them, and offer alternatives (a synthesized cover of a PD melody, a similar CC0 track, or a private/password-protected host).

## Sound effects

Order of preference:
1. Synthesized `sfx.js` (free, instant, perfectly synced to taps).
2. Freesound CC0.
3. ElevenLabs `text_to_sound_effects` for anything very specific: a school bell for a teacher's retirement, an airplane chime for a travel theme.

Keep SFX quiet under the music. Every SFX should answer a viewer action or a visible event.
