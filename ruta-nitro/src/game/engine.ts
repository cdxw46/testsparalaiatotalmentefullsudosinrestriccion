/**
 * Motor de la tragaperras. No sabe nada de React ni del DOM.
 *
 * Una tirada se resuelve entera de golpe y devuelve el guion completo: la lista
 * de etapas por las que pasa la rejilla, con su estado despues de cada una. La
 * interfaz se limita a reproducir ese guion. Asi el resultado queda fijado antes
 * de que se mueva un pixel y las pruebas pueden simular millones de tiradas sin
 * navegador.
 *
 * Reglas del juego:
 *   - Paga por dispersion: ocho o mas simbolos iguales en cualquier posicion.
 *   - Cada casilla que participa en un premio deja una marca de neumatico con
 *     multiplicador x2, que se duplica si vuelve a ganar en el mismo sitio.
 *   - El premio de un grupo se multiplica por la SUMA de las marcas que pisa.
 *   - En el juego base las marcas se borran cada tirada; en vueltas gratis no.
 */

import { createRng, weightedPick, type Rng } from './fair.ts'
import {
  BASE_WEIGHTS,
  FREE_WEIGHTS,
  MIN_CLUSTER,
  PAY_SYMBOLS,
  isPaySymbol,
  payFor,
  type PaySymbol,
  type SymbolId,
} from './symbols.ts'

export const REELS = 6
export const ROWS = 5
export const CELLS = REELS * ROWS

/** Techo de una sola marca de neumatico. */
export const MAX_MULTIPLIER = 8192

/** Tope de pago de una tirada, en veces la apuesta. */
export const MAX_WIN_X = 30_000

/** Corta cascadas patologicas; en juego real nunca se acerca. */
const MAX_STAGES = 240

export const reelOf = (position: number) => Math.floor(position / ROWS)
export const rowOf = (position: number) => position % ROWS
export const positionAt = (reel: number, row: number) => reel * ROWS + row

export interface Cell {
  id: SymbolId
  /** Identidad estable de la ficha mientras siga en la rejilla. */
  uid: number
}

export type Board = Cell[]

export type Upgrade = 'infectious' | 'bigBomb' | 'doubleLap'

export const UPGRADES: readonly Upgrade[] = ['infectious', 'bigBomb', 'doubleLap']

export interface Cluster {
  symbol: PaySymbol
  positions: number[]
  count: number
  /** Pago de tabla en veces la apuesta, antes de multiplicadores. */
  basePay: number
  /** Suma de las marcas pisadas; 1 cuando no habia ninguna. */
  multiplier: number
  win: number
}

export interface GearReveal {
  /** Casillas donde cayo una marcha. */
  origins: number[]
  symbol: PaySymbol
  /** Casillas que la marcha convirtio, incluidas las de origen. */
  expanded: number[]
  /** Factor aplicado a la marca de cada origen: x2, x4 o x8. */
  boost: number
  /** Con rebufo, todas las copias del simbolo adoptan la marca del origen. */
  infected: number[]
}

export interface Blast {
  origins: number[]
  /** Casillas alcanzadas por la onda, incluidas las de los bidones. */
  hit: number[]
  /** 1 para 3x3, 2 para 5x5. */
  radius: number
}

export type StageKind = 'spawn' | 'gears' | 'wins' | 'blast' | 'refill'

export interface Stage {
  kind: StageKind
  /** Rejilla al terminar la etapa. */
  board: Board
  /** Marcas de neumatico al terminar la etapa. */
  multipliers: number[]
  /** Casillas que desapareceran en la siguiente etapa de relleno. */
  removed?: number[]
  clusters?: Cluster[]
  gears?: GearReveal
  blast?: Blast
  /** Premio otorgado en esta etapa, en moneda. */
  win?: number
}

