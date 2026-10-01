# Synthesized music: composing with music/music.js

You write the score as data. Tone.js plays it live in the browser: no audio files, no licences, a tiny download. Because the score *is* the timeline, every beat and section boundary is exact.

Use this route when:
- the user wants something free and instant
- the song should be a public-domain melody (Happy Birthday, Auld Lang Syne, Canon in D…)
- you want perfect sync without an analysis step

## Contents
1. [Song structure](#song-structure)
2. [Notation](#notation)
3. [Part helpers](#part-helpers)
4. [Instrument presets](#instrument-presets)
5. [Composing: recipes by mood](#composing-recipes-by-mood)
6. [Arranging sections so the card has a shape](#arranging-sections)
7. [Public-domain melodies](#public-domain-melodies)
8. [Example songs (tested)](#example-songs)
9. [Checking and exporting](#checking-and-exporting)
10. [Gotchas](#gotchas)

## Song structure

`music/song.js` default-exports a song:

```js
import { song, melody, chords, arp, bass, drums, riser, hit, layer, shift, repeat, dyn, MELODIES } from './music.js';

export default song({
  title: 'For Maya',
  bpm: 96, meter: 4,            // meter = beats per bar (3 for waltzes)
  swing: 0,                     // 0..1 swings off-beat eighths (0.5–0.6 = lazy lo-fi)
  master: 7,                    // dB into the compressor/limiter (default 7)
  reverb: { decay: 3.2 },
  instruments: {                // name → preset (string) or { preset, volume (dB), pan (-1..1), reverb (send dB) }
    lead: 'musicBox',
    keys: { preset: 'epiano', volume: -14, pan: -0.2 },
    kit: { preset: 'kit', volume: -14 },
  },
  sections: [                   // names become the card's timeline anchors
    { name: 'intro', bars: 4, parts: { keys: arp('C | Am | F | G') } },
    { name: 'verse1', bars: 8, pickup: 1, parts: { lead: melody('…', { pickup: 1 }), keys: chords('…') } },
  ],
  tail: 3,                      // seconds of reverb ring-out after the last bar (part of the card's duration)
});
```

Parts map an instrument name to a part (or an array of parts). Every part is placed from the section's first downbeat.

## Notation

**Melody**: `note:beats` tokens. The default length is 1 beat.

```
'G4:.75 G4:.25 | A4 G4 C5 | B4:2 r:1 | C5+E5:2 G5:1/3 A5:1/3 B5:1/3 C6!'
```

- Notes are `C4` (middle C), `F#3` or `Bb5`. `r` is a rest. `C5+E5` plays a dyad.
- Fractions work for triplets (`1/3`).
- A trailing `!` accents a note; a trailing `?` softens it.
- `|` marks bar lines. They're **checked**: a bar with the wrong number of beats logs a console warning naming the melody, which catches transcription errors.
- `pickup: n` makes the first `n` beats an anacrusis played before bar 1, as in "Hap-py | BIRTH-day".

**Chords**: one chord per bar between `|`. Inside a bar, chords split evenly, or set lengths with `C:2 G7:1`. `%` repeats the previous chord.

```
'C | Am | F:2 G:2 | %'
```

Symbols: `C Cm C7 Cmaj7 Cm7 C9 Cmaj9 Cm9 Cadd9 Cmadd9 C6 Cm6 Csus2 Csus4 C7sus4 Cdim Cdim7 Cm7b5 Caug C5 C6/9 C11 C13 C/E`. Unknown qualities throw an error listing the valid ones. Voicings are automatic: close position near the chosen octave, with smooth voice-leading from chord to chord.

**Drums**: one bar per string. The string's length sets the grid: 16 characters = sixteenths in 4/4, 12 = sixteenths in 3/4. `X` is an accent, `x` a hit, `o` a ghost note, `.` a rest.

```js
drums({ kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, { fill: { snare: '....x...x.xxxxxx' } })
```

Kit sounds: `kick snare clap hat ohat shaker rim tom tomHi timpani timpaniLow crash boom riser`.

## Part helpers

| helper | options |
|---|---|
| `melody(str, o)` | `transpose` (semitones), `octave` (±n), `vel` (0..1), `pickup` (beats), `legato` (0..1 note length) |
| `chords(prog, o)` | `transpose, octave` (voicing centre, default 4), `vel, voices`; `rhythm`: `hold` · `pulse` (every beat) · `half` · `waltz` (bass + 2 chords, 3/4) · `oompah` (4/4) · `offbeat` · `strum` · a pattern like `'x..x..x.'` with `step` (beats) |
| `arp(prog, o)` | `octave, rate` (beats per note: .5 eighths, .25 sixteenths), `pattern`: up · down · updown · random · pinky; `octaves, gate, vel` |
| `bass(prog, o)` | `octave` (default 2), `pattern`: root · root5 · octave · pulse8 · waltz · walk |
| `drums(pat, o)` | `vel, fill` (pattern for the last bar), `from` (start bar) |
| `riser(beats, vel)` | noise sweep that ends exactly at the section end (use on the kit) |
| `hit(name, atBeat, vel)` | one hit (kit sound or note name), e.g. `hit('crash', 0)` |
| `layer(a, b, …)` · `shift(p, {beats, semitones})` · `repeat(p, times, every)` · `dyn(p, factor)` | combine, move, loop, scale velocity |

## Instrument presets

| preset | character | use for |
|---|---|---|
| `musicBox` | bright tines, fast decay | birthdays, babies, nostalgia, lead melody |
| `celesta` | soft bell-piano | magical, gentle leads, arps |
| `glock` | sparkly, high | doubling a melody an octave up, sparkle |
| `bell` | long inharmonic ring | moments, single notes, endings |
| `kalimba` | woody plucked tines | playful, lo-fi leads |
| `marimba` | warm mallets | upbeat, tropical, kids |
| `epiano` | Rhodes-style electric piano with tremolo | lo-fi, R&B, jazzy chords |
| `softPiano` | felt-piano-ish | tender chords and melodies |
| `harp` | plucked, ringing | arpeggios, weddings, elegance |
| `pluck` | synth pluck | pop arps, energy |
| `warmPad` | lush detuned saw pad | beds, transitions, swells |
| `airPad` | airy, slow | ambient, memorial, dreamy intros |
| `strings` | ensemble with vibrato | emotion, film moments, held chords |
| `brass` | filter-swept brass | fanfares, triumphant hooks |
| `lead` | square/saw lead with vibrato | pop toplines, retro |
| `chip` / `chipBass` | 8-bit | gamer cards, retro fun |
| `softBass` / `synthBass` | round / punchy | bass lines |
| `kit` | synthesized drums + riser/boom/timpani | grooves, builds, impacts |

Mixing starting points:
| Role | Volume | Pan |
|---|---|---|
| lead | −9 to −12 dB | centre |
| chords | −13 to −16 dB | slightly off-centre |
| pads | −20 to −24 dB | |
| bass | −11 to −13 dB | centre |
| kit | −12 to −15 dB | |
| doubles (glock an octave up) | −18 to −20 dB | |

Pan the doubles opposite the chords. The master compressor/limiter glues it together. If anything clips, `music/preview.html` reports it.

## Composing: recipes by mood

| Mood | Meter / BPM | Progressions (Roman → in C) | Texture |
|---|---|---|---|
| Joyful pop | 4/4, 110–124 | I–V–vi–IV (`C G Am F`), IV–I–V–vi | pluck arps 16ths, synthBass pulse8, clap on 2&4, hook on `lead` or `musicBox` |
| Warm / nostalgic | 4/4, 80–96 | vi–IV–I–V (`Am F C G`), I–iii–IV–iv (`C Em F Fm`) | epiano + softBass root5, gentle kit, kalimba melody |
| Lo-fi chill | 4/4, 76–88, swing .5–.6 | IVmaj7–iii7–ii7–Imaj7 (`Fmaj7 Em7 Dm7 Cmaj7`), ii9–V–Imaj9 | epiano chords on off-beats, lazy kick, shaker |
| Tender / romantic | 4/4 or 3/4, 60–76 | I–V–vi–iii–IV–I–IV–V (Canon), I–vi–IV–V | harp arps, airPad, celesta or strings melody |
| Triumphant | 4/4, 96–110 | I–IV–V–I, bVI–bVII–I (`Ab Bb C`) | brass melody, strings pulse, timpani, crash on downbeats |
| Waltz / whimsical | 3/4, 90–120 | I–IV–V7–I | chords rhythm `waltz`, musicBox lead, glock double |
| Retro game | 4/4, 128–150 | I–bVII–IV–I, vi–IV–I–V | chip lead, chipBass octave, noise hats |
| Ambient / reflective | 4/4, 56–70 | Imaj7–IVmaj7, I–V/vii–vi–IV | airPad, bell single notes, no drums |

**Writing a melody people remember:**
- Make a 2-bar motif, repeat it, then vary the ending (A A' A B).
- Put chord tones on strong beats, with stepwise motion between them and one or two leaps for character.
- Give the chorus the highest notes in the song and a simple rhythm.
- Keep it within about an octave and a half.
- End phrases on the root or third.

## Arranging sections

The song's energy curve becomes the card's emotional curve:
| Section | Arrangement | Bars |
|---|---|---|
| intro | sparse: pad + one motif, a reveal | 2–4 |
| verse | groove plus melody | 8 |
| chorus | full, with the hook | 8 |
| breakdown/bridge | strip back: a wish moment, a quiet message | 4 |
| final chorus | biggest, often a key change up a step with a 1-bar dominant "lift" before it (see `song.js`: `lift` on D7 into G) | 8 |
| outro | thin out, last chord rings for the letter | 2–4 |

Mark builds with `riser` into the drop and a `crash`/`boom` on the downbeat. Those downbeats are where the card's cues should fire.

Card length: 60–120 s is plenty. At 96 BPM in 4/4, one bar is 2.5 s, so 36 bars is about 90 s.

## Public-domain melodies

`MELODIES` (in `music/melodies.js`). Each entry has `key, meter, pickup, melody, chords`. The melody is written in the stated key; transpose with `transpose`.

| key | tune | key/meter/pickup | fits |
|---|---|---|---|
| `happyBirthday` | Happy Birthday to You | C, 3/4, 1 | birthdays |
| `twinkle` | Twinkle, Twinkle, Little Star | C, 4/4 | babies, kids, stars |
| `odeToJoy` | Ode to Joy (Beethoven 9) | C, 4/4 | any triumph |
| `auldLangSyne` | Auld Lang Syne (verse) | F, 4/4, 1 | retirement, farewell, new year |
| `canonInD` | Canon in D (ground + 3 lines: `melody`, `melody2`, `melody3`, `bass`) | D, 4/4 | weddings, anniversaries |
| `jingleBells` | Jingle Bells (chorus) | G, 4/4 | winter holidays |
| `minuetInG` | Minuet in G (Petzold) | G, 3/4 | elegant |
| `eineKleine` | Eine kleine Nachtmusik (opening) | G, 4/4 | playful-elegant |

```js
const HB = MELODIES.happyBirthday;
{ name: 'verse1', bars: 8, parts: {
    lead: melody(HB.melody, { pickup: HB.pickup, transpose: 5 }),      // C → F
    keys: chords(HB.chords, { transpose: 5, rhythm: 'waltz' }) } }
```

To add another public-domain tune, transcribe it carefully, bar by bar, and let the bar check catch mistakes. Only use melodies you're confident are public domain. Composition copyright usually lasts 70 years after the composer's death; "Happy Birthday" has been PD in the US since 2016 and in the EU since 2017. When unsure, write an original tune.

## Example songs

Tested, runnable starting points in `music/examples/`. Copy one to `music/song.js` and edit the sections, melody and instruments:

| file | style | sections | length |
|---|---|---|---|
| `song.js` (template default) | Happy Birthday music-box waltz, lifts F → G | intro, verse1, verse2, lift, finale, outro | ~65 s |
| `examples/lofi-groove.js` | original lo-fi, 84 BPM, swing | intro, verse1, chorus1, verse2, chorus2, outro | ~95 s |
| `examples/fanfare.js` | original orchestral fanfare, 100 BPM | intro, call, theme, finale, outro | ~75 s |
| `examples/tender-canon.js` | Pachelbel's Canon, harp + celesta, 66 BPM | intro, theme1, theme2, swell, outro | ~100 s |

## Checking and exporting

- **Listen and measure:** serve the card and open `/music/preview.html?song=song.js` (or `examples/fanfare.js`). Offline rendering takes roughly 1–2× the song's length, so add `&rate=22050` for a faster draft check. It renders offline, plays the result, and reports duration, section times, peak/RMS dB, clipped samples and notation warnings. Aim for:
  | Measure | Target |
  |---|---|
  | clipped samples | 0 |
  | peak | about −1 to −4 dB |
  | RMS | about −16 to −24 dB |
- **Export a file:** the page's "Download WAV" uses `renderSongToWav(song)`. Convert it with `ffmpeg -i song.wav -b:a 192k song.mp3`. Exports are useful when:
  - the user wants the song outside the card
  - you want to play it through the `<audio>` file route instead of live synthesis. That's the most robust choice when the card also runs heavy WebGL, or on very old phones: live synthesis with many voices can crackle on weak CPUs, and a rendered MP3 never does. Run `analyze_audio.py` with `--sections` set to the song's exact section times, then keep `music/song.js` in the card as the editable score.
  - you need a **guide track** for a Suno card before the real song exists (suno.md).

## Gotchas

- **Pickups overlap the previous section's last beat.** That's correct musically. Leave room: end the previous melody a beat early, or let the long note ring.
- **Key changes:** add a 1-bar dominant section (`lift`) before the new key so it doesn't lurch.
- **Swing** shifts off-beat eighths only. Drums written in 16ths still swing at their eighth positions.
- **Polyphony:** many long-release notes (pads, bells) at once can exceed voice limits ("Max polyphony exceeded"). Thin the chords or shorten the releases rather than stacking more.
- **The tail** adds ring-out time to the card. The `end` anchor includes it, so the letter scene has those seconds too.
