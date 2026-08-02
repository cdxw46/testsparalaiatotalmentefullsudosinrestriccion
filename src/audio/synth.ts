/**
 * Audio sintetizado con WebAudio: no hace falta ningún archivo de sonido y cada
 * efecto se genera en el momento, así que el tono puede seguir el ritmo del
 * juego (por ejemplo, las cascadas suben de nota).
 */
export type SoundName =
  | 'spin'
  | 'land'
  | 'pop'
  | 'cascade'
  | 'multiplier'
  | 'scatter'
  | 'win'
  | 'bigwin'
  | 'freespins'
  | 'click'
  | 'buy'
  | 'coins';

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private noiseBuffer: AudioBuffer | null = null;

  enabled = true;
  volume = 0.7;
  musicEnabled = true;

  /** Debe llamarse desde un gesto del usuario para cumplir la política de autoplay. */
  async unlock(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 8;
    this.master.connect(compressor).connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);

    const length = Math.floor(this.ctx.sampleRate * 0.6);
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setVolume(value: number): void {
    this.volume = value;
    if (this.master) this.master.gain.value = value;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master) this.master.gain.value = enabled ? this.volume : 0;
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private tone(options: {
    freq: number;
    type?: OscillatorType;
    duration?: number;
    gain?: number;
    attack?: number;
    at?: number;
    sweepTo?: number;
    detune?: number;
    dest?: AudioNode;
  }): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const start = options.at ?? this.now();
    const duration = options.duration ?? 0.18;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(options.freq, start);
    if (options.sweepTo) osc.frequency.exponentialRampToValueAtTime(options.sweepTo, start + duration);
    if (options.detune) osc.detune.value = options.detune;

    const peak = options.gain ?? 0.22;
    const attack = options.attack ?? 0.008;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain).connect(options.dest ?? this.master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  private noise(options: { duration?: number; gain?: number; freq?: number; q?: number; at?: number; sweepTo?: number }): void {
    if (!this.ctx || !this.master || !this.enabled || !this.noiseBuffer) return;
    const start = options.at ?? this.now();
    const duration = options.duration ?? 0.14;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(options.freq ?? 1800, start);
    if (options.sweepTo) filter.frequency.exponentialRampToValueAtTime(options.sweepTo, start + duration);
    filter.Q.value = options.q ?? 1.2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(options.gain ?? 0.14, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  /** Dispara un efecto. `step` sirve para subir el tono en cadenas de cascadas. */
  play(name: SoundName, step = 0): void {
    if (!this.ctx || !this.enabled) return;
    const t = this.now();
    const semitone = (n: number): number => 220 * 2 ** (n / 12);

    switch (name) {
      case 'spin':
        this.noise({ duration: 0.26, gain: 0.1, freq: 900, sweepTo: 2600, q: 0.8 });
        this.tone({ freq: 180, sweepTo: 90, duration: 0.24, gain: 0.14, type: 'triangle' });
        break;
      case 'land':
        this.tone({ freq: 150 + step * 8, sweepTo: 70, duration: 0.12, gain: 0.16, type: 'sine' });
        this.noise({ duration: 0.07, gain: 0.06, freq: 400, q: 0.7 });
        break;
      case 'pop': {
        const base = semitone(SCALE[Math.min(SCALE.length - 1, step)]! + 12);
        this.tone({ freq: base, sweepTo: base * 1.9, duration: 0.14, gain: 0.16, type: 'triangle' });
        this.tone({ freq: base * 2, duration: 0.09, gain: 0.07, type: 'sine', at: t + 0.02 });
        this.noise({ duration: 0.08, gain: 0.05, freq: 2400, q: 1.6 });
        break;
      }
      case 'cascade': {
        const base = semitone(SCALE[Math.min(SCALE.length - 1, step)]! + 7);
        for (let i = 0; i < 3; i++) {
          this.tone({
            freq: base * (1 + i * 0.25),
            duration: 0.16,
            gain: 0.1,
            type: 'square',
            at: t + i * 0.05,
          });
        }
        break;
      }
      case 'multiplier': {
        const base = semitone(SCALE[Math.min(SCALE.length - 1, step + 2)]! + 24);
        this.tone({ freq: base, duration: 0.22, gain: 0.14, type: 'triangle' });
        this.tone({ freq: base * 1.5, duration: 0.3, gain: 0.09, type: 'sine', at: t + 0.05 });
        break;
      }
      case 'scatter':
        for (let i = 0; i < 4; i++) {
          this.tone({
            freq: semitone(12 + i * 5),
            duration: 0.3,
            gain: 0.13,
            type: 'triangle',
            at: t + i * 0.09,
          });
        }
        break;
      case 'win':
        [0, 4, 7].forEach((n, i) => {
          this.tone({ freq: semitone(n + 24), duration: 0.32, gain: 0.12, type: 'triangle', at: t + i * 0.06 });
        });
        break;
      case 'bigwin':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => {
          this.tone({ freq: semitone(n + 12), duration: 0.5, gain: 0.13, type: 'triangle', at: t + i * 0.1 });
          this.tone({ freq: semitone(n + 24), duration: 0.4, gain: 0.07, type: 'sine', at: t + i * 0.1 + 0.02 });
        });
        break;
      case 'freespins':
        [0, 3, 7, 10, 12, 15, 19, 24].forEach((n, i) => {
          this.tone({ freq: semitone(n + 12), duration: 0.6, gain: 0.14, type: 'sawtooth', at: t + i * 0.12 });
        });
        this.noise({ duration: 1.1, gain: 0.06, freq: 700, sweepTo: 5200, q: 0.6 });
        break;
      case 'click':
        this.tone({ freq: 660, sweepTo: 880, duration: 0.06, gain: 0.1, type: 'square' });
        break;
      case 'buy':
        [0, 5, 9, 12].forEach((n, i) => {
          this.tone({ freq: semitone(n + 18), duration: 0.3, gain: 0.12, type: 'triangle', at: t + i * 0.07 });
        });
        break;
      case 'coins':
        for (let i = 0; i < 7; i++) {
          this.tone({
            freq: 1400 + Math.random() * 900,
            duration: 0.09,
            gain: 0.07,
            type: 'triangle',
            at: t + i * 0.045,
          });
        }
        break;
    }
  }

  /** Bucle musical sencillo y alegre de fondo. */
  startMusic(): void {
    if (!this.ctx || !this.musicGain || this.musicTimer !== null || !this.musicEnabled) return;
    const bass = [0, 0, 5, 7, 0, 0, 3, 5];
    const lead = [12, 16, 19, 16, 14, 17, 19, 21];
    const semitone = (n: number): number => 220 * 2 ** (n / 12);

    const tick = (): void => {
      if (!this.ctx || !this.musicGain) return;
      const step = this.musicStep % 8;
      this.tone({
        freq: semitone(bass[step]! - 12),
        duration: 0.34,
        gain: 0.1,
        type: 'triangle',
        dest: this.musicGain,
      });
      if (step % 2 === 0) {
        this.tone({
          freq: semitone(lead[step]!),
          duration: 0.24,
          gain: 0.05,
          type: 'sine',
          dest: this.musicGain,
        });
      }
      this.musicStep++;
    };

    tick();
    this.musicTimer = window.setInterval(tick, 420);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (enabled) this.startMusic();
    else this.stopMusic();
  }

  /** Cambia el ambiente entre juego base y tiradas gratis. */
  setMood(free: boolean): void {
    if (this.musicGain) this.musicGain.gain.value = free ? 0.42 : 0.32;
  }
}
