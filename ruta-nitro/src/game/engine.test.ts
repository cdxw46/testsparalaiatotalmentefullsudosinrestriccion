import { describe, expect, it } from 'vitest'
import {
  CELLS,
  MAX_MULTIPLIER,
  MAX_WIN_X,
  REELS,
  ROWS,
  blastArea,
  findClusters,
  positionAt,
  rowOf,
  spin,
  spinsForScatters,
  type Board,
} from './engine'
import { createRng, sha256Hex } from './fair'
import { MIN_CLUSTER, PAYTABLE, payFor } from './symbols'
import type { SymbolId } from './symbols'

const SERVER = 'a'.repeat(64)
const CLIENT = 'piloto'

/** Rejilla de prueba a partir de una plantilla por columnas. */
function boardOf(fill: SymbolId, overrides: Record<number, SymbolId> = {}): Board {
  return Array.from({ length: CELLS }, (_, position) => ({
    id: overrides[position] ?? fill,
    uid: position,
  }))
}

describe('createRng', () => {
  it('produce el mismo flujo para las mismas semillas', () => {
    const a = createRng(SERVER, CLIENT, 4)
    const b = createRng(SERVER, CLIENT, 4)
    const first = Array.from({ length: 40 }, () => a.next())
    const second = Array.from({ length: 40 }, () => b.next())
    expect(first).toEqual(second)
  })

  it('cambia con el nonce y no repite el bloque al agotarlo', () => {
    const a = createRng(SERVER, CLIENT, 1)
    const b = createRng(SERVER, CLIENT, 2)
    expect(a.next()).not.toBe(b.next())

    // Ocho valores por bloque: el noveno obliga a pedir el siguiente HMAC.
    const stream = createRng(SERVER, CLIENT, 0)
    const values = Array.from({ length: 24 }, () => stream.next())
    expect(new Set(values).size).toBe(24)
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
  })
})

describe('payFor', () => {
  it('escalona el pago en tres tramos', () => {
    expect(payFor('scarlet', 7)).toBe(0)
    expect(payFor('scarlet', 8)).toBe(PAYTABLE.scarlet[0])
    expect(payFor('scarlet', 9)).toBe(PAYTABLE.scarlet[0])
    expect(payFor('scarlet', 10)).toBe(PAYTABLE.scarlet[1])
    expect(payFor('scarlet', 12)).toBe(PAYTABLE.scarlet[2])
    expect(payFor('scarlet', 30)).toBe(PAYTABLE.scarlet[2])
  })

  it('paga mas a los pilotos que a la chatarra del taller', () => {
    expect(PAYTABLE.scarlet[2]).toBeGreaterThan(PAYTABLE.tyre[2])
  })
})

describe('findClusters', () => {
  const noMultipliers = new Array(CELLS).fill(0)

  it('exige el minimo de coincidencias', () => {
    // El relleno de la plantilla forma su propio grupo, asi que la comprobacion
    // mira solo el simbolo bajo prueba.
    const scarlets: Record<number, SymbolId> = {}
    for (let i = 0; i < MIN_CLUSTER - 1; i++) scarlets[i] = 'scarlet'

    const short = findClusters(boardOf('cone', scarlets), noMultipliers, 1)
    expect(short.some((cluster) => cluster.symbol === 'scarlet')).toBe(false)

    scarlets[MIN_CLUSTER - 1] = 'scarlet'
    const exact = findClusters(boardOf('cone', scarlets), noMultipliers, 1)
    expect(exact.find((cluster) => cluster.symbol === 'scarlet')?.count).toBe(MIN_CLUSTER)
  })

  it('el comodin completa cualquier grupo', () => {
    const cells: Record<number, SymbolId> = {}
    for (let i = 0; i < 6; i++) cells[i] = 'baron'
    cells[6] = 'flag'
    cells[7] = 'flag'

    const cluster = findClusters(boardOf('cone', cells), noMultipliers, 1).find(
      (candidate) => candidate.symbol === 'baron',
    )

    expect(cluster?.count).toBe(8)
    expect(cluster?.positions).toContain(6)
  })

  it('suma las marcas pisadas y usa 1 cuando no hay ninguna', () => {
    const cells: Record<number, SymbolId> = {}
    for (let i = 0; i < 8; i++) cells[i] = 'tyre'
    const board = boardOf('cone', cells)

    const flat = findClusters(board, noMultipliers, 2).find((c) => c.symbol === 'tyre')
    expect(flat?.multiplier).toBe(1)
    expect(flat?.win).toBe(payFor('tyre', 8) * 2)

    const marked = [...noMultipliers]
    marked[0] = 4
    marked[1] = 8
    const boosted = findClusters(board, marked, 2).find((c) => c.symbol === 'tyre')
    expect(boosted?.multiplier).toBe(12)
    expect(boosted?.win).toBe(payFor('tyre', 8) * 2 * 12)
  })
})

