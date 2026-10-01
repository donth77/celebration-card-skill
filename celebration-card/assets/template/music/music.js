// Synthesized music for celebration cards, built on Tone.js.
//
// A song is plain data: tempo, meter, instruments (presets) and named sections whose parts are
// written in a compact notation. Because the score *is* the timeline, every beat, bar and
// section boundary is known exactly — perfect sync with no analysis step.
//
//   import { song, melody, chords, arp, bass, drums, riser, MELODIES } from './music.js';
//   export default song({
//     bpm: 96, meter: 3,
//     instruments: { box: 'musicBox', keys: { preset: 'epiano', volume: -14 }, kit: 'kit' },
//     sections: [
//       { name: 'intro',  bars: 4, parts: { keys: arp('F | Bb | C7 | C7') } },
//       { name: 'verse1', bars: 8, parts: { box: melody(M.melody, { pickup: 1, transpose: 17 }),
//                                          keys: chords(M.chords, { transpose: 5, rhythm: 'waltz' }) } },
//     ],
//   });
//
// Notation
//   melody  'G4:.75 G4:.25 | A4 G4 C5 | B4:2 r:1'   note:beats (default 1), r = rest, C4+E4 = dyad,
//           1/3 durations for triplets, trailing ! = accent, ? = soft. '|' marks bars (checked).
//   chords  'F | Bb | C7 | %'  one chord per bar ('%' repeats), or 'C:2 G7:1' with beat lengths.
//           Symbols: C Cm C7 Cmaj7 Cm7 C9 Cadd9 Csus4 Cdim Caug C6 Cm7b5 C/E …
//   drums   { kick: 'x...x...', snare: '....x...', hat: 'x.x.x.x.' }  one bar per string;
//           X accent, x hit, o ghost, . rest.
//
// See references/synth-music.md for presets, arrangement recipes and complete example songs.

import * as Tone from 'tone';
import { Timing } from 'card/runtime/timing.js';
import { setPlaybackAudioSession } from 'card/runtime/clock.js';

// =============================================================== pitch & chord parsing
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function toMidi(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(String(n).trim());
  if (!m) throw new Error(`music: can't read note "${n}" (use e.g. C4, F#3, Bb5)`);
  let pc = PC[m[1].toUpperCase()];
  for (const c of m[2]) pc += c === '#' ? 1 : -1;
  return pc + (parseInt(m[3], 10) + 1) * 12;
}
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

const QUALITIES = {
  '': [0, 4, 7], maj: [0, 4, 7], M: [0, 4, 7], m: [0, 3, 7], min: [0, 3, 7], '-': [0, 3, 7],
  dim: [0, 3, 6], aug: [0, 4, 8], '+': [0, 4, 8], sus: [0, 5, 7], sus2: [0, 2, 7], sus4: [0, 5, 7], 5: [0, 7],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  min7: [0, 3, 7, 10], mMaj7: [0, 3, 7, 11], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], '7sus4': [0, 5, 7, 10],
  9: [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14],
  '6/9': [0, 4, 7, 9, 14], 11: [0, 4, 7, 10, 14, 17], m11: [0, 3, 7, 10, 14, 17], 13: [0, 4, 7, 10, 14, 21],
  maj13: [0, 4, 7, 11, 14, 21],
};

export function parseChord(sym, transpose = 0) {
  const m = /^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/.exec(String(sym).trim());
  if (!m) throw new Error(`music: can't read chord "${sym}"`);
  const acc = (a) => (a === '#' ? 1 : a === 'b' ? -1 : 0);
  const root = (((PC[m[1]] + acc(m[2]) + transpose) % 12) + 12) % 12;
  const intervals = QUALITIES[m[3]];
  if (!intervals) throw new Error(`music: unknown chord quality "${m[3]}" in "${sym}". Known: ${Object.keys(QUALITIES).filter(Boolean).join(' ')}`);
  const bassPc = m[4] ? (((PC[m[4]] + acc(m[5]) + transpose) % 12) + 12) % 12 : root;
  return { sym, root, intervals, bass: bassPc };
}

/** Close voicing near `center` (midi), smoothly led from `prev` (array of midi) when given. */
export function voiceChord(chord, center = 60, prev = null, maxVoices = 4) {
  let ivs = [...new Set(chord.intervals.map((i) => i % 12))];
  if (ivs.length > maxVoices) ivs = ivs.filter((i) => i !== 7).slice(0, maxVoices); // drop the 5th first
  const pcs = ivs.map((i) => (chord.root + i) % 12);
  let best = null, bestCost = Infinity;
  for (let r = 0; r < pcs.length; r++) {
    const order = pcs.slice(r).concat(pcs.slice(0, r));
    const notes = [];
    let n = center - 7 + ((order[0] - (center - 7)) % 12 + 12) % 12;
    notes.push(n);
    for (let k = 1; k < order.length; k++) { n = n + ((order[k] - n) % 12 + 12) % 12 || n + 12; notes.push(n); }
    const mean = notes.reduce((a, b) => a + b, 0) / notes.length;
    let cost = Math.abs(mean - center) * 0.6;
    if (prev && prev.length) {
      const a = [...notes].sort((x, y) => x - y), b = [...prev].sort((x, y) => x - y);
      for (let i = 0; i < Math.max(a.length, b.length); i++) cost += Math.abs((a[i] ?? a[a.length - 1]) - (b[i] ?? b[b.length - 1]));
    }
    if (cost < bestCost) { bestCost = cost; best = notes; }
  }
  return best;
}

