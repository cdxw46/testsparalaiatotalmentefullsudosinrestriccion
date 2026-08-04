import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import './grid.css'
import scarlet from '@/assets/cars/scarlet.webp'
import { ACCENT, ART } from '@/game/art'
import { triplet } from '@/game/color'
import { CELLS, REELS, ROWS, positionAt, reelOf, rowOf, type Board } from '@/game/engine'
import { useGame } from '@/store/useGame'

/** Rejilla en reposo, para que la mesa nunca se vea vacia antes del primer giro. */
const RESTING: Board = Array.from({ length: CELLS }, (_, position) => ({
  id: (['tyre', 'cone', 'plug', 'wrench', 'can', 'rust', 'duchess', 'baron', 'scarlet'] as const)[
    (position * 5 + Math.floor(position / ROWS)) % 9
  ],
  uid: -position - 1,
}))

const SPECIALS = new Set(['flag', 'lights', 'nitro', 'gear', 'lap'])

/** Color de la marca segun lo alta que sea: de ambar a rojo incandescente. */
function markAccent(value: number): string {
  if (value >= 512) return '255 90 43'
  if (value >= 64) return '255 138 76'
  if (value >= 8) return '255 190 77'
  return '245 166 35'
}

/**
 * Retraso de caida por columna.
 *
 * Las columnas asientan una detras de otra, y cuando ya han caido dos
 * dispersiones las que faltan se hacen esperar: es la pausa de tension clasica
 * de las tragaperras, y no cuesta nada porque el resultado ya esta decidido.
 */
function dropPlan(board: Board) {
  const delays = new Array<number>(REELS).fill(0)
  const anticipating = new Array<boolean>(REELS).fill(false)

  let scatters = 0
  let extra = 0

  for (let reel = 0; reel < REELS; reel++) {
    const anticipate = scatters >= 2
    anticipating[reel] = anticipate
    if (anticipate) extra += 0.45

    delays[reel] = reel * 0.075 + extra

    for (let row = 0; row < ROWS; row++) {
      if (board[positionAt(reel, row)].id === 'lights') scatters += 1
    }
  }

  return { delays, anticipating }
}

export function Grid() {
  const board = useGame((state) => state.board) ?? RESTING
  const multipliers = useGame((state) => state.multipliers)
  const highlight = useGame((state) => state.highlight)
  const blast = useGame((state) => state.blast)
  const gears = useGame((state) => state.gears)
  const overtake = useGame((state) => state.overtake)
  const idle = useGame((state) => state.board === null)

  const winning = useMemo(() => new Set(highlight), [highlight])
  const blasted = useMemo(() => new Set(blast?.hit ?? []), [blast])
  const expanded = useMemo(() => new Set(gears?.expanded ?? []), [gears])
  const { delays, anticipating } = useMemo(() => dropPlan(board), [board])

  return (
    <div className="nitro-grid">
      <AnimatePresence initial={false}>
        {board.map((cell, position) => {
          const reel = reelOf(position)
          const mark = multipliers[position] ?? 0

          return (
            <motion.div
              key={cell.uid}
              layout
              className="nitro-cell"
              data-win={winning.has(position) || undefined}
              data-special={SPECIALS.has(cell.id) || undefined}
              data-mark={mark > 0 || undefined}
              data-wait={anticipating[reel] || undefined}
              style={
                {
                  gridColumn: reel + 1,
                  gridRow: rowOf(position) + 1,
                  '--accent': triplet(ACCENT[cell.id]),
                  '--mark-accent': markAccent(mark),
                } as React.CSSProperties
              }
              initial={{ opacity: 0, y: '-160%' }}
              animate={{ opacity: idle ? 0.6 : 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.35, transition: { duration: 0.18 } }}
              transition={{
                layout: { type: 'spring', stiffness: 300, damping: 26 },
                // Rebote corto al asentar: la ficha llega, se hunde y sube.
                default: { type: 'spring', stiffness: 210, damping: 17, delay: delays[reel] },
              }}
            >
              <span className="nitro-glow" />
              <img className="nitro-symbol" src={ART[cell.id]} alt="" draggable={false} />
              {blasted.has(position) && <span className="nitro-blast" />}
              {expanded.has(position) && <span className="nitro-gear-trail" />}
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* Las marcas pertenecen a la posicion, no a la ficha: capa propia y fija. */}
      {multipliers.map((value, position) =>
        value > 0 ? (
          <motion.div
            key={`mark-${position}`}
            className="nitro-mark"
            style={
              {
                gridColumn: reelOf(position) + 1,
                gridRow: rowOf(position) + 1,
                '--mark-accent': markAccent(value),
              } as React.CSSProperties
            }
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          >
            <span className="nitro-mark-skid" />
            <span className="nitro-mark-value tabular">x{value}</span>
          </motion.div>
        ) : null,
      )}

      {overtake && (
        <div
          key={`overtake-${overtake.row}-${overtake.symbol}`}
          className="nitro-overtake"
          style={{ gridColumn: '1 / -1', gridRow: overtake.row + 1 }}
        >
          <span className="nitro-overtake-streak" />
          <img className="nitro-overtake-car" src={scarlet} alt="" draggable={false} />
        </div>
      )}
    </div>
  )
}
