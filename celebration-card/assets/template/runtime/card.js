// Celebration card runtime: one clock, one render loop, a timeline of scenes, cues on the
// beat, a tap-to-open gate that unlocks audio, and a keepsake screen at the end.
//
// You normally don't edit this file. Compose a card in main.js:
//
//   const card = await createCard({
//     content,                                   // from content.js
//     audio: { src: 'assets/audio/song.mp3', analysis: 'assets/audio/analysis.json', plan },
//        or  { synth: () => import('./music/song.js') }
//        or  { plan }                            // silent, planned timing
//     scenes: [ { id: 'title', from: 'intro', to: 'verse1', scene: titleScene }, ... ],
//     cues:   [ { at: 'chorus', run: (ctx) => confetti.burst() },
//               { every: 'bar', from: 'chorus', to: 'chorus.end', run: (ctx, i) => ... } ],
//     systems: [ fxLayer, stage ],               // anything with update(ctx), run every frame
//   });
//
// Scene objects: { init(ctx, entry)?, enter(ctx, s)?, update(ctx, s)?, exit(ctx, s)? }
// where s = { t, p, dur, start, end, in(d), out(d), fade(din, dout) } is scene-local time.
//
// URL params for QA: ?debug  ?t=42 (start at 42s / 'chorus')  &freeze (hold that frame)
//                    ?quality=low|medium|high  ?reduced (reduced motion)  ?silent (no audio)

import { Timing } from './timing.js';
import { FileClock, SilentClock, exists, setPlaybackAudioSession } from './clock.js';
import { clamp } from './anim.js';

const $ = (sel) => (typeof sel === 'string' ? document.querySelector(sel) : sel);

class Emitter {
  constructor() { this._h = {}; }
  on(ev, fn) { (this._h[ev] ||= []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this._h[ev] = (this._h[ev] || []).filter((f) => f !== fn); }
  emit(ev, ...a) { for (const f of this._h[ev] || []) { try { f(...a); } catch (e) { console.error(e); } } }
}

export function detectQuality(override) {
  const tiers = {
    high: { name: 'high', dpr: Math.min(window.devicePixelRatio || 1, 2), particles: 1, bloom: true },
    medium: { name: 'medium', dpr: Math.min(window.devicePixelRatio || 1, 1.5), particles: 0.6, bloom: true },
    low: { name: 'low', dpr: 1, particles: 0.3, bloom: false },
  };
  if (override && tiers[override]) return { ...tiers[override], tiers, pinned: true }; // explicit = no auto-downgrade (deterministic QA)
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  let name = 'high';
  if (coarse || mem < 4 || cores < 4) name = 'medium';
  if (mem <= 2 || cores <= 2) name = 'low';
  return { ...tiers[name], tiers };
}

/** Read the card palette from CSS custom properties so CSS stays the single source of colour. */
export function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const accents = ['--c-accent', '--c-accent-2', '--c-accent-3', '--c-accent-4', '--c-accent-5'].map(v).filter(Boolean);
  return { bg: v('--c-bg') || '#111', ink: v('--c-ink') || '#fff', accents: accents.length ? accents : ['#ffd166', '#ef476f', '#06d6a0', '#118ab2'] };
}

