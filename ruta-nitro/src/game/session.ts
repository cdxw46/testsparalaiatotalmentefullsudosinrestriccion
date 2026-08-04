/**
 * Encadenado de una ronda completa.
 *
 * Una tirada base puede abrir vueltas gratis, y esas vueltas arrastran las
 * marcas de neumatico de una a otra, pueden concederse vueltas extra y pueden
 * volver a dispararse. Toda esa secuencia vive aqui, separada del motor, para
 * que tanto el juego como el simulador de RTP recorran exactamente el mismo
 * camino.
 */

import {
  CELLS,
  MAX_WIN_X,
  UPGRADES,
  spin,
  spinsForScatters,
  type SpinResult,
  type Upgrade,
} from './engine.ts'
import { createRng } from './fair.ts'

/** Cortafuegos ante una racha de reactivaciones absurda. */
const MAX_FREE_SPINS = 500

/** Vueltas que concede volver a reunir tres dispersiones dentro de la ronda. */
export const RETRIGGER_SPINS = 2

export interface RoundOptions {
  serverSeed: string
  clientSeed: string
  /** Nonce de la tirada base; las vueltas gratis siguen numerando desde ahi. */
  nonce: number
  bet: number
  /** Desactivar el guion acelera el simulador, que solo mira el premio. */
  trace?: boolean
}

export interface FreeSpinRound {
  result: SpinResult
  /** Vueltas que quedaban al empezar esta, ya contando las ganadas. */
  remaining: number
  index: number
}

export interface RoundResult {
  base: SpinResult
  free: FreeSpinRound[]
  upgrades: Upgrade[]
  /** Vueltas gratis jugadas en total, reactivaciones incluidas. */
  freeSpinCount: number
  totalWin: number
  /** Cierto si la ronda entera choco contra el tope de pago. */
  capped: boolean
  /** Nonce que debe usar la siguiente ronda. */
  nextNonce: number
}

interface FreeSpinsOutcome {
  free: FreeSpinRound[]
  won: number
  capped: boolean
  nextNonce: number
  count: number
}

/**
 * Serie de vueltas gratis. Las marcas de neumatico viajan de una vuelta a la
 * siguiente, y tanto los simbolos de vuelta extra como una nueva terna de
 * dispersiones alargan la serie sobre la marcha.
 */
function runFreeSpins(
  serverSeed: string,
  clientSeed: string,
  startNonce: number,
  bet: number,
  spins: number,
  upgrades: readonly Upgrade[],
  alreadyWon: number,
  trace: boolean | undefined,
): FreeSpinsOutcome {
  const maxWin = MAX_WIN_X * bet
  const free: FreeSpinRound[] = []

  let cursor = startNonce
  let won = 0
  let remaining = spins
  let index = 0
  let capped = false

  while (remaining > 0 && index < MAX_FREE_SPINS) {
    const result = spin({
      serverSeed,
      clientSeed,
      nonce: cursor++,
      bet,
      mode: 'free',
      upgrades,
      carry: index === 0 ? new Array(CELLS).fill(0) : free[index - 1].result.multipliers,
      trace,
    })

    free.push({ result, remaining, index })
    won += result.totalWin
    index += 1
    remaining -= 1
    remaining += result.extraSpins

    if (result.scatters >= 3) remaining += RETRIGGER_SPINS

    if (result.capped || alreadyWon + won >= maxWin) {
      won = Math.min(won, maxWin - alreadyWon)
      capped = true
      break
    }
  }

  return { free, won, capped, nextNonce: cursor, count: index }
}

export function playRound({ serverSeed, clientSeed, nonce, bet, trace }: RoundOptions): RoundResult {
  const base = spin({ serverSeed, clientSeed, nonce, bet, mode: 'base', trace })

  if (!base.trigger || base.capped) {
    return {
      base,
      free: [],
      upgrades: [],
      freeSpinCount: 0,
      totalWin: base.totalWin,
      capped: base.capped,
      nextNonce: nonce + 1,
    }
  }

  const outcome = runFreeSpins(
    serverSeed,
    clientSeed,
    nonce + 1,
    bet,
    base.trigger.spins,
    base.trigger.upgrades,
    base.totalWin,
    trace,
  )

  return {
    base,
    free: outcome.free,
    upgrades: [...base.trigger.upgrades],
    freeSpinCount: outcome.count,
    totalWin: base.totalWin + outcome.won,
    capped: base.capped || outcome.capped,
    nextNonce: outcome.nextNonce,
  }
}

/**
 * Compra directa de la funcion: se paga el precio y se entra en la serie mas
 * baja sin pasar por el juego base. Las mejoras se sortean con el mismo flujo
 * verificable, de modo que la compra sigue siendo comprobable.
 */
export function playBuy({ serverSeed, clientSeed, nonce, bet, trace }: RoundOptions): RoundResult {
  const rng = createRng(serverSeed, clientSeed, nonce)
  const pool = [...UPGRADES]
  const upgrades: Upgrade[] = [pool[rng.int(pool.length)]]

  const outcome = runFreeSpins(serverSeed, clientSeed, nonce + 1, bet, 7, upgrades, 0, trace)

  return {
    base: spin({ serverSeed, clientSeed, nonce, bet, mode: 'base', trace: false }),
    free: outcome.free,
    upgrades,
    freeSpinCount: outcome.count,
    totalWin: outcome.won,
    capped: outcome.capped,
    nextNonce: outcome.nextNonce,
  }
}

export { spinsForScatters }
