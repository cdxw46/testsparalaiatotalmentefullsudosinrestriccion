import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import './grid.css'
import { ART, ACCENT } from '@/game/art'
import { REELS, ROWS, CELLS, reelOf, rowOf, type Board } from '@/game/engine'
import { triplet } from '@/game/color'
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

export function Grid() {
  const board = useGame((state) => state.board) ?? RESTING
  const multipliers = useGame((state) => state.multipliers)
  const highlight = useGame((state) => state.highlight)
  const blast = useGame((state) => state.blast)
  const gears = useGame((state) => state.gears)
  const idle = useGame((state) => state.board === null)

  const winning = useMemo(() => new Set(highlight), [highlight])
  const blasted = useMemo(() => new Set(blast?.hit ?? []), [blast])
  const expanded = useMemo(() => new Set(gears?.expanded ?? []), [gears])

  return (
    <div className="nitro-grid">
      <AnimatePresence initial={false}>
        {board.map((cell, position) => {
          const accent = triplet(ACCENT[cell.id])
          const special = SPECIALS.has(cell.id)

          return (
            <motion.div
              key={cell.uid}
              layout
              className="nitro-cell"
              data-win={winning.has(position) || undefined}
              data-special={special || undefined}
              style={
                {
                  gridColumn: reelOf(position) + 1,
                  gridRow: rowOf(position) + 1,
                  '--accent': accent,
                  opacity: idle ? 0.55 : 1,
                } as React.CSSProperties
              }
              initial={{ opacity: 0, y: '-120%' }}
              animate={{ opacity: idle ? 0.55 : 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{
                layout: { type: 'spring', stiffness: 460, damping: 34 },
                default: { type: 'spring', stiffness: 380, damping: 28 },
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

      {/* Las marcas viven en la posicion, no en la ficha: capa aparte y fija. */}
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
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
          >
            <span className="nitro-mark-skid" />
            <span className="nitro-mark-value tabular">x{value}</span>
          </motion.div>
        ) : null,
      )}
    </div>
  )
}

export { REELS, ROWS }
