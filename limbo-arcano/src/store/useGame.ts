/**
 * Estado unico del juego.
 *
 * Una ronda vive en dos tiempos: `roll()` la resuelve y la cobra al instante
 * (el resultado ya esta decidido criptograficamente antes de que se mueva un
 * pixel) y la deja en `pending`; el carrusel la anima y llama a `settle()` al
 * aterrizar, que es cuando se abona el premio y se actualizan las estadisticas.
 * Asi la animacion nunca puede alterar el resultado, solo revelarlo.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { audio } from '@/game/audio'
import {
  MAX_MULTIPLIER,
  MIN_TARGET,
  randomClientSeed,
  randomSeed,
  resolveRound,
  roundTarget,
  sha256Hex,
  winChance,
} from '@/game/fair'
import type { Lang } from '@/i18n'

export const STARTING_BALANCE = 1000
export const MIN_BET = 0.1
export const MAX_BET = 100_000

export type Phase = 'idle' | 'rolling'
export type NoticeTone = 'info' | 'warn'
export type AutoMode = 'reset' | 'increase'

export interface Round {
  id: string
  nonce: number
  serverSeedHash: string
  clientSeed: string
  target: number
  multiplier: number
  bet: number
  payout: number
  profit: number
  win: boolean
  at: number
}

export interface Stats {
  rounds: number
  wins: number
  losses: number
  wagered: number
  profit: number
  best: number
  bestWin: number
  streak: number
  bestStreak: number
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
  /** Con el modo automatico activo el boton principal arranca y para la serie. */
  autoMode: boolean
  lang: Lang
}

export interface AutoConfig {
  rounds: number
  onWin: { mode: AutoMode; percent: number }
  onLoss: { mode: AutoMode; percent: number }
  stopProfit: number
  stopLoss: number
}

export interface AutoState extends AutoConfig {
  running: boolean
  remaining: number
  baseBet: number
  sessionProfit: number
}

interface Notice {
  id: number
  text: string
  tone: NoticeTone
}

const emptyStats: Stats = {
  rounds: 0,
  wins: 0,
  losses: 0,
  wagered: 0,
  profit: 0,
  best: 0,
  bestWin: 0,
  streak: 0,
  bestStreak: 0,
}

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
const clampBet = (value: number, balance: number) =>
  round2(Math.min(Math.max(value, 0), Math.max(Math.min(balance, MAX_BET), 0)))

/** Motivos por los que el modo automatico puede pararse solo. */
export type AutoStopReason = 'done' | 'profit' | 'loss' | 'funds' | 'manual'

interface GameState {
  balance: number
  bet: number
  target: number
  phase: Phase
  pending: Round | null
  lastRound: Round | null
  history: Round[]
  stats: Stats
  fair: FairState
  settings: Settings
  auto: AutoState
  notice: Notice | null

  setBet: (value: number) => void
  adjustBet: (kind: 'min' | 'half' | 'double' | 'max') => void
  setTarget: (value: number) => void
  nudgeTarget: (delta: number) => void
  roll: () => void
  settle: () => void
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  configureAuto: (patch: Partial<AutoConfig>) => void
  startAuto: () => void
  stopAuto: (reason?: AutoStopReason) => void
  setClientSeed: (value: string) => void
  rotateSeeds: () => void
  resetSession: () => void
  notify: (text: string, tone?: NoticeTone) => void
  dismissNotice: () => void
}

/** Timer del modo automatico: fuera del estado porque no se renderiza. */
let autoTimer: ReturnType<typeof setTimeout> | null = null

const clearAutoTimer = () => {
  if (autoTimer !== null) {
    clearTimeout(autoTimer)
    autoTimer = null
  }
}