export async function createCard(config = {}) {
  const {
    content = {}, audio = {}, scenes = [], cues = [], systems = [],
    gate: gateSel = '#gate', keepsake: keepsakeSel = '#keepsake', ui: uiSel = '#ui',
    gateMinMs = 400, gateMaxWaitMs = 6000, gateOutMs = 1400,
    onOpen = null, onEnd = null, onReplay = null,
  } = config;

  const params = new URLSearchParams(location.search);
  const card = new Emitter();
  const boot = { start: Math.round(performance.now()) };
  const mark = (k) => { boot[k] = Math.round(performance.now()); };
  const errors = [];
  addEventListener('error', (e) => errors.push(String(e.message || e)));
  addEventListener('unhandledrejection', (e) => errors.push(String(e.reason?.message || e.reason)));

  const quality = detectQuality(params.get('quality'));
  const reducedMotion = params.has('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  document.documentElement.dataset.quality = quality.name;

  // ---------------------------------------------------------------- audio + timing
  let audioClock = null;
  let timing = null;
  let song = null;
  if (audio.synth) {
    const mod = await audio.synth();
    song = mod.default || mod.song || mod;
    const { SynthClock } = await import('card/music/music.js');
    audioClock = new SynthClock(song);
    await audioClock.load();
    timing = audioClock.timing;
  } else if (audio.src) {
    const ok = await exists(audio.src);
    if (ok) {
      audioClock = new FileClock(audio.src);
      const analysis = audio.analysis ? await fetch(audio.analysis).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
      if (analysis) {
        timing = Timing.fromAnalysis(analysis);
        audioClock.fallbackDuration = timing.duration;
      }
      await audioClock.load();
      if (!timing) {
        if (audio.plan) console.warn('[card] No analysis JSON — using the planned timing. Run scripts/analyze_audio.py and re-sync.');
        else console.warn('[card] No analysis JSON — sections/beats unknown. Run scripts/analyze_audio.py.');
        timing = audio.plan ? Timing.fromPlan(audio.plan) : new Timing({ duration: audioClock.duration, sections: [{ name: 'all', start: 0, end: audioClock.duration }] });
      }
    } else {
      console.warn(`[card] Audio file "${audio.src}" not found — running silently on the planned timing.`);
    }
  }
  mark('audio');
  if (params.has('silent')) audioClock = null; // QA: keep the timing, drop the sound
  if (!timing) {
    timing = audio.plan instanceof Timing ? audio.plan : audio.plan ? Timing.fromPlan(audio.plan) : new Timing({ duration: audio.duration || 60, sections: [{ name: 'all', start: 0, end: audio.duration || 60 }] });
  }

  // The master clock hot-swaps to a silent clock if playback is blocked, so visuals never stall.
  const silent = new SilentClock(timing.duration);
  let active = audioClock || silent;
  let audioBlocked = false;
  const clock = {
    get time() { return active.time; },
    get duration() { return timing.duration; },
    get playing() { return active.playing; },
    get kind() { return active.kind; },
    get blocked() { return audioBlocked; },
    get muted() { return !!active.muted; },
    set muted(v) { if (audioClock) audioClock.muted = v; },
    unlock() { setPlaybackAudioSession(); if (audioClock) return audioClock.unlock(); },
    async play() {
      if (active === silent) return silent.play();
      try { await active.play(); audioBlocked = false; }
      catch (e) {
        console.warn('[card] Audio playback blocked — continuing silently until the viewer taps.', e?.name || e);
        const t = active.time; silent.seek(t); active = silent; audioBlocked = true; silent.play();
        card.emit('blocked');
      }
    },
    pause() { active.pause(); },
    seek(t) { active.seek(t); if (active !== silent) silent.seek(t); },
    /** Call inside a user gesture to switch from the silent fallback back to real audio. */
    restoreAudio() {
      if (!audioClock || !audioBlocked) return;
      const t = silent.time; silent.pause();
      audioClock.unlock();
      audioClock.seek(t); active = audioClock; audioBlocked = false;
      return clock.play();
    },
    levels() { return active.levels ? active.levels() : null; },
  };

  // ---------------------------------------------------------------- shared context
  const ctx = {
    card, content, timing, clock, song, quality, reducedMotion, params,
    palette: readPalette(),
    t: 0, dt: 0, wall: 0, frame: 0,
    beat: timing.beatAt(0), section: timing.section(0),
    levels: { bass: 0, mid: 0, treble: 0, onset: 0, level: 0, beat: 0 },
    layers: { bg: $('#bg'), gl: $('#gl'), dom: $('#stage'), fx: $('#fx'), ui: $(uiSel) },
    at: (e) => timing.at(e),
    track: null, // set below
  };
  Object.assign(ctx, config.ctx || {}); // shared objects for scenes (bg, fx, confetti, sfx…)

  // Asset loading progress for the gate.
  let total = 0, loaded = 0;
  const gateEl = $(gateSel);
  const setProgress = () => gateEl?.style.setProperty('--progress', total ? (loaded / total).toFixed(3) : '1');
  ctx.track = (promise) => { total++; setProgress(); return Promise.resolve(promise).finally(() => { loaded++; setProgress(); }); };

  // ---------------------------------------------------------------- scenes
  const entries = scenes.map((s, i) => ({ id: s.id || `scene${i}`, from: s.from ?? s.start ?? 0, to: s.to ?? s.end ?? 'end', scene: s.scene || s, active: false, failed: false, start: 0, end: 0, data: s.data }));
  const resolveEntries = () => {
    for (const e of entries) { e.start = timing.at(e.from); e.end = timing.at(e.to); }
  };
  resolveEntries();

  const localTime = (e, t) => {
    const dur = Math.max(1e-6, e.end - e.start);
    const lt = t - e.start;
    return {
      t: lt, p: clamp(lt / dur), dur, start: e.start, end: e.end,
      in: (d = 0.6) => clamp(lt / d),
      out: (d = 0.6) => clamp((dur - lt) / d),
      fade: (din = 0.6, dout = 0.6) => Math.min(clamp(lt / din), clamp((dur - lt) / dout)),
    };
  };
  const safe = (e, fn, ...args) => {
    if (e.failed || !fn) return;
    try { return fn.apply(e.scene, args); }
    catch (err) { e.failed = true; errors.push(`[${e.id}] ${err.message}`); console.error(`[card] scene "${e.id}" failed and was disabled:`, err); }
  };

  // ---------------------------------------------------------------- cues
  const cueTimes = [];
  const buildCues = () => {
    cueTimes.length = 0;
    cues.forEach((c, ci) => {
      // offset shifts a cue, e.g. '-1b' so a firework launched a beat early bursts on the downbeat
      const off = c.offset == null ? 0 : typeof c.offset === 'number' ? c.offset : timing.at(`start${c.offset}`);
      if (c.every) {
        const unit = c.every === 'bar' ? 'bar' : 'beat';
        let grid = timing.grid(c.from ?? 0, c.to ?? 'end', unit);
        if (c.skip) grid = grid.filter((_, i) => i % (c.skip + 1) === 0);
        grid.forEach((time, i) => cueTimes.push({ time: time + off, cue: c, i, key: `${ci}:${i}` }));
      } else {
        cueTimes.push({ time: timing.at(c.at) + off, cue: c, i: 0, key: `${ci}` });
      }
    });
    cueTimes.sort((a, b) => a.time - b.time);
  };
  buildCues();

  const systemList = [];
  const addSystem = (sys, order = 0) => { systemList.push({ sys, order }); systemList.sort((a, b) => a.order - b.order); return sys; };
  systems.forEach((s, i) => addSystem(s, s.order ?? i));

  // Initialise scenes (build DOM / 3D objects, load textures). Gate waits for this, with a cap.
  const initAll = Promise.all(entries.map((e) => ctx.track(Promise.resolve().then(() => safe(e, e.scene.init, ctx, e))).then(() => mark(`init:${e.id}`))));
  const fontsReady = (document.fonts?.ready ?? Promise.resolve()).then(() => mark('fonts'));

  // ---------------------------------------------------------------- state + controls
  const startParam = params.get('t');
  const freeze = params.has('freeze');
  // Frozen = render a few settle frames after each seek, then idle so screenshots are exact.
  let frozen = freeze, settle = 0, onSettled = null;
  let started = false, opened = false, ended = false, paused = false;
  let prevT = 0, lastBeat = -1, lastBar = -1, lastSection = null;
  let jumped = true; // set by seeks/starts so cues never fire for skipped-over time
  const keepsakeEl = $(keepsakeSel);
  const uiEl = $(uiSel);

  const showKeepsake = (on) => {
    if (!keepsakeEl) return;
    keepsakeEl.hidden = !on;
    requestAnimationFrame(() => keepsakeEl.classList.toggle('is-visible', on));
    document.documentElement.classList.toggle('is-ended', on);
  };

  const start = async (atTime = 0) => {
    started = true; ended = false; paused = false;
    clock.seek(atTime); prevT = atTime; jumped = true;
    document.documentElement.classList.add('is-playing');
    await clock.play();
  };

  const open = () => {
    if (opened) return;
    opened = true;
    clock.unlock(); // synchronous, inside the gesture
    card.emit('unlock');
    gateEl?.classList.remove('is-ready');
    gateEl?.classList.add('is-opening');
    document.documentElement.classList.add('is-open');
    try { onOpen?.(ctx, gateEl); } catch (e) { console.error(e); }
    card.emit('open', ctx);
    start(0);
    setTimeout(() => { gateEl?.classList.add('is-gone'); if (gateEl) gateEl.hidden = true; }, gateOutMs);
  };

  const end = () => {
    if (ended) return;
    ended = true;
    document.documentElement.classList.remove('is-playing');
    showKeepsake(true);
    try { onEnd?.(ctx); } catch (e) { console.error(e); }
    card.emit('end', ctx);
  };

  const replay = () => {
    showKeepsake(false);
    for (const e of entries) if (e.active) { e.active = false; safe(e, e.scene.exit, ctx, localTime(e, ctx.t)); }
    try { onReplay?.(ctx); } catch (e) { console.error(e); }
    card.emit('replay', ctx);
    start(0);
  };

  const hideGate = () => {
    opened = true;
    if (gateEl) { gateEl.hidden = true; gateEl.classList.add('is-gone'); }
    document.documentElement.classList.add('is-open');
  };

  /** Jump to a time or expression. Before the card is opened this skips the gate (paused). */
  const seek = (t) => {
    const time = clamp(typeof t === 'number' ? t : timing.at(t), 0, timing.duration);
    if (!started) { hideGate(); started = true; paused = true; document.documentElement.classList.add('is-playing'); }
    if (ended && time < timing.duration - 0.05) { ended = false; showKeepsake(false); document.documentElement.classList.add('is-playing'); }
    clock.seek(time);
    prevT = time; // cues don't fire on jumps
    jumped = true;
    lastBeat = lastBar = -1;
    settle = 12;
  };

  /** QA: jump to t (seconds or expression), render, then hold that exact frame. Resolves when settled. */
  const snap = (t) => new Promise((resolve) => {
    frozen = true; paused = true; clock.pause();
    onSettled = resolve;
    seek(t);
  });

  // UI buttons
  uiEl?.querySelector('[data-mute]')?.addEventListener('click', (ev) => {
    clock.muted = !clock.muted;
    ev.currentTarget.setAttribute('aria-pressed', String(clock.muted));
    card.emit('mute', clock.muted);
  });
  const resumeBtn = uiEl?.querySelector('[data-resume]');
  card.on('blocked', () => { if (resumeBtn) resumeBtn.hidden = false; });
  resumeBtn?.addEventListener('click', () => { resumeBtn.hidden = true; clock.restoreAudio(); });
  document.querySelectorAll('[data-replay]').forEach((b) => b.addEventListener('click', replay));

  // Pause when the tab is hidden; resume when it's back (or ask for a tap if the browser refuses).
  let wasPlaying = false;
  document.addEventListener('visibilitychange', () => {
    if (!started || ended || frozen) return;
    if (document.hidden) { wasPlaying = !paused; clock.pause(); }
    else if (wasPlaying) clock.play();
  });

  // ---------------------------------------------------------------- main loop
  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0, slowWindows = 0;

  const frame = (now) => {
    requestAnimationFrame(frame);
    if (frozen && settle <= 0) { last = now; if (onSettled) { onSettled(card.state()); onSettled = null; } return; }
    if (frozen) settle--;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    ctx.dt = dt; ctx.wall += dt; ctx.frame++;

    const t = started ? Math.min(clock.time, timing.duration) : 0;
    ctx.t = t;
    ctx.beat = timing.beatAt(t);
    ctx.section = timing.section(t);

    // audio levels: live analyser (synth) > pre-computed bands (file) > beat pulse
    const live = started ? clock.levels() : null;
    const pre = !live ? timing.bandsAt(t) : null;
    const src = live || pre;
    const L = ctx.levels;
    const beatPulse = Math.exp(-ctx.beat.phase * 5);
    const k = 1 - Math.exp(-dt * 18);
    if (src) {
      L.bass += (src.bass - L.bass) * k;
      L.mid += (src.mid - L.mid) * k;
      L.treble += (src.treble - L.treble) * k;
      L.onset = src.onset ?? L.onset;
    } else {
      const target = started && clock.playing ? 0.35 + 0.4 * beatPulse : 0;
      L.bass += (target - L.bass) * k; L.mid += (target * 0.8 - L.mid) * k; L.treble += (target * 0.6 - L.treble) * k;
    }
    L.level = (L.bass + L.mid + L.treble) / 3;
    L.beat = started ? beatPulse : 0;

    // scenes
    for (const e of entries) {
      const isLast = e.end >= timing.duration - 1e-3;
      const on = started && t >= e.start && (t < e.end || (isLast && t >= e.end));
      if (on && !e.active) { e.active = true; safe(e, e.scene.enter, ctx, localTime(e, t)); card.emit('scene', e.id); }
      if (!on && e.active) { e.active = false; safe(e, e.scene.exit, ctx, localTime(e, t)); }
      if (e.active) safe(e, e.scene.update, ctx, localTime(e, t));
    }

    // cues + musical events: on forward playback only (never for time skipped by a seek). After a
    // stall (slow phone, GC pause) late cues still fire, but nothing older than 1.5 s piles up.
    if (started && t > prevT && !jumped) {
      const from = Math.max(prevT, t - 1.5);
      for (const c of cueTimes) {
        if (c.time > from && c.time <= t) {
          try { c.cue.run(ctx, c.i); } catch (err) { errors.push(`[cue ${c.key}] ${err.message}`); console.error(err); }
        }
      }
      if (ctx.beat.index !== lastBeat) { card.emit('beat', ctx.beat, ctx); if (ctx.beat.isDownbeat) card.emit('bar', ctx.beat, ctx); }
    }
    jumped = false;
    if (ctx.section && ctx.section !== lastSection) { card.emit('section', ctx.section, ctx); lastSection = ctx.section; }
    lastBeat = ctx.beat.index; lastBar = ctx.beat.bar;
    prevT = t;

    for (const { sys } of systemList) { try { sys.update(ctx); } catch (err) { errors.push(String(err.message)); console.error(err); } }

    if (started && !ended && !frozen && (t >= timing.duration - 0.02 || (active === audioClock && audioClock?.ended))) end();

    // Performance watchdog: step quality down if we're consistently slow.
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 2) {
      ctx.fps = fpsFrames / fpsAcc;
      if (started && ctx.fps < 38 && quality.name !== 'low' && !quality.pinned) {
        if (++slowWindows >= 2) {
          const next = quality.name === 'high' ? 'medium' : 'low';
          Object.assign(quality, quality.tiers[next]);
          document.documentElement.dataset.quality = next;
          card.emit('quality', quality);
          slowWindows = 0;
        }
      } else slowWindows = 0;
      fpsAcc = 0; fpsFrames = 0;
    }
  };

  // ---------------------------------------------------------------- public API
  Object.assign(card, {
    ctx, timing, clock, seek, replay, open, addSystem,
    snap,
    play: () => { frozen = false; if (!started) { hideGate(); return start(clock.time); } paused = false; return clock.play(); },
    pause: () => { paused = true; clock.pause(); },
    get entries() { return entries; },
    state: () => ({
      t: +ctx.t.toFixed(3), duration: timing.duration, started, opened, ended, paused,
      playing: clock.playing, clock: clock.kind, audioBlocked: clock.blocked, muted: clock.muted,
      section: ctx.section?.name, scenes: entries.filter((e) => e.active).map((e) => e.id),
      failedScenes: entries.filter((e) => e.failed).map((e) => e.id),
      quality: quality.name, fps: ctx.fps ? +ctx.fps.toFixed(1) : null, errors: [...errors], boot,
    }),
    errors,
  });
  window.card = card;

  // ---------------------------------------------------------------- boot
  await Promise.race([Promise.all([initAll, fontsReady]), new Promise((r) => setTimeout(r, gateMaxWaitMs))]);
  mark('ready');
  await new Promise((r) => setTimeout(r, gateMinMs));
  requestAnimationFrame(frame);
  if (params.has('debug')) import('./debug.js').then((m) => m.installDebug(card)).catch((e) => console.error(e));

  if (startParam != null) {
    // QA shortcut: skip the gate and start at a time/expression. Audio may be blocked without a
    // gesture; the silent fallback keeps visuals running.
    hideGate();
    const t0 = isNaN(Number(startParam)) ? timing.at(startParam) : Number(startParam);
    if (freeze) snap(t0);
    else start(t0);
  } else if (gateEl) {
    gateEl.classList.remove('is-loading');
    gateEl.classList.add('is-ready');
    const btn = gateEl.querySelector('[data-open]') || gateEl;
    btn.disabled = false;
    gateEl.addEventListener('click', open); // the whole gate is the tap target; the button is for keyboards
    gateEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    if (btn.focus) btn.focus({ preventScroll: true });
    card.emit('ready', ctx);
  } else {
    opened = true; start(0);
  }
  return card;
}
