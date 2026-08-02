/** Lightweight Web Audio synthesizer — no external assets needed */

let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setMuted(v: boolean) {
  muted = v;
}

export function isMuted() {
  return muted;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.08,
  when = 0,
) {
  if (muted) return;
  const c = ac();
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function sfxSpin() {
  tone(220, 0.08, 'triangle', 0.05);
  tone(330, 0.1, 'triangle', 0.04, 0.05);
}

export function sfxCluster() {
  tone(523, 0.12, 'sine', 0.07);
  tone(659, 0.14, 'sine', 0.06, 0.06);
  tone(784, 0.16, 'sine', 0.05, 0.12);
}

export function sfxDrop() {
  tone(180, 0.06, 'square', 0.03);
}

export function sfxWin(big = false) {
  if (big) {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, 'sine', 0.08, i * 0.08));
  } else {
    tone(660, 0.15, 'sine', 0.06);
    tone(880, 0.18, 'sine', 0.05, 0.08);
  }
}

export function sfxFreeSpins() {
  [392, 494, 587, 784, 988].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, i * 0.09));
}

export function sfxClick() {
  tone(740, 0.05, 'square', 0.03);
}
