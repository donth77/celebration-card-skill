// EXAMPLE SONG — warm lo-fi groove (original). 4/4 at 84 BPM with a lazy swing.
// Good for: casual birthdays, friends, "chill" cards, photo memories. ~1:35.
// Copy to music/song.js and edit; section names are what main.js anchors to.

import { song, melody, chords, bass, drums, hit, riser } from '../music.js';

const VERSE = 'Fmaj7 | Em7 | Dm7 | Cmaj7';          // IVmaj7–iii7–ii7–Imaj7 in C: dreamy, descending
const CHORUS = 'F | G | Em7 | Am7';
const x2 = (p) => `${p} | ${p}`;

const verseTune = 'E5:1.5 C5:.5 A4 C5 | B4:1.5 G4:.5 E4:2 | A4:1.5 F4:.5 D4 F4 | E4:3 r | E5:1.5 C5:.5 A4 C5 | D5:1.5 B4:.5 G4:2 | C5 A4 F4 A4 | G4:4';
const hook = 'C5:.5 A4:.5 C5 D5 C5 | B4:.5 G4:.5 B4 C5 B4 | G4:.5 E4:.5 G4 A4 G4 | E4:4';
const groove = { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' };

export default song({
  title: 'Lo-fi groove',
  bpm: 84, meter: 4, swing: 0.55,
  instruments: {
    keys: { preset: 'epiano', volume: -13, pan: -0.15 },
    lead: { preset: 'kalimba', volume: -11, pan: 0.15 },
    bass: { preset: 'softBass', volume: -11 },
    pad: { preset: 'airPad', volume: -24 },
    kit: { preset: 'kit', volume: -15 },
  },
  sections: [
    { name: 'intro', bars: 4, parts: {
      keys: chords(VERSE, { rhythm: 'x..x..x.', step: 0.5, vel: 0.4 }),
      pad: chords(VERSE, { vel: 0.3 }),
    } },
    { name: 'verse1', bars: 8, parts: {
      lead: melody(verseTune, { vel: 0.7 }),
      keys: chords(x2(VERSE), { rhythm: 'x..x..x.', step: 0.5, vel: 0.42 }),
      bass: bass(x2(VERSE), { pattern: 'root5' }),
      kit: drums(groove, { vel: 0.7 }),
    } },
    { name: 'chorus1', bars: 8, parts: {
      lead: melody(`${hook} | ${hook}`, { vel: 0.8 }),
      keys: chords(x2(CHORUS), { rhythm: 'x.x..x.x', step: 0.5, vel: 0.5 }),
      pad: chords(x2(CHORUS), { vel: 0.35 }),
      bass: bass(x2(CHORUS), { pattern: 'root5', vel: 0.85 }),
      kit: [hit('crash', 0, 0.5), drums({ ...groove, shaker: '.x.x.x.x.x.x.x.x' }, { vel: 0.8, fill: { snare: '....x...x.x.xxxx' } })],
    } },
    { name: 'verse2', bars: 8, parts: {
      lead: melody(verseTune, { vel: 0.7, octave: 1 }),
      keys: chords(x2(VERSE), { rhythm: 'x..x..x.', step: 0.5, vel: 0.42 }),
      bass: bass(x2(VERSE), { pattern: 'root5' }),
      kit: drums(groove, { vel: 0.75 }),
    } },
    { name: 'chorus2', bars: 8, parts: {
      lead: melody(`${hook} | ${hook}`, { vel: 0.85 }),
      keys: chords(x2(CHORUS), { rhythm: 'x.x..x.x', step: 0.5, vel: 0.55 }),
      pad: chords(x2(CHORUS), { vel: 0.4 }),
      bass: bass(x2(CHORUS), { pattern: 'octave', vel: 0.8 }),
      kit: [hit('crash', 0, 0.6), drums({ ...groove, clap: '....x.......x...', shaker: '.x.x.x.x.x.x.x.x' }), riser(4, 0.5)],
    } },
    { name: 'outro', bars: 4, parts: {
      keys: chords('Fmaj7 | Em7 | Dm7 | Cmaj7:4', { rhythm: 'hold', vel: 0.4 }),
      lead: melody('E5:1.5 C5:.5 A4 C5 | B4:1.5 G4:.5 E4:2 | A4:1.5 F4:.5 D4 F4 | C5:4', { vel: 0.55 }),
      pad: chords(VERSE, { vel: 0.3 }),
    } },
  ],
  tail: 3,
});
