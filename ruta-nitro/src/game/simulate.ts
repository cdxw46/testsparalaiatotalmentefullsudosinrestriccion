/**
 * Simulador Monte Carlo del juego completo.
 *
 * Es la herramienta con la que se calibran los pesos de los bombos y la tabla
 * de pagos: una tragaperras de volatilidad extrema no permite razonar el RTP a
 * mano, hay que medirlo. Se usa desde `rtp.test.ts` y desde `npm run simulate`.
 */

import { MAX_WIN_X } from './engine.ts'
import { playRound } from './session.ts'

export interface SimulationReport {
  spins: number
  bet: number
  wagered: number
  returned: number
  /** Devuelto entre apostado. El objetivo de diseno es 0.96. */
  rtp: number
  /** Reparto del retorno entre juego base y vueltas gratis. */
  baseRtp: number
  freeRtp: number
  /** Proporcion de tiradas que pagan algo. */
  hitRate: number
  /** Una de cada cuantas tiradas abre vueltas gratis. */
  bonusFrequency: number
  bonusCount: number
  /** Premio medio de una ronda con vueltas gratis, en veces la apuesta. */
  averageBonusX: number
  maxWinX: number
  cappedCount: number
  /** Proporcion de tiradas que pagan al menos 10x, 100x y 1000x. */
  above10x: number
  above100x: number
  above1000x: number
  /** Diagnostico de calibrado: cuanto se alarga y se realimenta una tirada. */
  avgCascades: number
  avgFreeSpins: number
  maxMultiplierSeen: number
}

export interface SimulationOptions {
  spins: number
  serverSeed?: string
  clientSeed?: string
  bet?: number
  /** Se invoca cada `progressEvery` tiradas para poder informar por consola. */
  onProgress?: (done: number, total: number) => void
  progressEvery?: number
}

export function simulate({
  spins,
  serverSeed = 'sim'.repeat(16),
  clientSeed = 'monte-carlo',
  bet = 1,
  onProgress,
  progressEvery = 250_000,
}: SimulationOptions): SimulationReport {
  let wagered = 0
  let returned = 0
  let baseReturned = 0
  let freeReturned = 0
  let hits = 0
  let bonusCount = 0
  let bonusReturned = 0
  let capped = 0
  let maxWin = 0
  let above10 = 0
  let above100 = 0
  let above1000 = 0
  let cascades = 0
  let freeSpins = 0
  let maxMultiplier = 0

  let nonce = 0

  for (let index = 0; index < spins; index++) {
    const round = playRound({ serverSeed, clientSeed, nonce, bet, trace: false })
    nonce = round.nextNonce

    wagered += bet
    returned += round.totalWin
    baseReturned += round.base.totalWin

    const fromFree = round.totalWin - round.base.totalWin
    freeReturned += fromFree

    if (round.totalWin > 0) hits += 1
    if (round.free.length > 0) {
      bonusCount += 1
      bonusReturned += round.totalWin
    }
    if (round.capped) capped += 1

    cascades += round.base.cascades
    freeSpins += round.freeSpinCount
    for (const value of round.base.multipliers) if (value > maxMultiplier) maxMultiplier = value
    for (const entry of round.free) {
      cascades += entry.result.cascades
      for (const value of entry.result.multipliers) if (value > maxMultiplier) maxMultiplier = value
    }

    const winX = round.totalWin / bet
    if (winX > maxWin) maxWin = winX
    if (winX >= 10) above10 += 1
    if (winX >= 100) above100 += 1
    if (winX >= 1000) above1000 += 1

    if (onProgress && (index + 1) % progressEvery === 0) onProgress(index + 1, spins)
  }

  return {
    spins,
    bet,
    wagered,
    returned,
    rtp: returned / wagered,
    baseRtp: baseReturned / wagered,
    freeRtp: freeReturned / wagered,
    hitRate: hits / spins,
    bonusFrequency: bonusCount > 0 ? spins / bonusCount : Infinity,
    bonusCount,
    averageBonusX: bonusCount > 0 ? bonusReturned / bonusCount / bet : 0,
    maxWinX: maxWin,
    cappedCount: capped,
    above10x: above10 / spins,
    above100x: above100 / spins,
    above1000x: above1000 / spins,
    avgCascades: cascades / spins,
    avgFreeSpins: bonusCount > 0 ? freeSpins / bonusCount : 0,
    maxMultiplierSeen: maxMultiplier,
  }
}

export function formatReport(report: SimulationReport): string {
  const percent = (value: number) => `${(value * 100).toFixed(4)}%`
  return [
    `tiradas            ${report.spins.toLocaleString('es-ES')}`,
    `RTP                ${percent(report.rtp)}`,
    `  juego base       ${percent(report.baseRtp)}`,
    `  vueltas gratis   ${percent(report.freeRtp)}`,
    `tiradas premiadas  ${percent(report.hitRate)}`,
    `bonus             1 de cada ${report.bonusFrequency.toFixed(0)} (${report.bonusCount})`,
    `bonus medio        ${report.averageBonusX.toFixed(1)}x`,
    `premio maximo      ${report.maxWinX.toFixed(2)}x  (tope ${MAX_WIN_X}x)`,
    `topes alcanzados   ${report.cappedCount}`,
    `>= 10x             ${percent(report.above10x)}`,
    `>= 100x            ${percent(report.above100x)}`,
    `>= 1000x           ${percent(report.above1000x)}`,
    `cascadas/tirada    ${report.avgCascades.toFixed(2)}`,
    `vueltas por bonus  ${report.avgFreeSpins.toFixed(1)}`,
    `marca mas alta     x${report.maxMultiplierSeen}`,
  ].join('\n')
}
