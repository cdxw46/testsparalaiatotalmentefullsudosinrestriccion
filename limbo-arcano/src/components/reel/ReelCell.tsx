import { memo } from 'react'
import { triplet } from '@/game/color'
import { formatMultiplier } from '@/game/format'
import { tierFor } from '@/game/tiers'

interface ReelCellProps {
  index: number
  offset: number
  multiplier: number
  register: (index: number, element: HTMLDivElement | null) => void
}

/**
 * Una casilla del carrusel. Es `memo` a proposito: durante un giro se recorren
 * decenas de casillas y ninguna cambia de contenido, solo la variable `--k` que
 * escribe el bucle de animacion directamente sobre el nodo.
 */
export const ReelCell = memo(function ReelCell({ index, offset, multiplier, register }: ReelCellProps) {
  const tier = tierFor(multiplier)

  return (
    <div
      ref={(element) => register(index, element)}
      className="reel-cell"
      style={
        {
          left: `calc(var(--cell-w) * ${offset})`,
          '--accent': triplet(tier.accent),
          '--deep': triplet(tier.deep),
          '--f1': triplet(tier.frame[0]),
          '--f2': triplet(tier.frame[1]),
          '--f3': triplet(tier.frame[2]),
        } as React.CSSProperties
      }
    >
      <div className="reel-arch">
        <span className="reel-finial" />
        <div className="reel-niche">
          <span className="reel-aura" />
          <img className="reel-art" src={tier.art} alt="" draggable={false} loading="lazy" decoding="async" />
          <span className="reel-floor" />
          <span className="reel-glass" />
        </div>
      </div>
      <div className="reel-plate">{formatMultiplier(multiplier)}</div>
    </div>
  )
})