describe('blastArea', () => {
  it('alcanza un cuadrado de 3x3 alrededor del bidon', () => {
    const board = boardOf('cone', { [positionAt(2, 2)]: 'nitro' })
    const hit = blastArea(board, [positionAt(2, 2)], 1)
    expect(hit).toHaveLength(9)
    expect(hit).toContain(positionAt(1, 1))
    expect(hit).toContain(positionAt(3, 3))
    expect(hit).not.toContain(positionAt(4, 2))
  })

  it('se recorta contra el borde de la rejilla', () => {
    const board = boardOf('cone', { [positionAt(0, 0)]: 'nitro' })
    expect(blastArea(board, [positionAt(0, 0)], 1)).toHaveLength(4)
  })

  it('la mejora amplia la onda a 5x5', () => {
    const board = boardOf('cone', { [positionAt(3, 2)]: 'nitro' })
    // Cinco columnas por las cinco filas de la rejilla.
    expect(blastArea(board, [positionAt(3, 2)], 2)).toHaveLength(5 * ROWS)
  })

  it('respeta comodines y dispersiones', () => {
    const centre = positionAt(2, 2)
    const board = boardOf('cone', {
      [centre]: 'nitro',
      [positionAt(1, 1)]: 'flag',
      [positionAt(3, 3)]: 'lights',
    })
    const hit = blastArea(board, [centre], 1)
    expect(hit).not.toContain(positionAt(1, 1))
    expect(hit).not.toContain(positionAt(3, 3))
    expect(hit).toContain(centre)
  })
})