export interface SpinInput {
  serverSeed: string
  clientSeed: string
  nonce: number
  bet: number
  mode: 'base' | 'free'
  upgrades?: readonly Upgrade[]
  /** Marcas heredadas de la tirada anterior; solo en vueltas gratis. */
  carry?: readonly number[]
  /**
   * Guardar el guion de etapas cuesta copiar la rejilla entera varias veces por
   * tirada. El simulador de RTP, que solo mira el premio, lo desactiva y gana
   * un orden de magnitud.
   */
  trace?: boolean
}

export interface FreeSpinsTrigger {
  spins: number
  upgrades: Upgrade[]
  scatters: number
}

export interface SpinResult {
  stages: Stage[]
  totalWin: number
  /** Dispersiones que quedaron en la rejilla al final de la tirada. */
  scatters: number
  /** Marcas al terminar, para encadenar la siguiente vuelta gratis. */
  multipliers: number[]
  /** Vueltas gratis abiertas por esta tirada, si las hubo. */
  trigger: FreeSpinsTrigger | null
  /** Vueltas extra concedidas por los simbolos de vuelta. */
  extraSpins: number
  /** Cierto si la tirada toco el tope de pago. */
  capped: boolean
  /** Cuantas veces pago la rejilla; se cuenta aunque no se guarde el guion. */
  cascades: number
}

/** Tamano de la pila que revela una marcha. */
const STACK_WEIGHTS = [
  [2, 55],
  [3, 30],
  [4, 15],
] as const

/** Factor con el que una marcha refuerza la marca de su casilla. */
const BOOST_WEIGHTS = [
  [2, 74],
  [4, 21],
  [8, 5],
] as const

const bumpMultiplier = (current: number) =>
  current === 0 ? 2 : Math.min(current * 2, MAX_MULTIPLIER)

function createBoard(rng: Rng, mode: 'base' | 'free', nextUid: () => number): Board {
  const weights = mode === 'free' ? FREE_WEIGHTS : BASE_WEIGHTS
  const board: Board = new Array(CELLS)
  for (let position = 0; position < CELLS; position++) {
    board[position] = { id: weightedPick(rng, weights), uid: nextUid() }
  }
  return board
}

/**
 * Aplica la gravedad dentro de cada columna y rellena por arriba. Las casillas
 * que sobreviven conservan su `uid`, que es lo que permite a la interfaz
 * animarlas cayendo en vez de recrearlas.
 */
function collapse(
  board: Board,
  removed: ReadonlySet<number>,
  rng: Rng,
  mode: 'base' | 'free',
  nextUid: () => number,
): Board {
  const weights = mode === 'free' ? FREE_WEIGHTS : BASE_WEIGHTS
  const next: Board = new Array(CELLS)

  for (let reel = 0; reel < REELS; reel++) {
    const survivors: Cell[] = []
    for (let row = 0; row < ROWS; row++) {
      const position = positionAt(reel, row)
      if (!removed.has(position)) survivors.push(board[position])
    }

    const missing = ROWS - survivors.length
    for (let row = 0; row < missing; row++) {
      next[positionAt(reel, row)] = { id: weightedPick(rng, weights), uid: nextUid() }
    }
    for (let index = 0; index < survivors.length; index++) {
      next[positionAt(reel, missing + index)] = survivors[index]
    }
  }

  return next
}

/**
 * Resuelve las marchas presentes en la rejilla.
 *
 * Todas las marchas de una misma caida revelan el mismo simbolo, tal y como
 * exige la mecanica original, y cada una lo expande sobre su columna. Devuelve
 * `null` si no habia ninguna.
 */
