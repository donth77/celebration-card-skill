// EXAMPLE SONG — tender arrangement of Pachelbel's Canon (public domain). 4/4 at 66 BPM in D.
// Good for: anniversaries, weddings, heartfelt thank-yous, gentle/memorial cards. ~1:35.

import { song, melody, chords, arp, bass, MELODIES } from 'card/music/music.js';

const C = MELODIES.canonInD;          // 8-chord ground, 4 bars per cycle
const x2 = (s) => `${s} | ${s}`;

export default song({
  title: 'Canon (tender)',
  bpm: 66, meter: 4,
  instruments: {
    harp: { preset: 'harp', volume: -13, pan: -0.2 },
    bell: { preset: 'celesta', volume: -14, pan: 0.2 },
    strings: { preset: 'strings', volume: -17 },
    pad: { preset: 'airPad', volume: -20 },
    bass: { preset: 'softBass', volume: -14 },
  },
  sections: [
    { name: 'intro', bars: 4, parts: {
      harp: arp(C.chords, { octave: 4, rate: 0.5, pattern: 'up', vel: 0.45 }),
      pad: chords(C.chords, { vel: 0.3 }),
    } },
    { name: 'theme1', bars: 8, parts: {
      bell: melody(x2(C.melody), { vel: 0.7 }),
      harp: arp(x2(C.chords), { octave: 4, rate: 0.5, pattern: 'updown', vel: 0.4 }),
      bass: melody(x2(C.bass), { vel: 0.7 }),
      pad: chords(x2(C.chords), { vel: 0.3 }),
    } },
    { name: 'theme2', bars: 8, parts: {
      bell: melody(`${C.melody2} | ${C.melody3}`, { vel: 0.7 }),
      strings: melody(x2(C.melody), { octave: -1, vel: 0.45 }),
      harp: arp(x2(C.chords), { octave: 4, rate: 0.25, pattern: 'up', vel: 0.32 }),
      bass: melody(x2(C.bass), { vel: 0.75 }),
    } },
    { name: 'swell', bars: 8, parts: {
      strings: melody(`${C.melody3} | ${C.melody2}`, { octave: 1, vel: 0.6 }),
      bell: melody(x2(C.melody), { octave: 1, vel: 0.5 }),
      harp: arp(x2(C.chords), { octave: 4, rate: 0.25, pattern: 'updown', octaves: 2, vel: 0.35 }),
      pad: chords(x2(C.chords), { vel: 0.4 }),
      bass: melody(x2(C.bass), { vel: 0.8 }),
    } },
    { name: 'outro', bars: 4, parts: {
      harp: arp('D:8 | G:4 A:4', { octave: 4, rate: 0.5, pattern: 'up', vel: 0.35 }),
      bell: melody('F#5:4 E5:4 | D5:8', { vel: 0.55 }),
      pad: chords('D:8 | G:4 D:4', { vel: 0.3 }),
      bass: melody('D3:8 | G2:4 D2:4', { vel: 0.6 }),
    } },
  ],
  tail: 4,
});
