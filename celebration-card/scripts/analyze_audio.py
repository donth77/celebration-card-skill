#!/usr/bin/env python3
"""Analyze a song so a celebration card can sync to it.

Finds tempo, beats, bar lines, section boundaries (with guessed names), the climax, an energy
curve, and per-frame loudness bands (bass/mid/treble/onset) that drive audio-reactive visuals
deterministically. Writes JSON the card runtime loads (audio: { analysis: '...' }) and prints a
readable timeline so you can check and rename sections.

Usage
  python3 analyze_audio.py song.mp3 --out card/assets/audio/analysis.json [--bpm 96] [--meter 4]
  # once you know what the sections really are (listening, lyrics timestamps, the user):
  python3 analyze_audio.py song.mp3 --out ... --names intro,verse1,chorus1,verse2,chorus2,bridge,chorus3,outro
  python3 analyze_audio.py song.mp3 --out ... --sections "0:intro,12.4:verse1,41.9:chorus1,71.2:verse2"

--bpm is a hint (e.g. the BPM you put in the Suno prompt); the measured tempo is reported.
Needs numpy + ffmpeg (or macOS afconvert, or a .wav input). Uses librosa for beats if present.
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 22050
N_FFT = 2048
HOP = 512
FR = SR / HOP  # frames per second


# ------------------------------------------------------------------ decoding
def load_audio(path):
    path = Path(path)
    if shutil.which("ffmpeg"):
        r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
        if r.returncode == 0 and r.stdout:
            return np.frombuffer(r.stdout, dtype=np.float32).copy()
    wav = path
    with tempfile.TemporaryDirectory() as tmp:  # holds the converted WAV; removed as soon as it has been read
        if path.suffix.lower() != ".wav":
            if not shutil.which("afconvert"):
                sys.exit("Need ffmpeg (or macOS afconvert) to decode this file. Install ffmpeg (Homebrew or apt) and run this again.")
            wav = Path(tmp) / "a.wav"
            subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEI16@{SR}", "-c", "1", str(path), str(wav)], check=True)
        with wave.open(str(wav)) as w:
            n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
            raw = w.readframes(n)
    dt = {1: np.int8, 2: np.int16, 4: np.int32}[sw]
    y = np.frombuffer(raw, dtype=dt).astype(np.float32) / float(np.iinfo(dt).max)
    if ch > 1:
        y = y.reshape(-1, ch).mean(axis=1)
    if sr != SR:
        idx = np.arange(0, len(y), sr / SR)
        y = np.interp(idx, np.arange(len(y)), y).astype(np.float32)
    return y


# ------------------------------------------------------------------ features
def stft_mag(y):
    pad = N_FFT // 2
    y = np.pad(y, (pad, pad), mode="reflect")
    n = 1 + (len(y) - N_FFT) // HOP
    win = np.hanning(N_FFT).astype(np.float32)
    out = np.empty((n, N_FFT // 2 + 1), dtype=np.float32)
    for s in range(0, n, 2048):  # chunked to keep memory low
        e = min(n, s + 2048)
        idx = np.arange(N_FFT)[None, :] + HOP * np.arange(s, e)[:, None]
        out[s:e] = np.abs(np.fft.rfft(y[idx] * win, axis=1))
    return out


def mel_filterbank(n_mels=64, fmin=30.0, fmax=8000.0):
    def hz2mel(f): return 2595 * np.log10(1 + f / 700)
    def mel2hz(m): return 700 * (10 ** (m / 2595) - 1)
    freqs = np.linspace(0, SR / 2, N_FFT // 2 + 1)
    pts = mel2hz(np.linspace(hz2mel(fmin), hz2mel(fmax), n_mels + 2))
    fb = np.zeros((n_mels, len(freqs)), dtype=np.float32)
    for i in range(n_mels):
        lo, c, hi = pts[i], pts[i + 1], pts[i + 2]
        fb[i] = np.clip(np.minimum((freqs - lo) / (c - lo + 1e-9), (hi - freqs) / (hi - c + 1e-9)), 0, None)
    return fb, pts[1:-1]


def chroma_from_stft(S):
    freqs = np.linspace(0, SR / 2, S.shape[1])
    ok = (freqs >= 55) & (freqs <= 2000)
    pcs = (np.round(12 * np.log2(freqs[ok] / 440.0) + 69).astype(int)) % 12
    C = np.zeros((S.shape[0], 12), dtype=np.float32)
    P = S[:, ok] ** 2
    for pc in range(12):
        C[:, pc] = P[:, pcs == pc].sum(axis=1)
    return C / (C.sum(axis=1, keepdims=True) + 1e-9)


def smooth(x, n):
    if n <= 1:
        return x
    k = np.ones(int(n)) / int(n)
    return np.convolve(x, k, mode="same")


def onset_envelope(logmel, bands=None):
    L = logmel if bands is None else logmel[:, bands]
    d = np.diff(L, axis=0, prepend=L[:1])
    o = np.maximum(0, d).mean(axis=1)
    o = o - smooth(o, int(FR * 0.5))
    o = np.maximum(0, o)
    return o / (o.std() + 1e-9)


# ------------------------------------------------------------------ tempo + beats
def estimate_tempo(o, hint=None):
    lags = np.arange(int(FR * 60 / 220), int(FR * 60 / 45) + 1)
    oc = o - o.mean()
    ac = np.array([np.dot(oc[:-l], oc[l:]) / (len(oc) - l) for l in lags])
    bpms = 60 * FR / lags
    if hint:
        prior = np.exp(-0.5 * (np.log2(bpms / hint) / 0.12) ** 2) + 0.15 * np.exp(-0.5 * (np.log2(bpms / hint) / 1.0) ** 2)
    else:
        prior = np.exp(-0.5 * (np.log2(bpms / 115.0) / 0.9) ** 2)
    score = np.maximum(ac, 0) * prior
    i = int(np.argmax(score))
    if 0 < i < len(score) - 1:  # parabolic refinement on the lag
        a, b, c = score[i - 1], score[i], score[i + 1]
        off = 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
        lag = lags[i] + np.clip(off, -0.5, 0.5)
    else:
        lag = lags[i]
    bpm = float(60 * FR / lag)
    if hint:
        return bpm
    # Octave check: waltzes and swung songs often lock onto ½× or ⅔× the real beat. Prefer a
    # related tempo in the comfortable 72–170 range when its periodicity is nearly as strong.
    def strength(b):
        L = 60 * FR / b
        if L < lags[0] or L > lags[-1]:
            return -1.0
        j = int(round(L)) - lags[0]
        return float(np.max(np.maximum(ac[max(0, j - 1): j + 2], 0)))
    # Only correct tempos outside the comfortable range; inside it, half/double is a matter of feel.
    if 72 <= bpm <= 170:
        return bpm
    base = strength(bpm)
    factors = (2.0, 1.5) if bpm < 72 else (0.5, 2 / 3)
    cands = [(strength(bpm * f), bpm * f) for f in factors if 72 <= bpm * f <= 170]
    cands = [c for c in cands if c[0] >= 0.65 * base]
    return max(cands)[1] if cands else bpm


def track_beats(o, bpm, tightness=100.0):
    period = FR * 60 / bpm
    g = np.exp(-0.5 * (np.arange(-int(period), int(period) + 1) / (period / 32)) ** 2)
    local = np.convolve(o, g / g.sum(), mode="same")
    window = np.arange(-int(round(2 * period)), -int(round(period / 2)) + 1)
    txcost = -tightness * np.log(-window / period) ** 2
    T = len(o)
    cum = np.zeros(T)
    back = np.full(T, -1, dtype=int)
    for i in range(T):
        lo, hi = i + window[0], i + window[-1]
        if hi < 0:
            cum[i] = local[i]
            continue
        s = max(0, lo)
        cand = cum[s:hi + 1] + txcost[s - lo:]
        k = int(np.argmax(cand))
        cum[i] = local[i] + cand[k]
        back[i] = s + k
    # last beat: last local max of the cumulative score that is reasonably strong
    maxes = (cum[1:-1] > cum[:-2]) & (cum[1:-1] >= cum[2:])
    idx = np.where(maxes)[0] + 1
    med = np.median(cum[idx]) if len(idx) else 0
    strong = idx[cum[idx] > 0.5 * med] if len(idx) else np.array([T - 1])
    b = int(strong.max()) if len(strong) else T - 1
    beats = []
    while b >= 0:
        beats.append(b)
        b = back[b]
    beats = np.array(beats[::-1])
    # trim weak beats at the edges (silence / fades)
    th = 0.25 * np.sqrt(np.mean(local ** 2))
    strong_b = np.where(local[beats] > th)[0]
    if len(strong_b):
        beats = beats[strong_b[0]: strong_b[-1] + 1]
    return beats / FR


# ------------------------------------------------------------------ structure
def beat_sync(features, beat_frames, T):
    edges = np.concatenate([beat_frames, [T]]).astype(int)
    out = []
    for a, b in zip(edges[:-1], edges[1:]):
        b = max(b, a + 1)
        out.append(features[a:b].mean(axis=0))
    return np.array(out)


def novelty_curve(F, L):
    Fn = (F - F.mean(0)) / (F.std(0) + 1e-9)
    Fn = Fn / (np.linalg.norm(Fn, axis=1, keepdims=True) + 1e-9)
    S = Fn @ Fn.T
    x = np.arange(-L, L) + 0.5
    taper = np.exp(-0.5 * (x / (L * 0.6)) ** 2)
    K = np.outer(np.sign(x) * taper, np.sign(x) * taper)
    N = len(S)
    Sp = np.pad(S, L, mode="edge")
    nov = np.array([(Sp[i:i + 2 * L, i:i + 2 * L] * K).sum() for i in range(N)])
    nov = np.maximum(0, nov)  # high where past and future are each self-similar but differ from each other
    return nov / (nov.max() + 1e-9), S


def find_boundaries(F, rms_beats, downbeat_idx, beats_t, duration):
    """Section boundaries from bar-level features: a 4-bar checkerboard kernel compares the
    4 bars before each bar line with the 4 after, so chord changes inside a repeating progression
    don't register but a new section does. Phrase lines (every 4/8 bars) get a small bonus."""
    if len(downbeat_idx) < 6:
        return []
    bar_edges = list(downbeat_idx) + [len(F)]
    bars = np.array([F[a:max(b, a + 1)].mean(0) for a, b in zip(bar_edges[:-1], bar_edges[1:])])
    bar_rms = np.array([rms_beats[a:max(b, a + 1)].mean() for a, b in zip(bar_edges[:-1], bar_edges[1:])])
    Fb = np.hstack([bars, (bar_rms / (bar_rms.max() + 1e-9))[:, None] * 4])
    nb = len(Fb)
    L = 4 if nb >= 20 else 2
    nov, _ = novelty_curve(Fb, L)
    lift = np.abs(np.diff(np.r_[bar_rms[0], bar_rms])) / (bar_rms.max() + 1e-9)  # loudness steps
    score = nov + 0.6 * lift
    for k in range(nb):
        score[k] += 0.12 * (k % 8 == 0) + 0.08 * (k % 4 == 0)
    th = score.mean() + 0.6 * score.std()
    cands = [k for k in range(2, nb - 1) if score[k] >= score[k - 1] and score[k] >= score[k + 1] and score[k] > th]
    cands.sort(key=lambda k: -score[k])
    max_secs = max(3, int(duration / 14))
    chosen = []
    for k in cands:
        if len(chosen) >= max_secs - 1:
            break
        if all(abs(k - c) >= 4 for c in chosen):
            chosen.append(k)
    chosen.sort()
    return [float(beats_t[downbeat_idx[k]]) for k in chosen if downbeat_idx[k] < len(beats_t)]


