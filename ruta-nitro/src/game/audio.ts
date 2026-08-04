/**
 * Sonido sintetizado con WebAudio: ni un fichero que descargar, y el tono puede
 * reaccionar a lo que pasa en la rejilla (la cascada sube de nota, el premio
 * escala con su tamano). El contexto se crea al primer gesto del usuario porque
 * los navegadores lo mantienen suspendido hasta entonces.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let muted = false
let volume = 0.55

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : volume
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noise(context: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const frames = context.sampleRate * 2
    noiseBuffer = context.createBuffer(1, frames, context.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

interface ToneOptions {
  freq: number
  sweepTo?: number
  duration?: number
  type?: OscillatorType
  gain?: number
  delay?: number
  cutoff?: number
}

function tone({ freq, sweepTo, duration = 0.2, type = 'sine', gain = 0.3, delay = 0, cutoff }: ToneOptions) {
  const context = ensure()
  if (!context || !master) return

  const start = context.currentTime + delay
  const osc = context.createOscillator()
  const env = context.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(Math.max(freq, 1), start)
  if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), start + duration)

  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(gain, start + 0.008)
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  let node: AudioNode = osc
  if (cutoff !== undefined) {
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    osc.connect(filter)
    node = filter
  }

  node.connect(env)
  env.connect(master)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

interface NoiseOptions {
  duration?: number
  gain?: number
  from?: number
  to?: number
  q?: number
  delay?: number
}

function rush({ duration = 0.4, gain = 0.2, from = 400, to = 3000, q = 1.1, delay = 0 }: NoiseOptions) {
  const context = ensure()
  if (!context || !master) return

  const start = context.currentTime + delay
  const source = context.createBufferSource()
  source.buffer = noise(context)
  source.loop = true

  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = q
  filter.frequency.setValueAtTime(Math.max(from, 1), start)
  filter.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration)

  const env = context.createGain()
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(gain, start + duration * 0.22)
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  source.connect(filter)
  filter.connect(env)
  env.connect(master)
  source.start(start)
  source.stop(start + duration + 0.05)
}

/** Escala mayor pentatonica: cualquier subconjunto suena consonante. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
const semitone = (root: number, steps: number) => root * 2 ** (steps / 12)

export const audio = {
  setMuted(value: boolean) {
    muted = value
    if (master && ctx) master.gain.setTargetAtTime(value ? 0 : volume, ctx.currentTime, 0.02)
  },

  unlock() {
    ensure()
  },

  ui() {
    tone({ freq: 540, sweepTo: 760, duration: 0.05, type: 'triangle', gain: 0.07 })
  },

  toggle(on: boolean) {
    tone({ freq: on ? 480 : 700, sweepTo: on ? 760 : 400, duration: 0.09, type: 'triangle', gain: 0.09 })
  },

  /** Aceleron: un motor subiendo de vueltas al lanzar la tirada. */
  launch() {
    tone({ freq: 70, sweepTo: 190, duration: 0.42, type: 'sawtooth', gain: 0.16, cutoff: 900 })
    tone({ freq: 105, sweepTo: 285, duration: 0.42, type: 'square', gain: 0.06, cutoff: 700, delay: 0.02 })
    rush({ duration: 0.5, gain: 0.1, from: 300, to: 1800 })
  },

  /** Golpe seco de cada columna al asentarse. */
  land(column: number) {
    tone({ freq: 160 - column * 6, sweepTo: 70, duration: 0.13, type: 'sine', gain: 0.16, delay: column * 0.035 })
  },

  /** El tono sube con cada cascada encadenada. */
  cascade(depth: number) {
    const level = Math.min(depth, 8)
    tone({ freq: semitone(392, PENTATONIC[level]), duration: 0.2, type: 'triangle', gain: 0.14 })
    tone({ freq: semitone(196, PENTATONIC[level]), duration: 0.28, type: 'sine', gain: 0.1 })
  },

  /** Derrape del premio: la longitud crece con lo gordo que sea. */
  win(intensity: number) {
    const level = Math.min(Math.max(intensity, 0), 1)
    const root = 330 * (1 + level * 0.4)
    const notes = 3 + Math.round(level * 5)
    for (let i = 0; i < notes; i++) {
      tone({
        freq: semitone(root, PENTATONIC[i % PENTATONIC.length]),
        duration: 0.24 + level * 0.2,
        type: 'triangle',
        gain: 0.13,
        delay: i * (0.058 - level * 0.016),
      })
    }
    if (level > 0.5) rush({ duration: 0.5, gain: 0.07, from: 1200, to: 4200, q: 0.7, delay: 0.1 })
  },

  /** Explosion del bidon de nitro. */
  blast() {
    rush({ duration: 0.5, gain: 0.26, from: 2600, to: 90, q: 0.5 })
    tone({ freq: 120, sweepTo: 35, duration: 0.44, type: 'sawtooth', gain: 0.24, cutoff: 500 })
  },

  /** Cambio de marcha: chasquido metalico y subida de revoluciones. */
  gear() {
    tone({ freq: 900, sweepTo: 1500, duration: 0.07, type: 'square', gain: 0.07, cutoff: 3000 })
    tone({ freq: 150, sweepTo: 330, duration: 0.3, type: 'sawtooth', gain: 0.11, cutoff: 1100, delay: 0.05 })
  },

  /** Semaforo de salida al entrar en las vueltas gratis. */
  fanfare() {
    for (let i = 0; i < 3; i++) {
      tone({ freq: 440, duration: 0.16, type: 'square', gain: 0.1, cutoff: 2200, delay: i * 0.26 })
    }
    tone({ freq: 660, duration: 0.9, type: 'triangle', gain: 0.16, delay: 0.82 })
    rush({ duration: 1.1, gain: 0.12, from: 240, to: 4200, q: 0.6, delay: 0.8 })
  },

  lose() {
    tone({ freq: 180, sweepTo: 110, duration: 0.22, type: 'sine', gain: 0.06 })
  },
}
