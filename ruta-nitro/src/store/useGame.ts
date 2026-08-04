/**
 * Estado del juego.
 *
 * El motor resuelve la ronda entera de una vez y devuelve el guion de etapas.
 * Aqui se guarda ese guion y el punto de reproduccion; el secuenciador
 * (`game/sequencer.ts`) va empujando la rejilla visible etapa a etapa. La
 * separacion importa: el resultado esta cerrado antes del primer fotograma, y
 * pausar, acelerar o saltar la animacion no puede alterarlo.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CELLS, type Board, type Blast, type Cluster, type GearReveal, type Upgrade } from '@/game/engine'
import { randomClientSeed, randomSeed, sha256Hex } from '@/game/fair'
import type { RoundResult } from '@/game/session'
import type { Lang } from '@/i18n'

export const STARTING_BALANCE = 1000
export const BUY_COST_X = 100

/** Apuestas disponibles, en moneda. */
export const BET_STEPS = [0.2, 0.4, 0.6, 1, 2, 4, 6, 10, 20, 40, 60, 100] as const

export type Phase = 'idle' | 'spinning'

export interface FreeState {
  /** Vueltas jugadas hasta ahora, empezando en 1. */
  index: number
  /** Vueltas que quedan por jugar, contando las ganadas sobre la marcha. */
  remaining: number
  total: number
  upgrades: Upgrade[]
  scatters: number
  win: number
}

export interface HistoryEntry {
  id: string
  nonce: number
  serverSeedHash: string
  clientSeed: string
  bet: number
  win: number
  freeSpins: number
  at: number
}

export interface Stats {
  rounds: number
  wins: number
  wagered: number
  returned: number
  best: number
  bonuses: number
}

export interface FairState {
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  revealed: { serverSeed: string; serverSeedHash: string; clientSeed: string; rounds: number } | null
}

export interface Settings {
  sound: boolean
  turbo: boolean
  lang: Lang
}

interface Notice {
  id: number
  key: string
  tone: 'info' | 'warn'
}

const emptyStats: Stats = { rounds: 0, wins: 0, wagered: 0, returned: 0, best: 0, bonuses: 0 }