def pick_boundaries(nov, beats_t, downbeat_idx, meter, duration, min_len=6.0):
    N = len(nov)
    bar_beats = set(downbeat_idx.tolist())
    phrase_bonus = np.zeros(N)
    for k, j in enumerate(downbeat_idx):
        if j < N and k % 4 == 0:
            phrase_bonus[j] = 0.08  # 4-bar phrase lines are likelier boundaries
    score = nov + phrase_bonus
    th = score.mean() + 0.5 * score.std()
    cands = [j for j in range(1, N - 1) if score[j] >= score[j - 1] and score[j] >= score[j + 1] and score[j] > th]
    cands.sort(key=lambda j: -score[j])
    chosen = []
    for j in cands:
        # snap to nearest bar line
        jb = min(bar_beats, key=lambda d: abs(d - j)) if bar_beats else j
        t = beats_t[min(jb, len(beats_t) - 1)]
        if t < min_len * 0.6 or duration - t < min_len * 0.6:
            continue
        if all(abs(t - c) >= min_len for c in chosen):
            chosen.append(t)
    return sorted(chosen)


def label_sections(secs, F_beats, beats_t, rms_beats):
    feats, energies = [], []
    for s in secs:
        m = (beats_t >= s["start"]) & (beats_t < s["end"])
        f = F_beats[m] if m.any() else F_beats[:1]
        feats.append(f.mean(0))
        energies.append(float(rms_beats[m].mean()) if m.any() else 0.0)
    feats = np.array(feats)
    Fn = (feats - feats.mean(0)) / (feats.std(0) + 1e-9)
    Fn = Fn / (np.linalg.norm(Fn, axis=1, keepdims=True) + 1e-9)
    sim = Fn @ Fn.T
    n = len(secs)
    iu = np.triu_indices(n, 1)
    th = sim[iu].mean() + 0.5 * sim[iu].std() if n > 2 else 0.9
    parent = list(range(n))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for i, j in zip(*iu):
        if sim[i, j] > max(th, 0.3):
            parent[find(i)] = find(j)
    roots, labels = {}, []
    for i in range(n):
        r = find(i)
        roots.setdefault(r, chr(ord("A") + len(roots)))
        labels.append(roots[r])
    e = np.array(energies)
    e_norm = e / (e.max() + 1e-9)
    for s, lab, en in zip(secs, labels, e_norm):
        s["label"], s["energy"] = lab, round(float(en), 3)

    # name guesses
    med = float(np.median(e_norm))
    counts = {lab: labels.count(lab) for lab in set(labels)}
    label_energy = {lab: np.mean([en for l2, en in zip(labels, e_norm) if l2 == lab]) for lab in counts}
    repeated = [lab for lab in counts if counts[lab] >= 2]
    chorus = max(repeated, key=lambda l: label_energy[l]) if repeated else None
    if chorus and counts[chorus] > 0.6 * n and n > 4:
        chorus = None  # one label everywhere = no contrast to tell verse from chorus; don't pretend
    names = []
    for i, s in enumerate(secs):
        lab, en, dur = s["label"], s["energy"], s["end"] - s["start"]
        if i == 0 and (en < med * 0.85 or dur < 20) and n > 2:
            nm = "intro"
        elif i == n - 1 and (en < med or dur < 16) and n > 2:
            nm = "outro"
        elif lab == chorus:
            nm = "chorus"
        elif counts[lab] >= 2 and chorus:
            nm = "verse"
        elif chorus and i > labels.index(chorus) and i < n - 1:
            nm = "bridge"
        else:
            nm = "part"
        names.append(nm)
    total = {nm: names.count(nm) for nm in names}
    seen = {}
    for s, nm in zip(secs, names):
        if nm in ("intro", "outro") or (total[nm] == 1 and nm in ("bridge", "part")):
            s["name"] = nm
            continue
        seen[nm] = seen.get(nm, 0) + 1
        s["name"] = f"{nm}{seen[nm]}"
    return secs


