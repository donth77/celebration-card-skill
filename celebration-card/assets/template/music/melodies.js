// Public-domain melodies, transcribed for music.js notation (note:beats, '|' = barline).
// Each entry: key/meter as written, pickup (beats before bar 1), melody, chords (one bar per '|').
// Transpose with melody(M.melody, { transpose }) and chords(M.chords, { transpose }).
// Bar lengths are checked at load time: a console warning means a typo in the notation.
//
// Copyright note: these *compositions* are public domain. That's what makes it safe to
// synthesize them. A specific *recording* of a PD piece is usually NOT public domain.

export const MELODIES = {
  happyBirthday: {
    title: 'Happy Birthday to You',
    origin: 'Mildred J. Hill & Patty Hill ("Good Morning to All", 1893); public domain (US court ruling 2015, EU 2017)',
    use: 'birthdays',
    key: 'C', meter: 3, pickup: 1, bpm: [84, 112],
    melody: 'G4:.75 G4:.25 | A4 G4 C5 | B4:2 G4:.75 G4:.25 | A4 G4 D5 | C5:2 G4:.75 G4:.25 | G5 E5 C5 | B4 A4 F5:.75 F5:.25 | E5 C5 D5 | C5:3',
    chords: 'C | G7 | G7 | C | C7 | F | C:2 G7:1 | C',
    lyrics: 'Hap-py birth-day to you / Hap-py birth-day to you / Hap-py birth-day dear [Name] / Hap-py birth-day to you',
  },
  twinkle: {
    title: 'Twinkle, Twinkle, Little Star',
    origin: 'French folk tune "Ah! vous dirai-je, maman" (1761); lyrics Jane Taylor (1806)',
    use: 'new baby, kids, starry/night themes',
    key: 'C', meter: 4, pickup: 0, bpm: [76, 104],
    melody: 'C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2',
    chords: 'C | F:2 C:2 | F:2 C:2 | G:2 C:2 | C:2 F:2 | C:2 G:2 | C:2 F:2 | C:2 G:2 | C | F:2 C:2 | F:2 C:2 | G:2 C:2',
  },
  odeToJoy: {
    title: 'Ode to Joy (Symphony No. 9)',
    origin: 'Ludwig van Beethoven (1824)',
    use: 'any joyful milestone, graduations, team celebrations',
    key: 'C', meter: 4, pickup: 0, bpm: [96, 132],
    melody: 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:.5 D4:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2 | D4 D4 E4 C4 | D4 E4:.5 F4:.5 E4 C4 | D4 E4:.5 F4:.5 E4 D4 | C4 D4 G3:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2',
    chords: 'C | G | C | G | C | G | C | G:2 C:2 | G:2 C:2 | G:2 C:2 | G:2 C:2 | C:1 D7:1 G:2 | C | G | C | G:2 C:2',
  },
  auldLangSyne: {
    title: 'Auld Lang Syne (verse)',
    origin: 'Traditional Scottish melody; words Robert Burns (1788)',
    use: 'retirement, farewell, new year, reunions, long friendships',
    key: 'F', meter: 4, pickup: 1, bpm: [72, 96],
    melody: 'C4 | F4:1.5 F4:.5 F4 A4 | G4:1.5 F4:.5 G4 A4 | F4:1.5 F4:.5 A4 C5 | D5:3 D5 | C5:1.5 A4:.5 A4 F4 | G4:1.5 F4:.5 G4 A4 | F4:1.5 D4:.5 D4 C4 | F4:3',
    chords: 'F | C7 | F | Bb | F | C7 | Dm:2 Bb:1 C7:1 | F',
  },
  canonInD: {
    title: 'Canon in D (ground + first violin lines)',
    origin: 'Johann Pachelbel (c. 1680–1706)',
    use: 'weddings, anniversaries, elegant/tender moments',
    key: 'D', meter: 4, pickup: 0, bpm: [56, 80],
    // The 8-chord ground (2 beats each, 4 bars per cycle) under three classic upper lines.
    chords: 'D:2 A:2 | Bm:2 F#m:2 | G:2 D:2 | G:2 A:2',
    bass: 'D3:2 A2:2 | B2:2 F#2:2 | G2:2 D2:2 | G2:2 A2:2',
    melody: 'F#5:2 E5:2 | D5:2 C#5:2 | B4:2 A4:2 | B4:2 C#5:2',
    melody2: 'D5:2 C#5:2 | B4:2 A4:2 | G4:2 F#4:2 | G4:2 E4:2',
    melody3: 'D4 F#4 A4 G4 | F#4 D4 F#4 E4 | D4 B3 D4 A4 | G4 B4 A4 G4',
  },
  jingleBells: {
    title: 'Jingle Bells (chorus)',
    origin: 'James Lord Pierpont (1857)',
    use: 'winter holidays',
    key: 'G', meter: 4, pickup: 0, bpm: [100, 140],
    melody: 'B4 B4 B4:2 | B4 B4 B4:2 | B4 D5 G4:1.5 A4:.5 | B4:4 | C5 C5 C5:1.5 C5:.5 | C5 B4 B4 B4:.5 B4:.5 | B4 A4 A4 B4 | A4:2 D5:2 | B4 B4 B4:2 | B4 B4 B4:2 | B4 D5 G4:1.5 A4:.5 | B4:4 | C5 C5 C5:1.5 C5:.5 | C5 B4 B4 B4:.5 B4:.5 | D5 D5 C5 A4 | G4:4',
    chords: 'G | G | G | G | C | G | A7 | D7 | G | G | G | G | C | G | D7 | G',
  },
  minuetInG: {
    title: 'Minuet in G (BWV Anh. 114)',
    origin: 'Christian Petzold (c. 1725), long attributed to J. S. Bach',
    use: 'elegant anniversaries, graduations, refined/classy cards',
    key: 'G', meter: 3, pickup: 0, bpm: [100, 132],
    melody: 'D5 G4:.5 A4:.5 B4:.5 C5:.5 | D5 G4 G4 | E5 C5:.5 D5:.5 E5:.5 F#5:.5 | G5 G4 G4 | C5 D5:.5 C5:.5 B4:.5 A4:.5 | B4 C5:.5 B4:.5 A4:.5 G4:.5 | F#4 G4:.5 A4:.5 B4:.5 G4:.5 | A4:3 | D5 G4:.5 A4:.5 B4:.5 C5:.5 | D5 G4 G4 | E5 C5:.5 D5:.5 E5:.5 F#5:.5 | G5 G4 G4 | C5 D5:.5 C5:.5 B4:.5 A4:.5 | B4 C5:.5 B4:.5 A4:.5 G4:.5 | A4 B4:.5 A4:.5 G4:.5 F#4:.5 | G4:3',
    chords: 'G | G | C | G | C | G | D | D | G | G | C | G | C | G | D7 | G',
  },
  eineKleine: {
    title: 'Eine kleine Nachtmusik (opening)',
    origin: 'W. A. Mozart (1787)',
    use: 'playful-elegant celebrations, promotions, "bravo!" moments',
    key: 'G', meter: 4, pickup: 0, bpm: [120, 144],
    melody: 'G4 r:.5 D4:.5 G4 r:.5 D4:.5 | G4:.5 D4:.5 G4:.5 B4:.5 D5:2 | C5 r:.5 A4:.5 C5 r:.5 A4:.5 | C5:.5 A4:.5 F#4:.5 A4:.5 D4:2',
    chords: 'G | G | D7 | D7',
  },
};