// =============================================================== notation → events
// An event is { t: beats from the section's first downbeat, d: beats, n: midi | drum name, v: 0..1 }.
// Every helper returns a function (sec) => events so it can use the song's meter and the section length.

const num = (s) => (s.includes('/') ? s.split('/').reduce((a, b) => parseFloat(a) / parseFloat(b)) : parseFloat(s));

function checkBars(label, bars, meter, pickup) {
  bars.forEach((len, i) => {
    const expect = i === 0 && pickup ? pickup : meter;
    const last = i === bars.length - 1;
    if (Math.abs(len - expect) > 1e-3 && !(last && len < meter + 1e-3) && !(len > meter && Math.abs(len % meter) < 1e-3)) {
      console.warn(`[music] ${label}: bar ${i + (pickup ? 0 : 1)} has ${+len.toFixed(3)} beats, expected ${expect}.`);
    }
  });
}

/** A melody line in note:beats notation. opts: transpose, octave, vel, pickup (beats before bar 1), legato. */
export function melody(str, { transpose = 0, octave = 0, vel = 0.8, pickup = 0, legato = 0.92 } = {}) {
  return (sec) => {
    const events = [];
    const barLens = [];
    let t = -pickup, barStart = -pickup;
    const segs = String(str).split('|');
    segs.forEach((seg, si) => {
      for (const tok of seg.trim().split(/\s+/).filter(Boolean)) {
        const m = /^(r|-|[A-Ga-g][#b]?-?\d(?:\+[A-Ga-g][#b]?-?\d)*)(?::([\d./]+))?([!?]?)$/.exec(tok);
        if (!m) throw new Error(`music: can't read melody token "${tok}" in "${String(str).slice(0, 40)}…"`);
        const d = m[2] ? num(m[2]) : 1;
        if (m[1] !== 'r' && m[1] !== '-') {
          const v = vel * (m[3] === '!' ? 1.2 : m[3] === '?' ? 0.6 : 1);
          for (const n of m[1].split('+')) events.push({ t, d: d * legato, n: toMidi(n) + transpose + octave * 12, v: Math.min(1, v) });
        }
        t += d;
      }
      if (si < segs.length - 1 || seg.trim()) barLens.push(t - barStart);
      barStart = t;
    });
    if (segs.length > 1) checkBars(`melody "${String(str).trim().slice(0, 24)}…"`, barLens, sec.meter, pickup);
    return events;
  };
}

/** Parse a progression into [{t, d, chord}] (beats). */
function progression(prog, meter, transpose) {
  const out = [];
  let t = 0, prevSym = null;
  String(prog).split('|').forEach((seg) => {
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return;
    const hasDur = toks.some((x) => x.includes(':'));
    toks.forEach((tok) => {
      let [sym, dur] = tok.split(':');
      if (sym === '%') sym = prevSym;
      if (!sym) throw new Error(`music: '%' with no previous chord in "${prog}"`);
      const d = dur ? num(dur) : hasDur ? meter : meter / toks.length;
      out.push({ t, d, chord: parseChord(sym, transpose) });
      prevSym = sym; t += d;
    });
  });
  return out;
}

/**
 * Chords from a progression. opts: transpose, octave (voicing centre, default 4), vel, voices,
 * rhythm: 'hold' | 'pulse' | 'half' | 'waltz' | 'oompah' | 'offbeat' | 'strum' | pattern like 'x..x..x.' (with step, beats)
 */
export function chords(prog, { transpose = 0, octave = 4, vel = 0.55, voices = 4, rhythm = 'hold', step = 0.5, strum = 0.03 } = {}) {
  return (sec) => {
    const events = [];
    let prev = null;
    const center = (octave + 1) * 12 + 4;
    for (const { t, d, chord } of progression(prog, sec.meter, transpose)) {
      const notes = voiceChord(chord, center, prev, voices);
      prev = notes;
      const bassNote = ((chord.bass - center + 60) % 12 + 12) % 12 + center - 12 - (((chord.bass - center + 60) % 12 + 12) % 12 > 4 ? 12 : 0);
      const hit = (at, len, v = vel, ns = notes) => ns.forEach((n) => events.push({ t: t + at, d: len, n, v }));
      if (rhythm === 'hold') hit(0, d * 0.98);
      else if (rhythm === 'pulse') for (let b = 0; b < d - 1e-6; b++) hit(b, 0.85);
      else if (rhythm === 'half') for (let b = 0; b < d - 1e-6; b += 2) hit(b, Math.min(2, d - b) * 0.9);
      else if (rhythm === 'waltz' || rhythm === 'oompah') {
        for (let b = 0; b < d - 1e-6; b++) {
          const beatInBar = Math.round((t + b) % sec.meter);
          if (beatInBar === 0 || (rhythm === 'oompah' && beatInBar === 2)) events.push({ t: t + b, d: 0.9, n: beatInBar === 2 ? bassNote + 7 : bassNote, v: vel * 1.1 });
          else hit(b, 0.55, vel * 0.8);
        }
      } else if (rhythm === 'offbeat') for (let b = 0; b < d - 1e-6; b++) hit(b + 0.5, 0.35, vel * 0.9);
      else if (rhythm === 'strum') notes.forEach((n, i) => events.push({ t: t + i * strum, d: d * 0.98 - i * strum, n, v: vel * (1 - i * 0.05) }));
      else if (/^[xXo.\-]+$/.test(rhythm)) {
        const pat = rhythm;
        for (let k = 0, at = 0; at < d - 1e-6; k++, at += step) {
          const c = pat[k % pat.length];
          if (c !== '.' && c !== '-') hit(at, step * 0.9, vel * (c === 'X' ? 1.2 : c === 'o' ? 0.5 : 1));
        }
      } else throw new Error(`music: unknown chord rhythm "${rhythm}"`);
    }
    return events;
  };
}

/** Arpeggio over a progression. pattern: up | down | updown | random | pinky. rate in beats (0.5 = eighths). */
export function arp(prog, { transpose = 0, octave = 4, pattern = 'up', rate = 0.5, octaves = 1, vel = 0.5, gate = 0.9, seed = 7 } = {}) {
  return (sec) => {
    const events = [];
    let prev = null, s = seed;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (const { t, d, chord } of progression(prog, sec.meter, transpose)) {
      const base = voiceChord(chord, (octave + 1) * 12 + 2, prev, 4);
      prev = base;
      const pool = [];
      for (let o = 0; o < octaves; o++) base.forEach((n) => pool.push(n + 12 * o));
      pool.sort((a, b) => a - b);
      const seq = pattern === 'down' ? [...pool].reverse()
        : pattern === 'updown' ? pool.concat(pool.slice(1, -1).reverse())
        : pattern === 'pinky' ? pool.slice(0, -1).flatMap((n) => [n, pool[pool.length - 1]])
        : pool;
      for (let k = 0, at = 0; at < d - 1e-6; k++, at += rate) {
        const n = pattern === 'random' ? pool[Math.floor(rand() * pool.length)] : seq[k % seq.length];
        events.push({ t: t + at, d: rate * gate, n, v: vel * (k % 2 ? 0.85 : 1) });
      }
    }
    return events;
  };
}

/** Bass line from a progression. pattern: root | root5 | octave | pulse8 | waltz | walk */
export function bass(prog, { transpose = 0, octave = 2, pattern = 'root', vel = 0.8 } = {}) {
  return (sec) => {
    const events = [];
    const prog2 = progression(prog, sec.meter, transpose);
    prog2.forEach(({ t, d, chord }, i) => {
      const root = chord.bass + (octave + 1) * 12;
      const fifth = root + 7;
      const add = (at, len, n, v = vel) => { if (at < d - 1e-6) events.push({ t: t + at, d: Math.min(len, d - at), n, v }); };
      if (pattern === 'root') add(0, d * 0.95, root);
      else if (pattern === 'root5') { add(0, d / 2 * 0.95, root); add(d / 2, d / 2 * 0.95, fifth - 12 >= root - 5 ? fifth - 12 : fifth); }
      else if (pattern === 'octave') for (let b = 0; b < d; b += 0.5) add(b, 0.45, (b * 2) % 2 ? root + 12 : root, vel * ((b * 2) % 2 ? 0.8 : 1));
      else if (pattern === 'pulse8') for (let b = 0; b < d; b += 0.5) add(b, 0.42, root, vel * (b % 1 ? 0.75 : 1));
      else if (pattern === 'waltz') for (let b = 0; b < d; b += sec.meter) add(b, 0.95, root);
      else if (pattern === 'walk') {
        const next = prog2[i + 1] ? prog2[i + 1].chord.bass + (octave + 1) * 12 : root;
        const third = root + (chord.intervals.includes(3) ? 3 : 4);
        const steps = [root, third, fifth, next + (next > root ? -1 : 1)];
        for (let b = 0; b < d; b++) add(b, 0.9, steps[b % 4], vel * (b % 2 ? 0.8 : 1));
      } else throw new Error(`music: unknown bass pattern "${pattern}"`);
    });
    return events;
  };
}

/** Drum pattern: { kick, snare, clap, hat, ohat, shaker, rim, tom, crash } one bar per string; repeats. */
export function drums(pattern, { vel = 0.85, fill = null, from = 0 } = {}) {
  return (sec) => {
    const events = [];
    for (let bar = from; bar < sec.bars; bar++) {
      const pat = fill && bar === sec.bars - 1 ? { ...pattern, ...fill } : pattern;
      for (const [name, str] of Object.entries(pat)) {
        if (!str) continue;
        const stepLen = sec.meter / str.length;
        [...str].forEach((c, i) => {
          if (c === '.' || c === '-' || c === ' ') return;
          events.push({ t: bar * sec.meter + i * stepLen, d: stepLen, n: name, v: vel * (c === 'X' ? 1.15 : c === 'o' ? 0.45 : 0.85) });
        });
      }
    }
    return events;
  };
}

/** Noise riser that ends exactly at the end of the section (use on the kit). */
export const riser = (beats = 4, vel = 0.6) => (sec) => [{ t: sec.bars * sec.meter - beats, d: beats, n: 'riser', v: vel }];
/** A single hit (kit sound name or note) at a beat position. */
export const hit = (name, at = 0, vel = 0.9, d = 1) => () => [{ t: at, d, n: typeof name === 'string' && /^[A-G]/.test(name) ? toMidi(name) : name, v: vel }];
/** Merge several parts into one. */
export const layer = (...parts) => (sec) => parts.flatMap((p) => resolvePart(p, sec));
/** Shift a part in time (beats) and/or pitch (semitones). */
export const shift = (part, { beats = 0, semitones = 0 } = {}) => (sec) => resolvePart(part, sec).map((e) => ({ ...e, t: e.t + beats, n: typeof e.n === 'number' ? e.n + semitones : e.n }));
/** Repeat a part `times`, each copy `every` beats apart (default: section length / times). */
export const repeat = (part, times, every = null) => (sec) => {
  const len = every ?? (sec.bars * sec.meter) / times;
  return Array.from({ length: times }, (_, k) => resolvePart(part, sec).map((e) => ({ ...e, t: e.t + k * len }))).flat();
};
/** Scale velocities (dynamics) of a part. */
export const dyn = (part, factor) => (sec) => resolvePart(part, sec).map((e) => ({ ...e, v: Math.min(1, e.v * factor) }));

function resolvePart(p, sec) {
  if (!p) return [];
  if (typeof p === 'function') return p(sec);
  if (Array.isArray(p)) return p.flatMap((x) => (typeof x === 'function' || Array.isArray(x) ? resolvePart(x, sec) : [x]));
  return [];
}

// =============================================================== song definition
/** Normalise a song definition and compute its exact timing. */
export function song(def) {
  const bpm = def.bpm ?? 100, meter = def.meter ?? 4;
  const spb = 60 / bpm;
  const first = def.sections[0];
  const leadIn = (first?.pickup ?? 0) * spb; // pickup before the very first bar
  let t = leadIn;
  const sections = def.sections.map((s, index) => {
    const out = { ...s, index, bars: s.bars, start: t, end: t + s.bars * meter * spb };
    t = out.end;
    return out;
  });
  const tail = def.tail ?? 2.5;
  const timing = new Timing({
    duration: t + tail, bpm, meter, offset: leadIn,
    sections: sections.map((s, i) => ({ name: s.name, start: i === 0 ? 0 : s.start, end: i === sections.length - 1 ? t + tail : s.end })),
  });
  return { ...def, bpm, meter, spb, sections, timing, tail, swing: def.swing ?? 0, _isSong: true };
}

// =============================================================== instruments
const poly = (Voice, opts, max = 32) => { const p = new Tone.PolySynth(Voice, opts); p.maxPolyphony = Math.max(32, max); return p; };

/** Instrument presets. Each returns { source, output } (source gets triggered, output gets mixed). */
export const PRESETS = {
  musicBox: () => { const s = poly(Tone.FMSynth, { harmonicity: 3.99, modulationIndex: 7, oscillator: { type: 'sine' }, modulation: { type: 'sine' }, envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 1.4 }, modulationEnvelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.15 } }, 24); return { source: s, output: s, reverb: -8 }; },
  celesta: () => { const s = poly(Tone.FMSynth, { harmonicity: 2, modulationIndex: 3.2, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1 }, modulationEnvelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 } }, 24); return { source: s, output: s, reverb: -8 }; },
  glock: () => { const s = poly(Tone.FMSynth, { harmonicity: 3.5, modulationIndex: 6, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 2.2, sustain: 0, release: 2 }, modulationEnvelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 } }, 24); return { source: s, output: s, reverb: -6 }; },
  bell: () => { const s = poly(Tone.FMSynth, { harmonicity: 1.41, modulationIndex: 9, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 3.5, sustain: 0, release: 3 }, modulationEnvelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1 } }, 16); return { source: s, output: s, reverb: -5 }; },
  kalimba: () => { const s = poly(Tone.FMSynth, { harmonicity: 6.02, modulationIndex: 2.2, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.6 }, modulationEnvelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 } }, 16); return { source: s, output: s, reverb: -10 }; },
  marimba: () => { const s = poly(Tone.FMSynth, { harmonicity: 4, modulationIndex: 1.6, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.35 }, modulationEnvelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.05 } }, 16); return { source: s, output: s, reverb: -12 }; },
  epiano: () => {
    const s = poly(Tone.FMSynth, { harmonicity: 1, modulationIndex: 2.4, oscillator: { type: 'sine' }, modulation: { type: 'sine' }, envelope: { attack: 0.003, decay: 1.8, sustain: 0.18, release: 1.1 }, modulationEnvelope: { attack: 0.002, decay: 0.7, sustain: 0.1, release: 0.8 } }, 16);
    const trem = new Tone.Tremolo({ frequency: 4.2, depth: 0.18, spread: 90 }).start();
    s.connect(trem);
    return { source: s, output: trem, reverb: -12 };
  },
  softPiano: () => {
    const s = poly(Tone.Synth, { oscillator: { type: 'fattriangle', count: 2, spread: 6 }, envelope: { attack: 0.003, decay: 2.0, sustain: 0.06, release: 1.3 } }, 16);
    const f = new Tone.Filter({ frequency: 2600, type: 'lowpass', rolloff: -12 });
    s.connect(f);
    return { source: s, output: f, reverb: -10 };
  },
  harp: () => {
    const s = poly(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 1.2 } }, 24);
    const f = new Tone.Filter({ frequency: 3200, type: 'lowpass' });
    s.connect(f);
    return { source: s, output: f, reverb: -7 };
  },
  pluck: () => {
    const s = poly(Tone.MonoSynth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 }, filter: { Q: 1, type: 'lowpass', rolloff: -24 }, filterEnvelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.1, baseFrequency: 350, octaves: 3.6 } }, 16);
    return { source: s, output: s, reverb: -12 };
  },
  warmPad: () => {
    const s = poly(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 22 }, envelope: { attack: 0.9, decay: 0.6, sustain: 0.8, release: 2.6 } }, 12);
    const f = new Tone.Filter({ frequency: 950, type: 'lowpass', rolloff: -24, Q: 0.4 });
    const ch = new Tone.Chorus({ frequency: 0.5, delayTime: 3.5, depth: 0.6, spread: 180 }).start();
    s.chain(f, ch);
    return { source: s, output: ch, reverb: -6 };
  },
  airPad: () => {
    const s = poly(Tone.Synth, { oscillator: { type: 'fattriangle', count: 3, spread: 30 }, envelope: { attack: 1.6, decay: 1, sustain: 0.85, release: 3.5 } }, 12);
    const f = new Tone.Filter({ frequency: 2800, type: 'lowpass' });
    const ch = new Tone.Chorus({ frequency: 0.3, delayTime: 4, depth: 0.7, spread: 180 }).start();
    s.chain(f, ch);
    return { source: s, output: ch, reverb: -4 };
  },
  strings: () => {
    const s = poly(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 16 }, envelope: { attack: 0.35, decay: 0.3, sustain: 0.85, release: 1.4 } }, 16);
    const f = new Tone.Filter({ frequency: 2200, type: 'lowpass', rolloff: -24 });
    const v = new Tone.Vibrato({ frequency: 5, depth: 0.06 });
    s.chain(f, v);
    return { source: s, output: v, reverb: -6 };
  },
  brass: () => {
    const s = poly(Tone.MonoSynth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.04, decay: 0.25, sustain: 0.75, release: 0.35 }, filter: { Q: 1.2, type: 'lowpass', rolloff: -24 }, filterEnvelope: { attack: 0.06, decay: 0.35, sustain: 0.55, release: 0.4, baseFrequency: 280, octaves: 3.2 } }, 12);
    return { source: s, output: s, reverb: -9 };
  },
  lead: () => {
    const s = poly(Tone.Synth, { oscillator: { type: 'fatsquare', count: 2, spread: 12 }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.55, release: 0.3 } }, 8);
    const f = new Tone.Filter({ frequency: 2600, type: 'lowpass' });
    const v = new Tone.Vibrato({ frequency: 5.5, depth: 0.05 });
    s.chain(f, v);
    return { source: s, output: v, reverb: -10 };
  },
  chip: () => { const s = poly(Tone.Synth, { oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.12, sustain: 0.45, release: 0.06 } }, 8); return { source: s, output: s, reverb: -20 }; },
  chipBass: () => { const s = poly(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0.8, release: 0.05 } }, 4); return { source: s, output: s, reverb: -40 }; },
  softBass: () => {
    const s = poly(Tone.MonoSynth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.5, sustain: 0.55, release: 0.4 }, filter: { Q: 0.8, type: 'lowpass' }, filterEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.5, release: 0.4, baseFrequency: 180, octaves: 2 } }, 4);
    return { source: s, output: s, reverb: -30 };
  },
  synthBass: () => {
    const s = poly(Tone.MonoSynth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.5, release: 0.25 }, filter: { Q: 2, type: 'lowpass', rolloff: -24 }, filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.2, baseFrequency: 110, octaves: 2.6 } }, 4);
    return { source: s, output: s, reverb: -30 };
  },
  kit: () => makeKit(),
};