/** Mensajes de parada del automatico, resueltos por la UI con su idioma. */
export const AUTO_STOP_KEYS = {
  done: 'auto.stoppedDone',
  profit: 'auto.stoppedProfit',
  loss: 'auto.stoppedLoss',
  funds: 'auto.stoppedFunds',
  manual: null,
} as const

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      balance: STARTING_BALANCE,
      bet: 1,
      target: 2,
      phase: 'idle',
      pending: null,
      lastRound: null,
      history: [],
      stats: emptyStats,
      fair: freshFair(),
      settings: { sound: true, turbo: false, autoMode: false, lang: 'es' },
      auto: {
        running: false,
        remaining: 0,
        baseBet: 1,
        sessionProfit: 0,
        rounds: 25,
        onWin: { mode: 'reset', percent: 50 },
        onLoss: { mode: 'reset', percent: 100 },
        stopProfit: 0,
        stopLoss: 0,
      },
      notice: null,

      setBet: (value) => set((state) => ({ bet: clampBet(value, state.balance) })),

      adjustBet: (kind) =>
        set((state) => {
          const { bet, balance } = state
          const next =
            kind === 'min'
              ? MIN_BET
              : kind === 'half'
                ? bet / 2
                : kind === 'double'
                  ? Math.max(bet, MIN_BET) * 2
                  : balance
          return { bet: clampBet(next, balance) }
        }),

      setTarget: (value) => set({ target: roundTarget(value) }),

      nudgeTarget: (delta) =>
        set((state) => {
          // Paso proporcional: +1 en 2.00x es util, en 5000x es irrelevante.
          const magnitude = Math.max(0.01, 10 ** Math.floor(Math.log10(state.target)) / 100)
          return { target: roundTarget(state.target + delta * magnitude) }
        }),

      roll: () => {
        const state = get()
        if (state.phase === 'rolling') return

        const bet = clampBet(state.bet, state.balance)
        if (bet > state.balance) {
          get().notify('bet.noFunds', 'warn')
          return
        }

        const { serverSeed, serverSeedHash, clientSeed, nonce } = state.fair
        const { multiplier } = resolveRound(serverSeed, clientSeed, nonce)
        const target = state.target
        const win = multiplier >= target
        const payout = win ? round2(bet * target) : 0

        const round: Round = {
          id: `${serverSeedHash.slice(0, 6)}-${nonce}-${Date.now().toString(36)}`,
          nonce,
          serverSeedHash,
          clientSeed,
          target,
          multiplier,
          bet,
          payout,
          profit: round2(payout - bet),
          win,
          at: Date.now(),
        }

        set({
          phase: 'rolling',
          pending: round,
          balance: round2(state.balance - bet),
          bet,
          fair: { ...state.fair, nonce: nonce + 1 },
        })
      },

      settle: () => {
        const state = get()
        const round = state.pending
        if (!round) return

        const stats = state.stats
        const streak = round.win ? Math.max(stats.streak, 0) + 1 : Math.min(stats.streak, 0) - 1

        set({
          phase: 'idle',
          pending: null,
          lastRound: round,
          balance: round2(state.balance + round.payout),
          history: [round, ...state.history].slice(0, 200),
          stats: {
            rounds: stats.rounds + 1,
            wins: stats.wins + (round.win ? 1 : 0),
            losses: stats.losses + (round.win ? 0 : 1),
            wagered: round2(stats.wagered + round.bet),
            profit: round2(stats.profit + round.profit),
            best: Math.max(stats.best, round.multiplier),
            bestWin: Math.max(stats.bestWin, round.profit),
            streak,
            bestStreak: Math.max(stats.bestStreak, Math.abs(streak)),
          },
        })

        const auto = get().auto
        if (!auto.running) return

        const sessionProfit = round2(auto.sessionProfit + round.profit)
        const rule = round.win ? auto.onWin : auto.onLoss
        const nextBet =
          rule.mode === 'reset'
            ? auto.baseBet
            : round2(round.bet * (1 + rule.percent / 100))

        const remaining = auto.rounds === 0 ? 0 : auto.remaining - 1

        set((current) => ({
          auto: { ...current.auto, sessionProfit, remaining },
          bet: clampBet(nextBet, get().balance),
        }))

        if (auto.stopProfit > 0 && sessionProfit >= auto.stopProfit) return get().stopAuto('profit')
        if (auto.stopLoss > 0 && -sessionProfit >= auto.stopLoss) return get().stopAuto('loss')
        if (auto.rounds > 0 && remaining <= 0) return get().stopAuto('done')
        if (get().bet > get().balance) return get().stopAuto('funds')

        clearAutoTimer()
        autoTimer = setTimeout(() => {
          autoTimer = null
          if (get().auto.running) get().roll()
        }, get().settings.turbo ? 90 : 320)
      },

      setSetting: (key, value) =>
        set((state) => {
          if (key === 'sound') audio.setMuted(!(value as boolean))
          return { settings: { ...state.settings, [key]: value } }
        }),

      configureAuto: (patch) => set((state) => ({ auto: { ...state.auto, ...patch } })),

      startAuto: () => {
        const state = get()
        if (state.auto.running) return
        if (state.bet > state.balance) {
          get().notify('bet.noFunds', 'warn')
          return
        }

        set({
          auto: {
            ...state.auto,
            running: true,
            remaining: state.auto.rounds,
            baseBet: state.bet,
            sessionProfit: 0,
          },
        })

        if (state.phase === 'idle') get().roll()
      },

      stopAuto: (reason = 'manual') => {
        clearAutoTimer()
        const key = AUTO_STOP_KEYS[reason]
        set((state) => ({ auto: { ...state.auto, running: false, remaining: 0 } }))
        if (key) get().notify(key, reason === 'loss' || reason === 'funds' ? 'warn' : 'info')
      },

      setClientSeed: (value) => {
        const clientSeed = value.trim().slice(0, 64) || randomClientSeed()
        set((state) => ({ fair: { ...state.fair, clientSeed, nonce: 0 } }))
      },

      rotateSeeds: () => {
        const state = get()
        if (state.phase === 'rolling') return
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

      resetSession: () => {
        clearAutoTimer()
        set((state) => ({
          balance: STARTING_BALANCE,
          bet: 1,
          target: 2,
          phase: 'idle',
          pending: null,
          lastRound: null,
          history: [],
          stats: emptyStats,
          fair: freshFair(),
          auto: { ...state.auto, running: false, remaining: 0, sessionProfit: 0, baseBet: 1 },
        }))
      },

      notify: (text, tone = 'info') => set({ notice: { id: Date.now(), text, tone } }),

      dismissNotice: () => set({ notice: null }),
    }),
    {
      name: 'limbo-arcano',
      version: 1,
      partialize: (state) => ({
        balance: state.balance,
        bet: state.bet,
        target: state.target,
        history: state.history.slice(0, 50),
        stats: state.stats,
        fair: state.fair,
        settings: state.settings,
        auto: { ...state.auto, running: false, remaining: 0, sessionProfit: 0 },
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<GameState> | undefined
        if (!saved) return current
        // Una recarga a mitad de giro no debe dejar la partida bloqueada.
        return {
          ...current,
          ...saved,
          phase: 'idle',
          pending: null,
          auto: { ...current.auto, ...saved.auto, running: false, remaining: 0, sessionProfit: 0 },
        }
      },
    },
  ),
)

/** Valores derivados del objetivo actual, compartidos por varios paneles. */
export function selectOdds(state: GameState) {
  const chance = winChance(state.target)
  const payout = round2(state.bet * state.target)
  return { chance, payout, profit: round2(payout - state.bet) }
}

export const TARGET_BOUNDS = { min: MIN_TARGET, max: MAX_MULTIPLIER }
