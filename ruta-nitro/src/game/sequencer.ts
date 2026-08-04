/**
 * Reproductor del guion de una ronda.
 *
 * El motor ya ha resuelto todo antes de que esto arranque: aqui solo se empuja
 * la rejilla visible etapa a etapa con su ritmo y su sonido. Un testigo
 * (`token`) invalida la reproduccion en curso si el jugador reinicia o
 * abandona, para que dos rondas no se pisen.
 */

import { audio } from './audio.ts'
import type { Stage } from './engine.ts'
import { playBuy, playRound } from './session.ts'
import { BUY_COST_X, useGame } from '@/store/useGame'

let token = 0

type Beat = 'spawn' | 'gears' | 'wins' | 'blast' | 'refill' | 'intro' | 'gap' | 'outro'

const PACE: Record<'normal' | 'turbo', Record<Beat, number>> = {
  normal: { spawn: 560, gears: 820, wins: 950, blast: 760, refill: 430, intro: 2400, gap: 480, outro: 2600 },
  turbo: { spawn: 220, gears: 300, wins: 340, blast: 300, refill: 170, intro: 1100, gap: 190, outro: 1300 },
}

/** Se consulta en cada espera para que el turbo tenga efecto a media tirada. */
const beat = (name: Beat) => PACE[useGame.getState().settings.turbo ? 'turbo' : 'normal'][name]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const alive = (mine: number) => mine === token

/** Corta la reproduccion en curso. */
export function abortPlayback() {
  token += 1
}

async function playStages(stages: readonly Stage[], carriedWin: number, mine: number): Promise<number> {
  let accumulated = carriedWin
  let depth = 0

  for (const stage of stages) {
    if (!alive(mine)) return accumulated

    useGame.setState({
      board: stage.board,
      multipliers: stage.multipliers,
      highlight: stage.kind === 'wins' ? (stage.removed ?? []) : [],
      clusters: stage.kind === 'wins' ? (stage.clusters ?? null) : null,
      gears: stage.kind === 'gears' ? (stage.gears ?? null) : null,
      blast: stage.kind === 'blast' ? (stage.blast ?? null) : null,
      stageWin: stage.win ?? 0,
    })

    switch (stage.kind) {
      case 'spawn':
        for (let column = 0; column < 6; column++) audio.land(column)
        break
      case 'gears':
        audio.gear()
        break
      case 'blast':
        audio.blast()
        break
      case 'wins': {
        depth += 1
        audio.cascade(depth)
        accumulated += stage.win ?? 0
        useGame.setState({ roundWin: accumulated })
        break
      }
      default:
        break
    }

    await sleep(beat(stage.kind))
  }

  return accumulated
}

/**
 * Juega una ronda entera: tirada base, serie de vueltas gratis si la hay, y
 * cierre. `mode` distingue el giro normal de la compra de la funcion.
 */
export async function runRound(mode: 'spin' | 'buy'): Promise<void> {
  const store = useGame.getState()
  const bet = store.bet
  const cost = mode === 'buy' ? bet * BUY_COST_X : bet

  const nonce = store.beginRound(cost)
  if (nonce === null) return

  const mine = ++token
  audio.unlock()
  audio.launch()

  const { serverSeed, clientSeed } = store.fair
  const options = { serverSeed, clientSeed, nonce, bet }
  const result = mode === 'buy' ? playBuy(options) : playRound(options)

  let won = 0

  if (mode === 'spin') {
    won = await playStages(result.base.stages, 0, mine)
    if (!alive(mine)) return
  }

  if (result.free.length > 0) {
    const spins = result.free[0].remaining
    useGame.setState({
      intro: { spins, upgrades: result.upgrades, scatters: result.base.scatters },
      highlight: [],
      clusters: null,
    })
    audio.fanfare()
    await sleep(beat('intro'))
    if (!alive(mine)) return
    useGame.setState({ intro: null })

    const baseWin = won
    let total = spins

    for (const entry of result.free) {
      if (!alive(mine)) return
      total = Math.max(total, entry.index + entry.remaining)

      useGame.setState({
        free: {
          index: entry.index + 1,
          remaining: entry.remaining,
          total,
          upgrades: result.upgrades,
          scatters: entry.result.scatters,
          win: won - baseWin,
        },
      })

      won = await playStages(entry.result.stages, won, mine)
      useGame.setState((state) => ({ free: state.free ? { ...state.free, win: won - baseWin } : null }))
      await sleep(beat('gap'))
    }

    if (!alive(mine)) return
    useGame.setState({ outro: { win: won - baseWin, spins: result.freeSpinCount } })
    audio.win(1)
    await sleep(beat('outro'))
    if (!alive(mine)) return
    useGame.setState({ outro: null, free: null })
  }

  if (!alive(mine)) return

  if (result.totalWin > 0) audio.win(Math.min(1, result.totalWin / (bet * 40)))
  else audio.lose()

  useGame.getState().finishRound(result, cost)
}