function makeKit() {
  const out = new Tone.Gain(1);
  const v = {};
  const guard = (voice, time) => { const t = Math.max(time, (voice._last ?? -1) + 0.002); voice._last = t; return t; };
  const noise = (decay, filter, gain = 1, type = 'white') => {
    const s = new Tone.NoiseSynth({ noise: { type }, envelope: { attack: 0.001, decay, sustain: 0 } });
    const g = new Tone.Gain(gain);
    s.chain(filter, g, out);
    return s;
  };
  v.kick = new Tone.MembraneSynth({ pitchDecay: 0.035, octaves: 6, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.1 } }).connect(out);
  v.snareBody = new Tone.MembraneSynth({ pitchDecay: 0.012, octaves: 1.5, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 } }).connect(new Tone.Gain(0.5).connect(out));
  v.snare = noise(0.15, new Tone.Filter({ frequency: 2600, type: 'bandpass', Q: 0.7 }), 0.9);
  v.clap = noise(0.11, new Tone.Filter({ frequency: 1400, type: 'bandpass', Q: 1.1 }), 1.0);
  v.hat = noise(0.035, new Tone.Filter({ frequency: 7800, type: 'highpass' }), 0.45);
  v.ohat = noise(0.26, new Tone.Filter({ frequency: 7200, type: 'highpass' }), 0.35);
  v.shaker = noise(0.055, new Tone.Filter({ frequency: 6500, type: 'bandpass', Q: 0.9 }), 0.35);
  v.crash = noise(1.6, new Tone.Filter({ frequency: 4200, type: 'highpass' }), 0.35);
  v.rim = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.0005, decay: 0.03, sustain: 0, release: 0.01 } }).chain(new Tone.Filter({ frequency: 900, type: 'highpass' }), new Tone.Gain(0.5), out);
  v.tom = new Tone.MembraneSynth({ pitchDecay: 0.06, octaves: 2, envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.2 } }).connect(new Tone.Gain(0.6).connect(out));
  v.timpani = new Tone.MembraneSynth({ pitchDecay: 0.09, octaves: 1.4, envelope: { attack: 0.002, decay: 1.4, sustain: 0, release: 0.8 } }).connect(new Tone.Gain(0.8).connect(out));
  // riser: filtered noise swelling into a downbeat
  const riserFilter = new Tone.Filter({ frequency: 300, type: 'lowpass', Q: 2 });
  const riserGain = new Tone.Gain(0);
  const riserNoise = new Tone.Noise('white');
  riserNoise.chain(riserFilter, riserGain, out);
  let riserStarted = false;
  // impact: deep boom for the climax
  v.boom = new Tone.MembraneSynth({ pitchDecay: 0.2, octaves: 3, envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1 } }).connect(new Tone.Gain(0.9).connect(out));

  return {
    source: null, output: out, reverb: -14, kit: true,
    trigger(name, time, vel = 0.8, dur = 0.5) {
      switch (name) {
        case 'kick': v.kick.triggerAttackRelease('C1', 0.3, guard(v.kick, time), vel); break;
        case 'snare': v.snare.triggerAttackRelease(0.15, guard(v.snare, time), vel); v.snareBody.triggerAttackRelease('F#3', 0.08, guard(v.snareBody, time), vel); break;
        case 'clap': { const t0 = guard(v.clap, time); [0, 0.011, 0.023].forEach((o, i) => v.clap.triggerAttackRelease(0.1, t0 + o, vel * (1 - i * 0.2))); v.clap._last = t0 + 0.023; break; }
        case 'hat': v.hat.triggerAttackRelease(0.03, guard(v.hat, time), vel); break;
        case 'ohat': v.ohat.triggerAttackRelease(0.25, guard(v.ohat, time), vel); break;
        case 'shaker': v.shaker.triggerAttackRelease(0.05, guard(v.shaker, time), vel); break;
        case 'crash': v.crash.triggerAttackRelease(1.5, guard(v.crash, time), vel); break;
        case 'rim': v.rim.triggerAttackRelease(1800, 0.02, guard(v.rim, time), vel); break;
        case 'tom': v.tom.triggerAttackRelease('A2', 0.3, guard(v.tom, time), vel); break;
        case 'tomHi': v.tom.triggerAttackRelease('E3', 0.3, guard(v.tom, time), vel); break;
        case 'timpani': v.timpani.triggerAttackRelease('D2', 1, guard(v.timpani, time), vel); break;
        case 'timpaniLow': v.timpani.triggerAttackRelease('A1', 1, guard(v.timpani, time), vel); break;
        case 'boom': v.boom.triggerAttackRelease('A0', 1.2, guard(v.boom, time), vel); break;
        case 'riser': {
          if (!riserStarted) { riserNoise.start(time); riserStarted = true; }
          const f = riserFilter.frequency, g = riserGain.gain;
          f.cancelScheduledValues(time); g.cancelScheduledValues(time);
          f.setValueAtTime(300, time); f.exponentialRampToValueAtTime(9000, time + dur);
          g.setValueAtTime(0, time); g.linearRampToValueAtTime(0.28 * vel, time + dur * 0.97); g.linearRampToValueAtTime(0, time + dur + 0.04);
          break;
        }
        default: console.warn(`[music] unknown drum "${name}"`);
      }
    },
    release(time) {
      try { riserGain.gain.cancelScheduledValues(time); riserGain.gain.setValueAtTime(0, time); } catch { /* not started */ }
    },
  };
}

