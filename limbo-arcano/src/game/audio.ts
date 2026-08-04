/**
 * Todo el sonido del juego se sintetiza en tiempo real con WebAudio: ni un solo
 * fichero de audio que descargar, y el tono puede reaccionar al escalon que
 * toca. El contexto se crea de forma perezosa porque los navegadores lo
 * bloquean hasta que hay un gesto del usuario.
 */

type Ctx = AudioContext & { __master?: GainNode }

let ctx: Ctx | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let muted = false
let volume = 0.6
let lastTickAt = 0

function ensure(): Ctx | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor() as Ctx
    master = ctx.createGain()
    master.gain.value = muted ? 0 : volume
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noise(context: Ctx): AudioBuffer {
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
  /** Frecuencia final del barrido; por defecto no hay barrido. */
  sweepTo?: number
  duration?: number
  type?: OscillatorType
  gain?: number
  delay?: number
  /** Corte del paso bajo; util para redondear ondas cuadradas. */
  cutoff?: number
}

function tone({ freq, sweepTo, duration = 0.2, type = 'sine', gain = 0.3, delay = 0, cutoff }: ToneOptions) {
  const context = ensure()
  if (!context || !master) return

  const start = context.currentTime + delay
  const osc = context.createOscillator()
  const env = context.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), start + duration)

  // Ataque muy corto en vez de instantaneo: evita el chasquido del salto a 0.
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

function swoosh({ duration = 0.4, gain = 0.2, from = 400, to = 3000, q = 1.2, delay = 0 }: NoiseOptions) {
  const context = ensure()
  if (!context || !master) return

  const start = context.currentTime + delay
  const source = context.createBufferSource()
  source.buffer = noise(context)
  source.loop = true

  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, start)
  filter.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration)

  const env = context.createGain()
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(gain, start + duration * 0.25)
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  source.connect(filter)
  filter.connect(env)
  env.connect(master)
  source.start(start)
  source.stop(start + duration + 0.05)
}

/** Escala pentatonica menor: cualquier subconjunto suena consonante. */
const PENTATONIC = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24]
const semitone = (root: number, steps: number) => root * 2 ** (steps / 12)

export const audio = {
  setMuted(value: boolean) {
    muted = value
    if (master && ctx) master.gain.setTargetAtTime(value ? 0 : volume, ctx.currentTime, 0.02)
  },

  setVolume(value: number) {
    volume = Math.min(Math.max(value, 0), 1)
    if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02)
  },

  /** Debe invocarse desde un gesto del usuario para desbloquear el contexto. */
  unlock() {
    ensure()
  },

  ui() {
    tone({ freq: 620, sweepTo: 900, duration: 0.05, type: 'triangle', gain: 0.08 })
  },

  toggle(on: boolean) {
    tone({ freq: on ? 500 : 700, sweepTo: on ? 780 : 420, duration: 0.09, type: 'triangle', gain: 0.1 })
  },

  /** Chasquido de cada casilla que cruza la aguja; se limita para no saturar. */
  tick(speed: number) {
    const now = performance.now()
    if (now - lastTickAt < 22) return
    lastTickAt = now
    const intensity = Math.min(Math.max(speed, 0), 1)
    tone({
      freq: 1500 + intensity * 900,
      duration: 0.035,
      type: 'square',
      gain: 0.02 + intensity * 0.045,
      cutoff: 2600,
    })
  },

  launch() {
    swoosh({ duration: 0.55, gain: 0.16, from: 220, to: 2400 })
    tone({ freq: 180, sweepTo: 90, duration: 0.35, type: 'sawtooth', gain: 0.12, cutoff: 700 })
  },

  land() {
    tone({ freq: 140, sweepTo: 60, duration: 0.22, type: 'sine', gain: 0.3 })
    swoosh({ duration: 0.16, gain: 0.1, from: 2600, to: 500, q: 0.8 })
  },

  lose() {
    tone({ freq: 220, sweepTo: 110, duration: 0.42, type: 'sawtooth', gain: 0.12, cutoff: 900 })
    tone({ freq: 146, sweepTo: 73, duration: 0.5, type: 'sine', gain: 0.14 })
  },

  /** `intensity` 0-1 alarga el arpegio y sube la octava segun el escalon. */
  win(intensity: number) {
    const level = Math.min(Math.max(intensity, 0), 1)
    const root = 330 * (1 + level * 0.5)
    const notes = 4 + Math.round(level * 5)

    for (let i = 0; i < notes; i++) {
      tone({
        freq: semitone(root, PENTATONIC[i % PENTATONIC.length]),
        duration: 0.28 + level * 0.25,
        type: 'triangle',
        gain: 0.16,
        delay: i * (0.062 - level * 0.018),
      })
    }

    tone({ freq: root / 2, duration: 0.5 + level, type: 'sine', gain: 0.12 })

    if (level > 0.55) {
      for (let i = 0; i < 10; i++) {
        tone({
          freq: 1800 + Math.random() * 2600,
          duration: 0.12,
          type: 'sine',
          gain: 0.05,
          delay: 0.18 + i * 0.045,
        })
      }
    }
  },

  jackpot() {
    swoosh({ duration: 1.1, gain: 0.14, from: 180, to: 5200, q: 0.6 })
    for (let i = 0; i < 3; i++) {
      tone({ freq: semitone(196, [0, 7, 12][i]), duration: 1.6, type: 'sawtooth', gain: 0.07, cutoff: 1400 })
    }
  },
}
