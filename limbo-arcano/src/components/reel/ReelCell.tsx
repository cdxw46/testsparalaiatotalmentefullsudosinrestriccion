import { memo } from 'react'
import { triplet } from '@/game/color'
import { formatMultiplier } from '@/game/format'
import { TIERS, tierFor } from '@/game/tiers'

// Solo hay siete retratos y pesan unos 50 kB. Se descargan y ademas se
// descodifican por adelantado: con la descarga sola, el navegador puede pintar
// un fotograma con la casilla vacia mientras termina de descodificar, y a
// velocidad de giro eso se ve como un nicho en blanco.
if (typeof Image !== 'undefined') {
  for (const tier of TIERS) {
    const image = new Image()
    image.src = tier.art
    void image.decode?.().catch(() => undefined)
  }
}

/** Las cifras largas ("25,019.88x") no caben a tamano completo en la placa. */
function plateScale(label: string): number {
  if (label.length <= 6) return 1
  if (label.length <= 8) return 0.87
  return 0.74
}

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
  const label = formatMultiplier(multiplier)

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
          <img className="reel-art" src={tier.art} alt="" draggable={false} />
          <span className="reel-floor" />
          <span className="reel-glass" />
        </div>
      </div>
      <div className="reel-plate" style={{ '--plate-scale': plateScale(label) } as React.CSSProperties}>
        {label}
      </div>
    </div>
  )
})
