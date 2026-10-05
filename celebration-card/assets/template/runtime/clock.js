// Master clocks. The whole card reads one number every frame — the song position — from
// whichever clock is active. All clocks share this interface:
//
//   kind                'file' | 'synth' | 'silent'
//   load()              prepare (may resolve before media is fully buffered — never blocks on iOS)
//   unlock()            MUST be called synchronously inside a user gesture (tap/click/key)
//   play() → Promise    rejects if the browser blocks playback
//   pause(), seek(t)
//   time, duration, playing, ended
//   muted (get/set)
//   levels()            live {bass, mid, treble, level} 0..1, or null if not available

import { clamp } from './anim.js';

/** Tell iOS this page plays media, so the ring/silent switch doesn't mute Web Audio (Safari 16.4+). */
export function setPlaybackAudioSession() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
}

/** A wall-clock timeline with no sound: used when there is no audio, or while audio is blocked. */
export class SilentClock {
  constructor(duration = 60) {
    this.kind = 'silent';
    this.duration = duration;
    this._t = 0; this._playing = false; this._at = 0; this.muted = false;
  }
  async load() {}
  unlock() {}
  _sync() {
    if (!this._playing) return;
    const now = performance.now();
    this._t = Math.min(this.duration, this._t + (now - this._at) / 1000);
    this._at = now;
  }
  play() { this._sync(); if (this._t >= this.duration) this._t = 0; this._playing = true; this._at = performance.now(); return Promise.resolve(); }
  pause() { this._sync(); this._playing = false; }
  seek(t) { this._t = clamp(t, 0, this.duration); this._at = performance.now(); }
  get time() { this._sync(); return this._t; }
  get playing() { return this._playing && this._t < this.duration; }
  get ended() { return this._t >= this.duration; }
  levels() { return null; }
}

/**
 * Plays an audio file through a plain <audio> element (no Web Audio graph). This is the most
 * robust path everywhere: it plays with the iOS silent switch on, streams large files, and
 * never hits CORS restrictions. Audio-reactive visuals come from the pre-computed bands in
 * the analysis JSON (see timing.bandsAt) instead of a live analyser — which also makes them
 * deterministic for seeking and screenshots.
 */
export class FileClock {
  /**
   * preload: 'auto' (default) downloads songs up to 15 MB into memory while the gate is showing,
   * then plays from that copy: seeking works on any host (even ones without HTTP Range support)
   * and playback never stalls mid-song on a flaky connection. 'stream' plays straight from the URL.
   */
  constructor(src, { fallbackDuration = 60, preload = 'auto' } = {}) {
    this.kind = 'file';
    this.src = src;
    this.fallbackDuration = fallbackDuration;
    this.preloadMode = preload;
    const el = (this.el = new Audio());
    el.preload = preload === 'stream' ? 'auto' : 'metadata';
    // The element gets the in-memory copy (see _prefetch), not the URL: some hosts (Cloudflare Pages) answer range
    // requests with the whole file, and Safari won't seek in a URL that does (an iPhone froze replaying a song it had
    // streamed). The card's gate waits for the copy (inMemoryReady); the URL only streams when the copy can't be made
    // or isn't there yet at the tap, and then the copy takes over at the next seek (a replay).
    if (preload === 'stream' || typeof fetch !== 'function') el.src = src;
    this._ct = 0; this._ctAt = 0; this._t = 0; this._at = 0;
    this.missing = false;
    this.inMemory = false;
    // iOS Safari can report the song as ended in the middle of it: after it has played to the end, a seek back that
    // lands after play() leaves it "ended" where the seek put it. play() therefore waits for a pending seek to land
    // (see seek), and a stale end like that is played through once more.
    el.addEventListener('ended', () => {
      const d = this.duration;
      if (!this._wantPlay || this._staleRetry || !(Number.isFinite(d) && el.currentTime < d - 0.5)) return;
      this._staleRetry = true;
      const t = el.currentTime;
      this.seek(t);
      this._seekDone.then(() => el.play()).catch(() => {});
    });
    /** Resolves true once the song is in memory, false if it will stream instead. */
    this.inMemoryReady = new Promise((resolve) => { this._inMemoryDone = resolve; });
  }

  async _prefetch() {
    if (this._prefetching) return;
    this._prefetching = true;
    if (this.preloadMode === 'stream' || typeof fetch !== 'function') { this._inMemoryDone(false); return; }
    try {
      const head = await fetch(this.src, { method: 'HEAD' });
      const len = Number(head.headers.get('content-length')) || 0;
      if (!head.ok || len > 15e6) { this._inMemoryDone(false); this._stream(); return; }
      const r = await fetch(this.src);
      if (!r.ok) { this._inMemoryDone(false); this._stream(); return; }
      const url = URL.createObjectURL(await r.blob());
      // playback already began from the URL: the copy takes over at the next seek, while the song is stopped
      if (this._started) this._lateCopy = url;
      else this._useCopy(url, this._pendingT ?? this.el.currentTime);   // hold the position (e.g. a QA snapshot seeked while paused)
      this._inMemoryDone(!this._started);
    } catch { this._inMemoryDone(false); this._stream(); /* offline: stream instead */ }
  }

