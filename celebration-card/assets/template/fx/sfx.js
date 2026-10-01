// Tiny synthesized sound effects — no files, no licences. Call sfx.unlock() inside the gate tap
// (createCard's 'unlock' event does it if you wire it: card.on('unlock', () => sfx.unlock())).
//
//   sfx.pop(); sfx.chime('E6'); sfx.sparkle(); sfx.whoosh(); sfx.boom(0.8); sfx.paper(); sfx.cork(); sfx.blow();
//
// Keep effects quiet (they sit under the music) and tie them to things the viewer does or sees.

let ac = null, out = null, noiseBuf = null, muted = false, volume = 0.5;

const note = (n) => {
  if (typeof n === 'number') return n;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (pc + (parseInt(m[3], 10) + 1) * 12 - 69) / 12);
};

function ready() {
  if (!ac || muted) return false;
  if (ac.state === 'suspended') ac.resume();
  return true;
}
function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(freq, { type = 'sine', a = 0.004, d = 0.4, peak = 0.3, at = 0, glide = null } = {}) {
  const t = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + a + d);
  env(g, t, a, peak, d);
  o.connect(g).connect(out); o.start(t); o.stop(t + a + d + 0.05);
}
function burst({ dur = 0.3, filter = 'bandpass', freq = 2000, q = 1, peak = 0.4, a = 0.004, at = 0, sweep = null } = {}) {
  const t = ac.currentTime + at;
  const s = ac.createBufferSource(); s.buffer = noise();
  const f = ac.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = ac.createGain(); env(g, t, a, peak, dur);
  s.connect(f).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
}

export const sfx = {
  /** Create/resume the AudioContext. Call inside a user gesture. */
  unlock() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      out = ac.createGain(); out.gain.value = volume;
      out.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  },
  get context() { return ac; },
  set muted(v) { muted = !!v; if (out) out.gain.value = muted ? 0 : volume; },
  get muted() { return muted; },
  set volume(v) { volume = v; if (out && !muted) out.gain.value = v; },
  pop() { if (!ready()) return; tone(note('C6') * (0.9 + Math.random() * 0.2), { d: 0.08, peak: 0.35, glide: 300 }); burst({ dur: 0.05, freq: 3000, peak: 0.2 }); },
  chime(n = 'E6', at = 0) { if (!ready()) return; const f = note(n); tone(f, { d: 1.6, peak: 0.16, at }); tone(f * 2.76, { d: 0.5, peak: 0.05, at }); tone(f * 5.4, { d: 0.25, peak: 0.02, at }); },
  sparkle() { if (!ready()) return; ['E7', 'B6', 'G#7', 'E7', 'B7'].forEach((n, i) => tone(note(n), { d: 0.35, peak: 0.05, at: i * 0.045 })); },
  whoosh(dur = 0.6) { if (!ready()) return; burst({ dur, filter: 'bandpass', freq: 300, sweep: 4000, q: 0.8, peak: 0.25, a: dur * 0.6 }); },
  boom(size = 1) { if (!ready()) return; tone(70 * (1.1 - size * 0.2), { d: 0.9, peak: 0.45 * size, glide: 35 }); burst({ dur: 0.7 * size, filter: 'lowpass', freq: 900, peak: 0.25 * size }); burst({ dur: 0.9, filter: 'highpass', freq: 5000, peak: 0.04, at: 0.15 }); },
  crackle(n = 14) { if (!ready()) return; for (let i = 0; i < n; i++) burst({ dur: 0.02, filter: 'highpass', freq: 4000 + Math.random() * 3000, peak: 0.12 * Math.random() + 0.03, at: 0.25 + Math.random() * 0.8 }); },
  paper() { if (!ready()) return; for (let i = 0; i < 4; i++) burst({ dur: 0.08 + Math.random() * 0.1, filter: 'bandpass', freq: 2500 + Math.random() * 3000, q: 0.6, peak: 0.08, at: i * 0.07 }); },
  cork() { if (!ready()) return; tone(520, { d: 0.06, peak: 0.5, glide: 180 }); burst({ dur: 0.12, freq: 1500, peak: 0.2 }); burst({ dur: 1.2, filter: 'highpass', freq: 6000, peak: 0.03, at: 0.1 }); },
  blow() { if (!ready()) return; burst({ dur: 0.5, filter: 'lowpass', freq: 700, peak: 0.25, a: 0.08 }); },
  tick() { if (!ready()) return; tone(2200, { type: 'square', d: 0.015, peak: 0.05 }); },
  /** Play a short arpeggio in the song's key, e.g. sfx.arp(['C6','E6','G6','C7']) on a tap. */
  arp(notes, gap = 0.06) { if (!ready()) return; notes.forEach((n, i) => sfx.chime(n, i * gap)); },
};
