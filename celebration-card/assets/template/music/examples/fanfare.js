// EXAMPLE SONG — triumphant orchestral fanfare (original). 4/4 at 100 BPM in C.
// Good for: graduations, retirements, promotions, awards, "you did it!" moments. ~1:15.

import { song, melody, chords, arp, bass, drums, hit, riser } from '../music.js';

const call = 'G4:1/3 G4:1/3 G4:1/3 C5:3 | E5:1/3 E5:1/3 E5:1/3 G5:3 | A5:1.5 G5:.5 F5 E5 | D5:4';
const theme = 'C5:2 E5 G5 | A5:3 G5 | F5 E5 D5 E5 | G5:4 | C5:2 E5 G5 | C6:3 B5 | A5 G5 F5 D5 | C5:4';
const themeChords = 'C | F | Dm7 | G | C | Am | F:2 G:2 | C';

export default song({
  title: 'Fanfare',
  bpm: 100, meter: 4, master: 2, // a loud arrangement: less drive into the limiter
  instruments: {
    brass: { preset: 'brass', volume: -10 },
    strings: { preset: 'strings', volume: -15 },
    glock: { preset: 'glock', volume: -19, pan: 0.3 },
    harp: { preset: 'harp', volume: -16, pan: -0.3 },
    bass: { preset: 'softBass', volume: -12 },
    kit: { preset: 'kit', volume: -12 },
  },
  sections: [
    { name: 'intro', bars: 2, parts: {
      strings: chords('C:8', { octave: 3, vel: 0.4 }),
      kit: [drums({ timpani: 'o.o.o.o.o.o.oxxx' }, { vel: 0.7 }), riser(4, 0.4)],
    } },
    { name: 'call', bars: 4, parts: {
      brass: melody(call, { vel: 0.85 }),
      strings: chords('C | C | F | G', { vel: 0.45 }),
      bass: bass('C | C | F | G'),
      kit: [hit('crash', 0, 0.7), drums({ timpani: 'x...............' })],
    } },
    { name: 'theme', bars: 8, parts: {
      strings: melody(theme, { vel: 0.7 }),
      harp: arp(themeChords, { octave: 4, rate: 0.5, pattern: 'updown', vel: 0.4 }),
      brass: chords(themeChords, { rhythm: 'half', octave: 3, vel: 0.35 }),
      bass: bass(themeChords, { pattern: 'root5' }),
      kit: drums({ timpani: 'x.......x.......' }, { vel: 0.6 }),
    } },
    { name: 'finale', bars: 8, parts: {
      brass: melody(theme, { vel: 0.95 }),
      glock: melody(theme, { octave: 1, vel: 0.45 }),
      strings: chords(themeChords, { rhythm: 'pulse', vel: 0.5 }),
      harp: arp(themeChords, { octave: 4, rate: 0.25, pattern: 'up', octaves: 2, vel: 0.35 }),
      bass: bass(themeChords, { pattern: 'octave', vel: 0.85 }),
      kit: [hit('crash', 0, 0.9), hit('boom', 0, 0.6), drums({ timpani: 'x...x...x...x...', snare: '....o.......o...' }, { fill: { timpani: 'x.x.x.x.xxxxxxxx' } })],
    } },
    { name: 'outro', bars: 2, parts: {
      brass: chords('C:8', { octave: 4, vel: 0.7 }),
      strings: chords('C:8', { octave: 3, vel: 0.5 }),
      glock: melody('C6:2 G5:2 C6:4', { vel: 0.5 }),
      kit: [hit('crash', 0, 0.8), hit('timpaniLow', 0, 0.8)],
    } },
  ],
  tail: 3.5,
});
