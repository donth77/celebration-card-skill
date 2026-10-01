// The card's soundtrack (synthesized route). Section names here are the anchors the scenes and
// cues in main.js use ('verse1', 'finale', 'finale+2bar' …), so the visuals follow the music.
//
// Demo: "Happy Birthday" as a music-box waltz in F that lifts to G for a big finale.

import { song, melody, chords, arp, bass, drums, riser, hit, MELODIES } from './music.js';

const HB = MELODIES.happyBirthday; // written in C, 3/4, one-beat pickup
const F = 5, G = 7;                 // transpositions (semitones from C)

export default song({
  title: 'Happy Birthday — music-box waltz',
  bpm: 96,
  meter: 3,
  instruments: {
    box: { preset: 'musicBox', volume: -9, pan: 0.1 },
    celesta: { preset: 'celesta', volume: -16, pan: -0.25 },
    glock: { preset: 'glock', volume: -20, pan: 0.3 },
    keys: { preset: 'epiano', volume: -15, pan: -0.15 },
    pad: { preset: 'warmPad', volume: -20 },
    strings: { preset: 'strings', volume: -19 },
    bass: { preset: 'softBass', volume: -12 },
    kit: { preset: 'kit', volume: -15 },
  },
  sections: [
    {
      name: 'intro', bars: 4,
      parts: {
        celesta: arp('F | Bb | F | C7', { octave: 5, rate: 0.5, vel: 0.45 }),
        pad: chords('F | Bb | F | C7', { octave: 4, vel: 0.35 }),
      },
    },
    {
      name: 'verse1', bars: 8,
      parts: {
        box: melody(HB.melody, { pickup: 1, transpose: F, vel: 0.8 }),
        keys: chords(HB.chords, { transpose: F, rhythm: 'waltz', vel: 0.45 }),
        pad: chords(HB.chords, { transpose: F, vel: 0.3 }),
      },
    },
    {
      name: 'verse2', bars: 8,
      parts: {
        box: melody(HB.melody, { pickup: 1, transpose: F, vel: 0.85 }),
        glock: melody(HB.melody, { pickup: 1, transpose: F + 12, vel: 0.4 }),
        keys: chords(HB.chords, { transpose: F, rhythm: 'waltz', vel: 0.5 }),
        bass: bass(HB.chords, { transpose: F, pattern: 'waltz' }),
        kit: drums({ kick: 'x.....', rim: '..x.x.', shaker: 'oxoxox' }),
      },
    },
    {
      name: 'lift', bars: 1, // one bar of D7 to modulate up a step
      parts: {
        strings: chords('D7', { vel: 0.55 }),
        bass: bass('D7'),
        kit: [riser(3, 0.7), drums({ snare: 'oooxxx' })],
      },
    },
    {
      name: 'finale', bars: 8,
      parts: {
        box: melody(HB.melody, { pickup: 1, transpose: G, vel: 0.9 }),
        glock: melody(HB.melody, { pickup: 1, transpose: G + 12, vel: 0.55 }),
        strings: chords(HB.chords, { transpose: G, vel: 0.5 }),
        keys: chords(HB.chords, { transpose: G, rhythm: 'waltz', vel: 0.55 }),
        bass: bass(HB.chords, { transpose: G, pattern: 'waltz', vel: 0.9 }),
        kit: [hit('crash', 0, 0.8), drums({ kick: 'x.....', snare: '..x.x.', shaker: 'xxxxxx' })],
      },
    },
    {
      name: 'outro', bars: 4,
      parts: {
        celesta: arp('G | Cadd9 | G | G', { octave: 5, rate: 0.5, pattern: 'updown', vel: 0.38 }),
        pad: chords('G | Cadd9 | G | G', { vel: 0.32 }),
        box: melody('r:6 D6:3 G6:3', { vel: 0.55 }),
      },
    },
  ],
  tail: 3.5,
});