# ------------------------------------------------------------------ main
def fmt(t):
    return f"{int(t // 60)}:{t % 60:05.2f}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--out", required=True)
    ap.add_argument("--bpm", type=float, help="tempo hint (e.g. from the Suno prompt)")
    ap.add_argument("--meter", default="auto", help="beats per bar: auto (3 vs 4 from the accent pattern), or 2 (cut time: marches, fox-trots, polkas), 3 (waltz), 4, 6")
    ap.add_argument("--rate", type=int, default=30, help="loudness band frames per second")
    ap.add_argument("--names", help="comma-separated names to assign to the detected sections, in order")
    ap.add_argument("--sections", help='manual boundaries "0:intro,12.4:verse1,…" (overrides detection)')
    args = ap.parse_args()

    y = load_audio(args.audio)
    duration = len(y) / SR
    if duration < 3:
        sys.exit("Audio is shorter than 3 seconds.")
    S = stft_mag(y)
    T = S.shape[0]
    fb, centers = mel_filterbank()
    mel = (S ** 2) @ fb.T
    logmel = 10 * np.log10(mel + 1e-10)
    o = onset_envelope(logmel)
    o_bass = onset_envelope(logmel, np.where(centers < 200)[0])
    rms = np.sqrt((S ** 2).mean(axis=1))

    # tempo + beats (librosa if available — it is very good at this)
    beats_t = None
    try:
        import librosa  # type: ignore
        tempo, bf = librosa.beat.beat_track(y=y, sr=SR, hop_length=HOP, start_bpm=args.bpm or 120, units="frames")
        bpm = float(np.atleast_1d(tempo)[0])
        beats_t = np.asarray(bf) / FR
        engine = "librosa"
    except Exception:
        bpm = estimate_tempo(o, args.bpm)
        beats_t = track_beats(o, bpm)
        # refine: fit a straight line through the first-pass beats (robust average period), re-track
        if len(beats_t) > 16:
            idx = np.arange(len(beats_t))
            keep = slice(len(idx) // 10, len(idx) - len(idx) // 10)
            period = np.polyfit(idx[keep], beats_t[keep], 1)[0]
            if 0.25 < period < 1.5:
                bpm = 60 / period
                beats_t = track_beats(o, bpm)
        engine = "numpy"
    if len(beats_t) > 16:
        bpm = float(60 / np.polyfit(np.arange(len(beats_t)), beats_t, 1)[0])
    beat_frames = np.clip(np.round(beats_t * FR).astype(int), 0, T - 1)

    # downbeats: phase with the strongest bass onsets + harmonic changes
    C = chroma_from_stft(S)
    Cb = beat_sync(C, beat_frames, T)
    harm = np.r_[0, 1 - (Cb[1:] * Cb[:-1]).sum(1) / (np.linalg.norm(Cb[1:], axis=1) * np.linalg.norm(Cb[:-1], axis=1) + 1e-9)]
    bass_at = smooth(o_bass, 3)[beat_frames]
    accent = bass_at / (bass_at.std() + 1e-9) + harm / (harm.std() + 1e-9)
    meter_note = ""
    if str(args.meter).lower() == "auto":
        # Bars repeat their accent pattern: correlate the per-beat accents at lags 3/6 vs 4/8.
        a = (accent - accent.mean()) / (accent.std() + 1e-9)
        r = lambda L: float(np.mean(a[:-L] * a[L:])) if len(a) > L + 8 else 0.0
        s3, s4 = (r(3) + r(6)) / 2, (r(4) + r(8)) / 2
        m = 3 if s3 > s4 + 0.04 else 4
        meter_note = f" (auto: 3-beat evidence {s3:.2f} vs 4-beat {s4:.2f}; use --meter 2 for cut time)"
    else:
        m = int(args.meter)
    phase_scores = [float(np.mean(accent[k::m])) for k in range(m)]
    phase = int(np.argmax(phase_scores))
    downbeat_idx = np.arange(phase, len(beats_t), m)
    downbeats = beats_t[downbeat_idx]

    # beat-synchronous features → novelty → sections
    mel16 = logmel.reshape(T, 16, -1).mean(axis=2)
    feats = np.hstack([C * 2, (mel16 - mel16.mean()) / (mel16.std() + 1e-9), (rms / (rms.max() + 1e-9))[:, None] * 3])
    F = beat_sync(feats, beat_frames, T)
    rms_beats = beat_sync(rms[:, None], beat_frames, T)[:, 0]

    if args.sections:
        pts = []
        for part in args.sections.split(","):
            t, _, name = part.strip().partition(":")
            pts.append((float(t), name.strip() or f"part{len(pts) + 1}"))
        pts.sort()
        secs = [{"name": nm, "start": t, "end": (pts[i + 1][0] if i + 1 < len(pts) else duration)} for i, (t, nm) in enumerate(pts)]
        secs[0]["start"] = 0.0
        for s in secs:
            mm = (beats_t >= s["start"]) & (beats_t < s["end"])
            s["energy"] = float(rms_beats[mm].mean()) if mm.any() else 0.0
            s["label"] = "-"
        mx = max(s["energy"] for s in secs) or 1
        for s in secs:
            s["energy"] = round(s["energy"] / mx, 3)
        source = "manual"
    else:
        bounds = find_boundaries(F, rms_beats, downbeat_idx, beats_t, duration)
        edges = [0.0] + bounds + [duration]
        secs = [{"start": a, "end": b} for a, b in zip(edges[:-1], edges[1:])]
        secs = label_sections(secs, F, beats_t, rms_beats)
        source = "auto"
        if args.names:
            names = [x.strip() for x in args.names.split(",") if x.strip()]
            if len(names) != len(secs):
                print(f"! --names has {len(names)} names but {len(secs)} sections were detected — use --sections to set boundaries explicitly.", file=sys.stderr)
            for s, nm in zip(secs, names):
                s["name"] = nm
            source = "auto+names"

    for s in secs:
        s["start"], s["end"] = round(s["start"], 3), round(s["end"], 3)
        s["bars"] = round((s["end"] - s["start"]) / (60 / bpm * m), 1)

    # climax: last chorus, else biggest energy lift in the back half (snapped to a bar line)
    ch = [s for s in secs if s["name"].startswith("chorus")]
    if ch:
        climax = ch[-1]["start"]
    else:
        e2 = smooth(rms, int(FR * 2))
        lift = e2[int(FR * 2):] - e2[:-int(FR * 2)]
        half = len(lift) // 2
        k = half + int(np.argmax(lift[half:])) if len(lift) > 2 else 0
        climax = (k + FR * 2) / FR
    if len(downbeats):
        climax = float(downbeats[np.argmin(np.abs(downbeats - climax))])

    # loudness bands for visuals (0..99 ints at --rate fps)
    def band(lo, hi):
        sel = (centers >= lo) & (centers < hi)
        v = 10 * np.log10(mel[:, sel].sum(axis=1) + 1e-10)
        a, b = np.percentile(v, 3), np.percentile(v, 99)
        return np.clip((v - a) / (b - a + 1e-9), 0, 1)
    def resample(v, pool="mean"):
        n = int(duration * args.rate)
        edges = np.linspace(0, len(v), n + 1).astype(int)
        f = np.max if pool == "max" else np.mean
        return [int(round(99 * f(v[a:max(b, a + 1)]))) for a, b in zip(edges[:-1], edges[1:])]
    onset_n = np.clip(o / (np.percentile(o, 99) + 1e-9), 0, 1)
    bands = {"rate": args.rate, "bass": resample(band(20, 150)), "mid": resample(band(150, 2000)),
             "treble": resample(band(2000, 8000)), "onset": resample(onset_n, "max")}
    e_curve = smooth(rms, int(FR / 2))
    energy = [round(float(x), 3) for x in (e_curve / (e_curve.max() + 1e-9))[:: int(FR / 2)]]

    out = {
        "file": Path(args.audio).name, "duration": round(duration, 3), "bpm": round(bpm, 2), "meter": m,
        "offset": round(float(downbeats[0]), 3) if len(downbeats) else 0.0,
        "beats": [round(float(b), 3) for b in beats_t], "downbeats": [round(float(b), 3) for b in downbeats],
        "sections": secs, "climax": round(climax, 3), "energy": {"rate": 2, "values": energy},
        "bands": bands, "engine": engine, "sectionSource": source,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, separators=(",", ":")))

    # human-readable report
    print(f"{out['file']} — {fmt(duration)} · {bpm:.1f} BPM in {m}/{8 if m in (6, 9, 12) else (2 if m == 2 else 4)} · first downbeat {out['offset']:.2f}s · beats via {engine}{meter_note}")
    level = 20 * np.log10(np.sqrt(np.mean(y.astype(np.float64) ** 2)) + 1e-12)
    if level < -26:
        print(f"  note: the recording is quiet (≈{level:.0f} dBFS RMS). Normalise it so it isn't drowned out on phones:\n"
              f"        ffmpeg -i in.mp3 -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 44100 -b:a 192k song.mp3")
    if args.bpm and abs(bpm - args.bpm) / args.bpm > 0.04 and abs(bpm * 2 - args.bpm) / args.bpm > 0.04 and abs(bpm / 2 - args.bpm) / args.bpm > 0.04:
        print(f"  note: measured tempo differs from the hint ({args.bpm} BPM) — trust the measurement")
    print(f"\nSections ({source}" + ("" if source == "manual" else "; names are guesses — confirm by listening or lyric timestamps") + "):")
    print("   #  start     end       bars   energy           label  name")
    for i, s in enumerate(secs, 1):
        bar = "█" * int(round(s["energy"] * 12))
        print(f"  {i:2d}  {fmt(s['start']):>8}  {fmt(s['end']):>8}  {s['bars']:5.1f}  {bar:<12} {s['energy']:.2f}  {s['label']:^5}  {s['name']}")
    blocks = " ▁▂▃▄▅▆▇█"
    curve = "".join(blocks[min(8, int(v * 8.99))] for v in energy[::2])
    print(f"\nEnergy (1 char = 1 s): {curve}")
    print(f"Climax candidate: {fmt(climax)}")
    print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