// =============================================================== engine
/** Build instruments + schedule the whole song on the Transport of the *current* Tone context. */
async function buildSong(S, { analyser = false } = {}) {
  const transport = Tone.getTransport();
  transport.cancel(0);
  transport.bpm.value = S.bpm;

  const master = new Tone.Gain(Tone.dbToGain(S.master ?? 5)); // presets are quiet; dynamics below tame peaks
  const comp = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.006, release: 0.25 });
  const limiter = new Tone.Limiter(-2);
  // Soft-clip safety: transparent below ~-6 dBFS, saturates smoothly instead of hard-clipping above.
  const k = 1.4, norm = Math.tanh(k);
  const softclip = new Tone.WaveShaper((x) => Math.tanh(k * x) / norm, 4096);
  const trim = new Tone.Gain(0.94);
  master.chain(comp, limiter, softclip, trim, Tone.getDestination());
  const reverb = new Tone.Reverb({ decay: S.reverb?.decay ?? 3.2, preDelay: 0.02, wet: 1 });
  await reverb.ready;
  reverb.connect(master);

  let an = null;
  if (analyser) {
    an = Tone.getContext().rawContext.createAnalyser();
    an.fftSize = 1024; an.smoothingTimeConstant = 0.55;
    Tone.connect(trim, an);
  }

  const insts = {};
  for (const [name, spec0] of Object.entries(S.instruments || {})) {
    const spec = typeof spec0 === 'string' ? { preset: spec0 } : spec0;
    const make = PRESETS[spec.preset];
    if (!make) throw new Error(`music: unknown preset "${spec.preset}" for "${name}". Presets: ${Object.keys(PRESETS).join(', ')}`);
    const inst = make();
    const ch = new Tone.Channel({ volume: spec.volume ?? -12, pan: spec.pan ?? 0 });
    inst.output.connect(ch);
    ch.connect(master);
    const send = new Tone.Gain(Tone.dbToGain(spec.reverb ?? inst.reverb ?? -12));
    ch.connect(send); send.connect(reverb);
    insts[name] = { ...inst, channel: ch, spec };
  }

  // Collect events per instrument at absolute seconds.
  const spb = S.spb;
  const perInst = {};
  const swingAt = (beats) => {
    if (!S.swing) return beats;
    const unit = S.swingUnit ?? 0.5; // swing 8ths
    const pos = beats / (unit * 2);
    const frac = pos - Math.floor(pos);
    return Math.abs(frac - 0.5) < 1e-3 ? beats + S.swing * unit * (1 / 3) : beats;
  };
  for (const sec of S.sections) {
    const ctxSec = { bars: sec.bars, meter: S.meter, bpm: S.bpm, name: sec.name, index: sec.index };
    for (const [instName, part] of Object.entries(sec.parts || {})) {
      if (!insts[instName]) { console.warn(`[music] section "${sec.name}" uses unknown instrument "${instName}"`); continue; }
      for (const e of resolvePart(part, ctxSec)) {
        const time = sec.start + swingAt(e.t) * spb;
        if (time < 0) continue;
        (perInst[instName] ||= []).push({ time, n: e.n, d: Math.max(0.02, e.d * spb), v: Math.max(0.05, Math.min(1, e.v ?? 0.8)) });
      }
    }
  }

  const parts = [];
  for (const [name, events] of Object.entries(perInst)) {
    const inst = insts[name];
    events.sort((a, b) => a.time - b.time);
    const part = new Tone.Part((time, e) => {
      if (inst.kit) inst.trigger(e.n, time, e.v, e.d);
      else inst.source.triggerAttackRelease(midiToFreq(e.n), e.d, time, e.v);
    }, events.map((e) => [e.time, e]));
    part.start(0);
    parts.push(part);
  }

  const releaseAll = (time = Tone.now()) => {
    for (const inst of Object.values(insts)) {
      try { inst.kit ? inst.release(time) : inst.source.releaseAll(time); } catch { /* ignore */ }
    }
  };
  const dispose = () => { parts.forEach((p) => p.dispose()); Object.values(insts).forEach((i) => { i.source?.dispose?.(); i.output?.dispose?.(); i.channel?.dispose(); }); [reverb, master, comp, limiter, softclip, trim].forEach((n) => n.dispose()); };
  return { transport, insts, parts, releaseAll, analyser: an, dispose, eventCount: Object.values(perInst).reduce((a, e) => a + e.length, 0) };
}