  /** Switch the element to the in-memory copy, holding the clock at t until it has loaded. */
  _useCopy(url, t) {
    this._blobUrl = url; this.inMemory = true;
    this._swapping = t;
    this.el.addEventListener('loadedmetadata', () => { const at = this._swapping; if (at) this.el.currentTime = at; this._swapping = null; }, { once: true });
    this.el.src = url;
    this.el.load();
  }

  /** Play straight from the URL (no in-memory copy). */
  _stream() {
    if (this.inMemory) return;
    this.el.preload = 'auto';
    if (this.el.getAttribute('src')) return;
    const t = this._pendingT;
    if (t) this.el.addEventListener('loadedmetadata', () => { this.el.currentTime = t; }, { once: true });
    this.el.src = this.src;
  }

  /** Resolves once metadata is known, or after a short timeout (iOS won't buffer before a tap). */
  load(timeoutMs = 3500) {
    this._prefetch();
    return new Promise((resolve) => {
      const el = this.el;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(this); } };
      if (el.readyState >= 1) return finish();
      el.addEventListener('loadedmetadata', finish, { once: true });
      el.addEventListener('error', () => { this.missing = true; finish(); }, { once: true });
      setTimeout(finish, timeoutMs);
    });
  }

  unlock() {
    setPlaybackAudioSession();
    this._started = true;
    if (!this.inMemory) this._stream();   // the copy isn't here yet: stream for now (it keeps downloading, for a replay)
    // Calling play() inside the gesture is what unlocks the element on iOS.
    const p = this.el.play();
    if (p && p.catch) p.catch(() => {});
    return p;
  }

  play() {
    this._started = true; this._wantPlay = true; this._staleRetry = false;
    if (!this.inMemory) this._stream();
    this._resetSmoothing();
    const seek = this._seekDone; this._seekDone = null;
    if (!seek) return this.el.play();
    // a seek is under way: play once it has landed (the element was unlocked by the first tap, so this may run later)
    return seek.then(() => { this._resetSmoothing(); return this.el.play(); });
  }
  pause() { this._wantPlay = false; this.el.pause(); }
  seek(t) {
    const d = this.duration;
    // streamed so far, with the copy now here and the song stopped (a replay): seek in the copy, not the URL
    if (this._lateCopy && (this.el.paused || this.el.ended)) {
      const url = this._lateCopy; this._lateCopy = null;
      this._seekDone = new Promise((resolve) => { this.el.addEventListener('seeked', resolve, { once: true }); setTimeout(resolve, 1500); });   // play once the copy is there
      this._useCopy(url, clamp(t, 0, Number.isFinite(d) ? Math.max(0, d - 0.01) : t)); this._resetSmoothing(); return;
    }
    if (!this.el.getAttribute('src')) this._pendingT = t;   // no source yet: applied when it arrives
    if (this._swapping != null) this._swapping = t;
    // resolves when this seek has landed ('seeked'), or after 800 ms if the element never says so (no source yet)
    const el = this.el;
    this._seekDone = new Promise((resolve) => {
      const done = () => { clearTimeout(timer); el.removeEventListener('seeked', done); resolve(); };
      const timer = setTimeout(done, 800);
      el.addEventListener('seeked', done);
    });
    el.currentTime = clamp(t, 0, Number.isFinite(d) ? Math.max(0, d - 0.01) : t);
    this._resetSmoothing();
  }
  _resetSmoothing() { const now = performance.now(); this._ct = this._t = this.el.currentTime; this._ctAt = this._at = now; }

  /** Song position, smoothed: <audio>.currentTime updates in coarse steps on some browsers. */
  get time() {
    if (this._swapping != null) return this._swapping;
    const el = this.el, now = performance.now();
    const ct = el.currentTime;
    if (el.paused || el.ended || el.readyState < 2) { this._ct = this._t = ct; this._ctAt = this._at = now; return ct; }
    if (ct !== this._ct) { this._ct = ct; this._ctAt = now; }
    const predicted = this._ct + Math.min(0.3, (now - this._ctAt) / 1000) * el.playbackRate;
    let t = this._t + ((now - this._at) / 1000) * el.playbackRate;
    const err = predicted - t;
    t = Math.abs(err) > 0.2 ? predicted : t + err * 0.12;
    this._t = t; this._at = now;
    return Math.max(0, t);
  }
  get duration() { const d = this.el.duration; return Number.isFinite(d) && d > 0 ? d : this.fallbackDuration; }
  get playing() { return !this.el.paused && !this.el.ended; }
  get ended() { return this.el.ended; }
  get muted() { return this.el.muted; }
  set muted(v) { this.el.muted = !!v; }
  /** Ducking (e.g. under a video message). iOS ignores element volume, so it pauses instead. */
  setVolume(v) { this.el.volume = clamp(v); }
  levels() { return null; }
}

/** HEAD-request an audio file so a missing song falls back to planned timing instead of silence-with-errors. */
export async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return r.ok;
  } catch { return false; }
}