function resolveGears(
  board: Board,
  multipliers: number[],
  rng: Rng,
  infectious: boolean,
  nextUid: () => number,
): GearReveal | null {
  const origins = board.reduce<number[]>((found, cell, position) => {
    if (cell.id === 'gear') found.push(position)
    return found
  }, [])

  if (origins.length === 0) return null

  const symbol = rng.pick(PAY_SYMBOLS)
  const boost = weightedPick(rng, BOOST_WEIGHTS)
  const expanded = new Set<number>()

  for (const origin of origins) {
    const reel = reelOf(origin)
    const row = rowOf(origin)
    const stack = weightedPick(rng, STACK_WEIGHTS)

    // La pila crece hacia arriba desde la marcha y se recorta contra el borde.
    let top = row - Math.floor((stack - 1) / 2)
    top = Math.max(0, Math.min(top, ROWS - stack))

    for (let offset = 0; offset < stack; offset++) {
      const position = positionAt(reel, top + offset)
      board[position] = { id: symbol, uid: nextUid() }
      expanded.add(position)
    }

    multipliers[origin] = Math.min(Math.max(multipliers[origin], 1) * boost, MAX_MULTIPLIER)
  }

  const infected: number[] = []
  if (infectious) {
    // El rebufo duplica la marca de cada copia del simbolo que YA tenga una.
    // Sembrarla tambien en las casillas limpias, que era la lectura literal del
    // original, cubre la rejilla entera en dos vueltas y manda casi todos los
    // bonus al tope de pago; asi el rebufo amplifica lo que el jugador ya se ha
    // ganado en vez de regalar una rejilla nueva.
    for (let position = 0; position < CELLS; position++) {
      if (board[position].id !== symbol || expanded.has(position)) continue
      if (multipliers[position] === 0) continue
      multipliers[position] = Math.min(multipliers[position] * 2, MAX_MULTIPLIER)
      infected.push(position)
    }
  }

  return { origins, symbol, expanded: [...expanded], boost, infected }
}

/** Agrupa los simbolos que alcanzan el minimo, contando comodines. */
export function findClusters(board: Board, multipliers: number[], bet: number): Cluster[] {
  const buckets = new Map<PaySymbol, number[]>()
  const wilds: number[] = []

  for (let position = 0; position < CELLS; position++) {
    const id = board[position].id
    if (id === 'flag') {
      wilds.push(position)
      continue
    }
    if (!isPaySymbol(id)) continue
    const bucket = buckets.get(id)
    if (bucket) bucket.push(position)
    else buckets.set(id, [position])
  }

  const clusters: Cluster[] = []

  for (const [symbol, positions] of buckets) {
    // El comodin acompana a cualquier simbolo, asi que suma en todos los grupos.
    const all = wilds.length > 0 ? [...positions, ...wilds] : positions
    if (all.length < MIN_CLUSTER) continue

    const basePay = payFor(symbol, all.length)
    if (basePay === 0) continue

    const sum = all.reduce((total, position) => total + multipliers[position], 0)
    const multiplier = sum > 0 ? sum : 1

    clusters.push({
      symbol,
      positions: all,
      count: all.length,
      basePay,
      multiplier,
      win: basePay * bet * multiplier,
    })
  }

  return clusters.sort((a, b) => b.win - a.win)
}

/** Casillas alcanzadas por los bidones. Comodines y dispersiones aguantan. */
export function blastArea(board: Board, origins: readonly number[], radius: number): number[] {
  const hit = new Set<number>()

  for (const origin of origins) {
    const reel = reelOf(origin)
    const row = rowOf(origin)

    for (let r = reel - radius; r <= reel + radius; r++) {
      if (r < 0 || r >= REELS) continue
      for (let y = row - radius; y <= row + radius; y++) {
        if (y < 0 || y >= ROWS) continue
        hit.add(positionAt(r, y))
      }
    }
  }

  return [...hit].filter((position) => {
    const id = board[position].id
    return id !== 'flag' && id !== 'lights' && id !== 'lap'
  })
}

function countOf(board: Board, id: SymbolId): number {
  let total = 0
  for (const cell of board) if (cell.id === id) total += 1
  return total
}

function rollUpgrades(rng: Rng, amount: number): Upgrade[] {
  const pool = [...UPGRADES]
  const chosen: Upgrade[] = []
  for (let i = 0; i < amount && pool.length > 0; i++) {
    chosen.push(pool.splice(rng.int(pool.length), 1)[0])
  }
  return chosen
}