function freshFair(clientSeed?: string): FairState {
  const serverSeed = randomSeed()
  return {
    serverSeed,
    serverSeedHash: sha256Hex(serverSeed),
    clientSeed: clientSeed ?? randomClientSeed(),
    nonce: 0,
    revealed: null,
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100

interface GameState {
  balance: number
  bet: number
  phase: Phase

  /** Rejilla visible ahora mismo. */
  board: Board | null
  multipliers: number[]
  /** Casillas resaltadas por el premio en curso. */
  highlight: number[]
  clusters: Cluster[] | null
  gears: GearReveal | null
  blast: Blast | null

  /** Premio acumulado de la ronda mientras se reproduce. */
  roundWin: number
  /** Premio de la cascada que se acaba de mostrar. */
  stageWin: number
  free: FreeState | null
  /** Cierto mientras se muestra el cartel de entrada a las vueltas gratis. */
  intro: { spins: number; upgrades: Upgrade[]; scatters: number } | null
  outro: { win: number; spins: number } | null

  history: HistoryEntry[]
  stats: Stats
  fair: FairState
  settings: Settings
  notice: Notice | null
  autoplay: number

  setBet: (value: number) => void
  stepBet: (direction: 1 | -1) => void
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  setClientSeed: (value: string) => void
  rotateSeeds: () => void
  resetSession: () => void
  notify: (key: string, tone?: 'info' | 'warn') => void
  dismissNotice: () => void
  setAutoplay: (value: number) => void

  /** Reserva el importe y devuelve el nonce con el que resolver la ronda. */
  beginRound: (cost: number) => number | null
  /** Cierra la ronda: abona el premio y actualiza historial y estadisticas. */
  finishRound: (result: RoundResult, cost: number) => void
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      balance: STARTING_BALANCE,
      bet: 1,
      phase: 'idle',

      board: null,
      multipliers: new Array(CELLS).fill(0),
      highlight: [],
      clusters: null,
      gears: null,
      blast: null,

      roundWin: 0,
      stageWin: 0,
      free: null,
      intro: null,
      outro: null,

      history: [],
      stats: emptyStats,
      fair: freshFair(),
      settings: { sound: true, turbo: false, lang: 'es' },
      notice: null,
      autoplay: 0,

      setBet: (value) => {
        const step = BET_STEPS.reduce((closest, candidate) =>
          Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest,
        )
        set({ bet: step })
      },

      stepBet: (direction) =>
        set((state) => {
          const index = BET_STEPS.indexOf(state.bet as (typeof BET_STEPS)[number])
          const next = Math.min(Math.max((index === -1 ? 3 : index) + direction, 0), BET_STEPS.length - 1)
          return { bet: BET_STEPS[next] }
        }),

      setSetting: (key, value) => set((state) => ({ settings: { ...state.settings, [key]: value } })),

      setClientSeed: (value) => {
        const clientSeed = value.trim().slice(0, 64) || randomClientSeed()
        set((state) => ({ fair: { ...state.fair, clientSeed, nonce: 0 } }))
      },

      rotateSeeds: () => {
        const state = get()
        if (state.phase === 'spinning') return
        const next = freshFair(state.fair.clientSeed)
        set({
          fair: {
            ...next,
            revealed: {
              serverSeed: state.fair.serverSeed,
              serverSeedHash: state.fair.serverSeedHash,
              clientSeed: state.fair.clientSeed,
              rounds: state.fair.nonce,
            },
          },
        })
      },

      resetSession: () =>
        set({
          balance: STARTING_BALANCE,
          bet: 1,
          phase: 'idle',
          board: null,
          multipliers: new Array(CELLS).fill(0),
          highlight: [],
          clusters: null,
          gears: null,
          blast: null,
          roundWin: 0,
          stageWin: 0,
          free: null,
          intro: null,
          outro: null,
          history: [],
          stats: emptyStats,
          fair: freshFair(),
          autoplay: 0,
        }),

      notify: (key, tone = 'info') => set({ notice: { id: Date.now(), key, tone } }),
      dismissNotice: () => set({ notice: null }),
      setAutoplay: (value) => set({ autoplay: Math.max(0, value) }),

      beginRound: (cost) => {
        const state = get()
        if (state.phase === 'spinning') return null
        if (cost > state.balance) {
          get().notify('bet.noFunds', 'warn')
          set({ autoplay: 0 })
          return null
        }

        set({
          phase: 'spinning',
          balance: round2(state.balance - cost),
          roundWin: 0,
          stageWin: 0,
          highlight: [],
          clusters: null,
          gears: null,
          blast: null,
          free: null,
          intro: null,
          outro: null,
        })

        return state.fair.nonce
      },

      finishRound: (result, cost) => {
        const state = get()
        const win = round2(result.totalWin)

        const entry: HistoryEntry = {
          id: `${state.fair.serverSeedHash.slice(0, 6)}-${state.fair.nonce}`,
          nonce: state.fair.nonce,
          serverSeedHash: state.fair.serverSeedHash,
          clientSeed: state.fair.clientSeed,
          bet: cost,
          win,
          freeSpins: result.freeSpinCount,
          at: Date.now(),
        }

        set({
          phase: 'idle',
          balance: round2(state.balance + win),
          roundWin: win,
          highlight: [],
          clusters: null,
          gears: null,
          blast: null,
          fair: { ...state.fair, nonce: result.nextNonce },
          history: [entry, ...state.history].slice(0, 100),
          stats: {
            rounds: state.stats.rounds + 1,
            wins: state.stats.wins + (win > 0 ? 1 : 0),
            wagered: round2(state.stats.wagered + cost),
            returned: round2(state.stats.returned + win),
            best: Math.max(state.stats.best, win / (cost || 1)),
            bonuses: state.stats.bonuses + (result.freeSpinCount > 0 ? 1 : 0),
          },
          autoplay: Math.max(0, state.autoplay - 1),
        })
      },
    }),
    {
      name: 'ruta-nitro',
      version: 1,
      partialize: (state) => ({
        balance: state.balance,
        bet: state.bet,
        history: state.history.slice(0, 40),
        stats: state.stats,
        fair: state.fair,
        settings: state.settings,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<GameState>),
        phase: 'idle' as Phase,
        autoplay: 0,
      }),
    },
  ),
)
