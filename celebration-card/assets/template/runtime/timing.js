// The musical map of the card: duration, beat grid, named sections, and (optionally)
// pre-computed loudness bands for audio-reactive visuals.
//
// Timing comes from one of three places, all producing the same shape:
//   Timing.fromPlan({...})       – planned structure (bars per section). Use before a Suno /
//                                  ElevenLabs track exists, or for a fixed-length silent card.
//   Timing.fromAnalysis(json)    – output of scripts/analyze_audio.py for a real audio file.
//   song.timing (music/music.js) – exact timing of a synthesized song.
//
// Scenes and cues refer to time with expressions resolved by timing.at():
//   12.5            seconds
//   'chorus'        start of the first section named "chorus" (or "chorus1")
//   'chorus#2'      start of the 2nd chorus      'chorus#2.end'  its end   'bridge.mid'  its midpoint
//   'verse1+2bar'   two bars after verse1 starts 'outro-1b'  one beat before the outro
//   'end-3'         three seconds before the end 'start'

import { clamp } from './anim.js';

/**
 * Move `n` steps (may be fractional/negative) along a measured grid (beat or downbeat times),
 * starting from time t. Counting real bars keeps '+4bar' on the actual bar line even when a
 * human performance drifts from the average tempo. Extrapolates beyond the grid's ends.
 */
function stepGrid(grid, t, n) {
  const last = grid.length - 1;
  const lenAt = (i) => grid[Math.min(last, Math.max(1, i))] - grid[Math.min(last, Math.max(1, i)) - 1];
  // fractional grid position of t
  let pos;
  if (t <= grid[0]) pos = (t - grid[0]) / lenAt(1);
  else if (t >= grid[last]) pos = last + (t - grid[last]) / lenAt(last);
  else {
    let lo = 0, hi = last;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (grid[m] <= t) lo = m; else hi = m; }
    pos = lo + (t - grid[lo]) / (grid[hi] - grid[lo]);
  }
  // snap tiny residues so 'section+1bar' from a section that starts on a bar line lands exactly on the next one
  const r = Math.round(pos);
  if (Math.abs(pos - r) < 0.08) pos = r;
  const p = pos + n;
  if (p <= 0) return grid[0] + p * lenAt(1);
  if (p >= last) return grid[last] + (p - last) * lenAt(last);
  const k = Math.floor(p), f = p - k;
  return grid[k] + (grid[k + 1] - grid[k]) * f;
}

export class Timing {
  constructor({ duration, bpm = 120, meter = 4, offset = 0, beats = null, downbeats = null, sections = [], bands = null, climax = null } = {}) {
    this.duration = duration ?? (sections.length ? sections[sections.length - 1].end : 60);
    this.bpm = bpm;
    this.meter = meter; // beats per bar
    this.offset = offset; // time of the first downbeat (s)
    this.beats = beats && beats.length > 3 ? beats : null; // explicit beat times (from analysis)
    this.downbeats = downbeats && downbeats.length > 1 ? downbeats : null;
    this.sections = sections.map((s, i) => ({ index: i, ...s }));
    this.bands = bands; // { rate, bass:[], mid:[], treble:[], onset:[] } values 0..99
    this.climax = climax;
  }

  get spb() { return 60 / this.bpm; } // seconds per beat
  get spbar() { return this.spb * this.meter; }

  /** Build timing from a planned structure: sections as [name, bars] pairs (or {name, bars}). */
  static fromPlan({ bpm = 100, meter = 4, offset = 0, sections = [['all', 16]], tail = 0 } = {}) {
    const spbar = (60 / bpm) * meter;
    let t = offset;
    const out = sections.map((s) => {
      const [name, bars] = Array.isArray(s) ? s : [s.name, s.bars];
      const sec = { name, start: t, end: t + bars * spbar, bars };
      t = sec.end;
      return sec;
    });
    if (out.length) out[0].start = 0; // anything before the first downbeat belongs to the first section
    return new Timing({ duration: t + tail, bpm, meter, offset, sections: out });
  }

  static fromAnalysis(a) {
    return new Timing({
      duration: a.duration, bpm: a.bpm, meter: a.meter || 4, offset: a.offset ?? (a.downbeats?.[0] ?? 0),
      beats: a.beats, downbeats: a.downbeats, sections: a.sections || [], bands: a.bands || null, climax: a.climax ?? null,
    });
  }