/** Vueltas concedidas segun cuantas dispersiones caigan. */
export function spinsForScatters(scatters: number): number {
  if (scatters >= 5) return 10
  if (scatters === 4) return 8
  return 7
}

export function spin(input: SpinInput): SpinResult {
  const { serverSeed, clientSeed, nonce, bet, mode } = input
  const upgrades = input.upgrades ?? []
  const rng = createRng(serverSeed, clientSeed, nonce)

  const infectious = upgrades.includes('infectious')
  const blastRadius = upgrades.includes('bigBomb') ? 2 : 1
  const lapValue = upgrades.includes('doubleLap') ? 2 : 1

  let uid = 0
  const nextUid = () => uid++

  const multipliers: number[] =
    mode === 'free' && input.carry ? [...input.carry] : new Array(CELLS).fill(0)

  const trace = input.trace ?? true
  const stages: Stage[] = []
  const record = (stage: Omit<Stage, 'board' | 'multipliers'> & { board: Board }) => {
    if (!trace) return
    stages.push({
      ...stage,
      board: stage.board.map((cell) => ({ ...cell })),
      multipliers: [...multipliers],
    })
  }

  let board = createBoard(rng, mode, nextUid)
  record({ kind: 'spawn', board })

  const gears = resolveGears(board, multipliers, rng, infectious, nextUid)
  if (gears) record({ kind: 'gears', board, gears })

  const maxWin = MAX_WIN_X * bet
  let totalWin = 0
  let capped = false
  let cascades = 0
  let guard = 0

  while (guard++ < MAX_STAGES) {
    const clusters = findClusters(board, multipliers, bet)

    if (clusters.length > 0) {
      const win = clusters.reduce((total, cluster) => total + cluster.win, 0)
      totalWin += win
      cascades += 1

      const removed = new Set<number>()
      for (const cluster of clusters) for (const position of cluster.positions) removed.add(position)

      // El premio usa las marcas actuales; solo despues suben de nivel.
      for (const position of removed) multipliers[position] = bumpMultiplier(multipliers[position])

      record({ kind: 'wins', board, clusters, win, removed: [...removed] })

      if (totalWin >= maxWin) {
        totalWin = maxWin
        capped = true
        break
      }

      board = collapse(board, removed, rng, mode, nextUid)
      record({ kind: 'refill', board })

      const dropped = resolveGears(board, multipliers, rng, infectious, nextUid)
      if (dropped) record({ kind: 'gears', board, gears: dropped })
      continue
    }

    // Sin premio en la rejilla, los bidones detonan para reabrir la jugada.
    const origins = board.reduce<number[]>((found, cell, position) => {
      if (cell.id === 'nitro') found.push(position)
      return found
    }, [])

    if (origins.length === 0) break

    const hit = blastArea(board, origins, blastRadius)
    for (const position of hit) multipliers[position] = bumpMultiplier(multipliers[position])

    record({ kind: 'blast', board, blast: { origins, hit, radius: blastRadius }, removed: hit })

    board = collapse(board, new Set(hit), rng, mode, nextUid)
    record({ kind: 'refill', board })

    const dropped = resolveGears(board, multipliers, rng, infectious, nextUid)
    if (dropped) record({ kind: 'gears', board, gears: dropped })
  }

  const scatters = countOf(board, 'lights')
  const extraSpins = countOf(board, 'lap') * lapValue

  let trigger: FreeSpinsTrigger | null = null
  if (mode === 'base' && scatters >= 3) {
    const spins = spinsForScatters(scatters)
    trigger = { spins, upgrades: rollUpgrades(rng, Math.min(scatters - 2, 3)), scatters }
  }

  return {
    stages,
    totalWin,
    scatters,
    multipliers,
    trigger,
    extraSpins,
    capped,
    cascades,
  }
}