/** Master clock driven by a synthesized song (same interface as runtime/clock.js clocks). */
export class SynthClock {
  constructor(songDef) {
    this.kind = 'synth';
    this.song = songDef._isSong ? songDef : song(songDef);
    this.timing = this.song.timing;
    this.duration = this.timing.duration;
    this._pos = 0; this._playing = false; this._startCtx = 0; this._startPos = 0;
    this._bands = new Uint8Array(512);
    this._peak = 0.2;
  }
  async load() {
    // Larger audio buffers ('playback') = fewer glitches on phones; visuals compensate for latency.
    const old = Tone.getContext();
    Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: 0.1 }));
    try { old.dispose(); } catch { /* already closed */ }
    this.engine = await buildSong(this.song, { analyser: true });
  }
  unlock() {
    setPlaybackAudioSession();
    this._startPromise = Tone.start(); // must run inside the gesture
    return this._startPromise;
  }
  get _raw() { return Tone.getContext().rawContext; }
  async play() {
    if (this._raw.state !== 'running') {
      await Promise.race([Tone.start(), new Promise((r) => setTimeout(r, 350))]);
      if (this._raw.state !== 'running') { const e = new Error('AudioContext is not running (needs a user gesture)'); e.name = 'NotAllowedError'; throw e; }
    }
    if (this._playing) return;
    if (this._pos >= this.duration - 0.05) this._pos = 0;
    const at = Tone.now();
    const tr = this.engine.transport;
    tr.stop(); this.engine.releaseAll();
    tr.start(at, this._pos);
    this._startCtx = at; this._startPos = this._pos; this._playing = true;
  }
  pause() {
    if (!this._playing) return;
    this._pos = this.time; this._playing = false;
    this.engine.transport.pause(); this.engine.releaseAll();
  }
  seek(t) {
    this._pos = Math.max(0, Math.min(this.duration, t));
    if (this._playing) {
      this._playing = false;
      this.play();
    }
  }
  get time() {
    if (!this._playing) return this._pos;
    const raw = this._raw;
    const latency = (raw.outputLatency || 0) + (raw.baseLatency || 0);
    return Math.max(this._startPos, this._startPos + (raw.currentTime - this._startCtx) - latency);
  }
  get playing() { return this._playing && this.time < this.duration; }
  get ended() { return this.time >= this.duration; }
  get muted() { return Tone.getDestination().mute; }
  set muted(v) { Tone.getDestination().mute = !!v; }
  levels() {
    const an = this.engine?.analyser;
    if (!an || !this._playing) return null;
    const buf = this._bands;
    an.getByteFrequencyData(buf);
    const hz = this._raw.sampleRate / an.fftSize;
    const band = (lo, hi) => { let s = 0, n = 0; for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(buf.length - 1, Math.ceil(hi / hz)); i++) { s += buf[i]; n++; } return n ? s / n / 255 : 0; };
    const b = band(30, 160), m = band(160, 2000), tr = band(2000, 9000);
    const lvl = Math.max(b, m, tr);
    this._peak = Math.max(lvl, this._peak * 0.998, 0.15);
    const k = 1 / this._peak;
    return { bass: Math.min(1, b * k), mid: Math.min(1, m * k * 1.1), treble: Math.min(1, tr * k * 1.4) };
  }
}

/** Render a song to a WAV Blob offline (for listening outside the card, or converting to MP3). */
export async function renderSongToWav(songDef, { seconds = null, sampleRate = 44100 } = {}) {
  const S = songDef._isSong ? songDef : song(songDef);
  const dur = seconds ?? S.timing.duration;
  const buffer = await Tone.Offline(async () => {
    const eng = await buildSong(S);
    eng.transport.start(0);
  }, dur, 2, sampleRate);
  return audioBufferToWav(buffer.get ? buffer.get() : buffer);
}

function audioBufferToWav(ab) {
  const ch = ab.numberOfChannels, len = ab.length, sr = ab.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, sr, true);
  data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => ab.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([data.buffer], { type: 'audio/wav' });
}

export { MELODIES } from './melodies.js';