describe('spin', () => {
  it('es reproducible a partir de las tres entradas', () => {
    const options = { serverSeed: SERVER, clientSeed: CLIENT, nonce: 12, bet: 1, mode: 'base' as const }
    expect(spin(options)).toEqual(spin(options))
  })

  it('cambia al cambiar cualquiera de las semillas', () => {
    const base = spin({ serverSeed: SERVER, clientSeed: CLIENT, nonce: 12, bet: 1, mode: 'base' })
    const other = spin({ serverSeed: SERVER, clientSeed: 'otro', nonce: 12, bet: 1, mode: 'base' })
    expect(other.stages[0].board.map((c) => c.id)).not.toEqual(base.stages[0].board.map((c) => c.id))
  })

  it('deja la rejilla siempre completa en todas las etapas', () => {
    for (let nonce = 0; nonce < 400; nonce++) {
      for (const stage of spin({ serverSeed: SERVER, clientSeed: CLIENT, nonce, bet: 1, mode: 'base' }).stages) {
        expect(stage.board).toHaveLength(CELLS)
        expect(stage.board.every((cell) => cell && cell.id)).toBe(true)
        expect(stage.multipliers).toHaveLength(CELLS)
      }
    }
  })

  it('nunca supera el techo de una marca ni el tope de pago', () => {
    for (let nonce = 0; nonce < 600; nonce++) {
      const result = spin({ serverSeed: SERVER, clientSeed: CLIENT, nonce, bet: 1, mode: 'base' })
      expect(Math.max(...result.multipliers)).toBeLessThanOrEqual(MAX_MULTIPLIER)
      expect(result.totalWin).toBeLessThanOrEqual(MAX_WIN_X)
    }
  })

  it('la gravedad conserva el orden de las fichas supervivientes', () => {
    // Tras un relleno, ninguna ficha puede haber subido de fila dentro de su columna.
    const result = spin({ serverSeed: SERVER, clientSeed: CLIENT, nonce: 3, bet: 1, mode: 'base' })

    for (let index = 1; index < result.stages.length; index++) {
      const previous = result.stages[index - 1]
      const current = result.stages[index]
      if (current.kind !== 'refill') continue

      for (let reel = 0; reel < REELS; reel++) {
        for (let row = 0; row < ROWS; row++) {
          const uid = current.board[positionAt(reel, row)].uid
          const before = previous.board.findIndex((cell) => cell.uid === uid)
          if (before === -1) continue
          expect(Math.floor(before / ROWS)).toBe(reel)
          expect(before % ROWS).toBeLessThanOrEqual(row)
        }
      }
    }
  })

  it('las marcas heredadas entran ya puestas en una vuelta gratis', () => {
    const carry = new Array(CELLS).fill(0)
    carry[7] = 16
    const result = spin({
      serverSeed: SERVER,
      clientSeed: CLIENT,
      nonce: 5,
      bet: 1,
      mode: 'free',
      carry,
    })
    expect(result.stages[0].multipliers[7]).toBe(16)
  })

  it('el juego base arranca siempre con el asfalto limpio', () => {
    const result = spin({ serverSeed: SERVER, clientSeed: CLIENT, nonce: 5, bet: 1, mode: 'base' })
    expect(result.stages[0].multipliers.every((value) => value === 0)).toBe(true)
  })

  it('las vueltas gratis solo se abren desde el juego base', () => {
    for (let nonce = 0; nonce < 2000; nonce++) {
      const free = spin({ serverSeed: SERVER, clientSeed: CLIENT, nonce, bet: 1, mode: 'free' })
      expect(free.trigger).toBeNull()
    }
  })

  it('reparte las vueltas segun las dispersiones y no repite mejora', () => {
    expect(spinsForScatters(3)).toBe(7)
    expect(spinsForScatters(4)).toBe(8)
    expect(spinsForScatters(5)).toBe(10)
    expect(spinsForScatters(6)).toBe(10)

    let checked = 0
    for (let nonce = 0; nonce < 6000 && checked < 20; nonce++) {
      const result = spin({ serverSeed: SERVER, clientSeed: CLIENT, nonce, bet: 1, mode: 'base' })
      if (!result.trigger) continue
      checked += 1
      expect(result.trigger.spins).toBe(spinsForScatters(result.scatters))
      expect(new Set(result.trigger.upgrades).size).toBe(result.trigger.upgrades.length)
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('el premio declarado cuadra con la suma de las etapas', () => {
    for (let nonce = 0; nonce < 500; nonce++) {
      const result = spin({ serverSeed: SERVER, clientSeed: CLIENT, nonce, bet: 3, mode: 'base' })
      if (result.capped) continue
      const staged = result.stages.reduce((total, stage) => total + (stage.win ?? 0), 0)
      expect(staged).toBeCloseTo(result.totalWin, 8)
    }
  })
})

describe('adelantamiento', () => {
  /** Recorre tiradas hasta dar con las que traen corredor. */
  const collect = (limit: number) => {
    const found: { row: number; symbol: string; positions: number[] }[] = []
    for (let nonce = 0; nonce < limit; nonce++) {
      const result = spin({ serverSeed: SERVER, clientSeed: CLIENT, nonce, bet: 1, mode: 'base' })
      const stage = result.stages.find((candidate) => candidate.kind === 'overtake')
      if (stage?.overtake) found.push(stage.overtake)
    }
    return found
  }

  it('deja la fila entera del mismo simbolo', () => {
    const events = collect(400)
    expect(events.length).toBeGreaterThan(0)

    for (const event of events) {
      expect(event.positions.length).toBeGreaterThan(0)
      for (const position of event.positions) {
        expect(rowOf(position)).toBe(event.row)
      }
      // Una fila son seis casillas; solo comodines y dispersiones se libran.
      expect(event.positions.length).toBeLessThanOrEqual(REELS)
    }
  })

  it('aparece con la frecuencia de diseno', () => {
    const events = collect(4000)
    // Configurado al 9%; se deja holgura por la varianza de la muestra.
    expect(events.length / 4000).toBeGreaterThan(0.05)
    expect(events.length / 4000).toBeLessThan(0.13)
  })

  it('no pisa comodines ni dispersiones', () => {
    for (let nonce = 0; nonce < 400; nonce++) {
      const result = spin({ serverSeed: SERVER, clientSeed: CLIENT, nonce, bet: 1, mode: 'base' })
      const index = result.stages.findIndex((candidate) => candidate.kind === 'overtake')
      if (index <= 0) continue

      const before = result.stages[index - 1].board
      const after = result.stages[index].board
      for (let position = 0; position < CELLS; position++) {
        const previous = before[position].id
        if (previous === 'flag' || previous === 'lights') expect(after[position].id).toBe(previous)
      }
    }
  })
})

describe('compromiso de la semilla', () => {
  it('el hash publicado corresponde a la semilla revelada', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