  /** Beat info at time t: index, phase (0..1 through the beat), bar, beatInBar, barPhase. */
  beatAt(t) {
    let index, phase, time, next;
    if (this.beats) {
      const b = this.beats;
      if (t < b[0]) {
        const len = b[1] - b[0];
        const k = Math.floor((t - b[0]) / len);
        index = k; time = b[0] + k * len; next = time + len;
      } else if (t >= b[b.length - 1]) {
        const len = b[b.length - 1] - b[b.length - 2];
        const k = Math.floor((t - b[b.length - 1]) / len);
        index = b.length - 1 + k; time = b[b.length - 1] + k * len; next = time + len;
      } else {
        let lo = 0, hi = b.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m] <= t) lo = m; else hi = m; }
        index = lo; time = b[lo]; next = b[hi];
      }
      phase = clamp((t - time) / (next - time));
    } else {
      const x = (t - this.offset) / this.spb;
      index = Math.floor(x); phase = x - index;
      time = this.offset + index * this.spb; next = time + this.spb;
    }
    const firstDownIdx = this._firstDownbeatIndex();
    const rel = index - firstDownIdx;
    const bar = Math.floor(rel / this.meter);
    const beatInBar = ((rel % this.meter) + this.meter) % this.meter;
    return { index, phase, time, next, bar, beatInBar, barPhase: (beatInBar + phase) / this.meter, isDownbeat: beatInBar === 0 };
  }

  _firstDownbeatIndex() {
    if (this._fdi !== undefined) return this._fdi;
    if (this.beats && this.downbeats) {
      const d = this.downbeats[0];
      let best = 0, bestErr = Infinity;
      this.beats.forEach((b, i) => { const e = Math.abs(b - d); if (e < bestErr) { bestErr = e; best = i; } });
      this._fdi = best;
    } else if (this.beats) {
      const first = this.beats.findIndex((b) => b >= this.offset - 0.05);
      this._fdi = Math.max(0, first);
    } else this._fdi = 0;
    return this._fdi;
  }

  /** Current section object ({name, start, end, index}) or null. */
  section(t) {
    for (let i = this.sections.length - 1; i >= 0; i--) if (t >= this.sections[i].start) return this.sections[i];
    return this.sections[0] || null;
  }

  /**
   * Find a section by name. Exact match first; otherwise by base name, so with sections
   * [verse1, chorus1, verse2, chorus2] or [verse, chorus, verse, chorus] both 'chorus#2' and
   * 'chorus2' find the second chorus, and 'chorus' finds the first.
   */
  find(name, n = 1) {
    const exact = this.sections.filter((s) => s.name === name);
    if (exact.length >= n) return exact[n - 1];
    const base = (s) => String(s).replace(/\d+$/, '');
    const numbered = /^(.*?)(\d+)$/.exec(name);
    if (numbered && n === 1) {
      const list = this.sections.filter((s) => base(s.name) === numbered[1]);
      return list[parseInt(numbered[2], 10) - 1] || null;
    }
    return this.sections.filter((s) => base(s.name) === base(name))[n - 1] || null;
  }

  /** Resolve a time expression (see header) to seconds. */
  at(expr) {
    if (typeof expr === 'number') return expr;
    if (expr == null) return 0;
    const m = String(expr).trim().match(/^([a-z_]\w*)(?:#(\d+))?(?:\.(start|end|mid))?\s*((?:[+-]\s*[\d.]+\s*(?:bars?|b|s)?\s*)*)$/i);
    if (!m) {
      const n = Number(expr);
      if (!Number.isNaN(n)) return n;
      throw new Error(`timing.at: can't parse "${expr}"`);
    }
    const [, name, nth, edge, offs] = m;
    let t;
    if (name === 'start') t = 0;
    else if (name === 'end') t = this.duration;
    else if (name === 'climax' && this.climax != null && !this.find('climax')) t = this.climax;
    else {
      const s = this.find(name, nth ? parseInt(nth, 10) : 1);
      if (!s) throw new Error(`timing.at: no section "${name}${nth ? '#' + nth : ''}". Sections: ${this.sections.map((x) => x.name).join(', ') || '(none)'}`);
      t = edge === 'end' ? s.end : edge === 'mid' ? (s.start + s.end) / 2 : s.start;
    }
    for (const o of offs.matchAll(/([+-])\s*([\d.]+)\s*(bars?|b|s)?/g)) {
      const v = parseFloat(o[2]) * (o[1] === '-' ? -1 : 1);
      const unit = o[3] || 's';
      if (unit.startsWith('bar')) t = this.downbeats ? stepGrid(this.downbeats, t, v) : t + v * this.spbar;
      else if (unit === 'b') t = this.beats ? stepGrid(this.beats, t, v) : t + v * this.spb;
      else t += v;
    }
    return t;
  }

  /** Times of every beat (or every bar with unit='bar') in [from, to). Accepts expressions. */
  grid(from = 0, to = 'end', unit = 'beat') {
    const a = this.at(from), b = this.at(to);
    const out = [];
    const tol = Math.min(0.05, this.spb * 0.2); // real recordings put bar lines a hair either side of the math
    if (unit === 'bar' && this.downbeats) {
      for (const d of this.downbeats) if (d >= a - tol && d < b - tol) out.push(d);
      return out;
    }
    if (this.beats && unit === 'beat') {
      for (const x of this.beats) if (x >= a - tol && x < b - tol) out.push(x);
      return out;
    }
    const step = unit === 'bar' ? this.spbar : this.spb;
    let t = this.offset + Math.ceil((a - this.offset - 1e-3) / step) * step;
    for (; t < b - 1e-3; t += step) out.push(t);
    return out;
  }

  /** Snap a time to the nearest beat or bar line. */
  snap(t, unit = 'beat') {
    const g = this.grid(Math.max(0, t - this.spbar * 2), t + this.spbar * 2, unit);
    return g.length ? g.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best), g[0]) : t;
  }

  /** Pre-computed loudness at time t (0..1 each), or null when no bands are available. */
  bandsAt(t) {
    const B = this.bands;
    if (!B) return null;
    const x = t * B.rate;
    const i = Math.floor(x), f = x - i;
    const get = (arr) => {
      if (!arr || !arr.length) return 0;
      const a = arr[clamp(i, 0, arr.length - 1)], b = arr[clamp(i + 1, 0, arr.length - 1)];
      return (a + (b - a) * f) / 99;
    };
    return { bass: get(B.bass), mid: get(B.mid), treble: get(B.treble), onset: get(B.onset) };
  }

  toJSON() {
    return { duration: this.duration, bpm: this.bpm, meter: this.meter, offset: this.offset, sections: this.sections.map(({ name, start, end }) => ({ name, start: +start.toFixed(3), end: +end.toFixed(3) })) };
  }
}
