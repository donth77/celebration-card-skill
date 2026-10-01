// "Blow out the candles" — detect a blow into the microphone. Always pair with a tap fallback:
// mic access needs HTTPS, a permission prompt, and isn't available in every in-app browser.
//
//   button.onclick = async () => {                       // must start from a user gesture
//     const mic = await listenForBlow({ onBlow: () => { blowOut(); mic.stop(); }, onLevel: (v) => flicker(v) });
//     if (!mic) showTapHint();                           // denied/unsupported → tap instead
//   };

export async function listenForBlow({ onBlow, onLevel = null, sensitivity = 1, holdMs = 140, timeoutMs = 20000 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch {
    return null;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  if (ac.state === 'suspended') await ac.resume().catch(() => {});
  const src = ac.createMediaStreamSource(stream);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const an = ac.createAnalyser(); an.fftSize = 1024;
  src.connect(lp).connect(an);
  const buf = new Float32Array(an.fftSize);
  let ambient = 0.01, aboveSince = 0, stopped = false, raf = 0;
  const started = performance.now();

  const stop = () => {
    if (stopped) return;
    stopped = true; cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    ac.close().catch(() => {});
  };
  const loop = (now) => {
    if (stopped) return;
    an.getFloatTimeDomainData(buf);
    let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const elapsed = now - started;
    if (elapsed < 400) ambient = Math.max(ambient, rms); // calibrate on room noise
    const threshold = Math.max(0.06, ambient * 3.2) / sensitivity;
    onLevel?.(Math.min(1, rms / (threshold * 1.5)));
    if (elapsed > 400 && rms > threshold) {
      if (!aboveSince) aboveSince = now;
      if (now - aboveSince > holdMs) { onBlow?.(); return stop(); }
    } else aboveSince = 0;
    if (elapsed > timeoutMs) return stop();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return { stop };
}
