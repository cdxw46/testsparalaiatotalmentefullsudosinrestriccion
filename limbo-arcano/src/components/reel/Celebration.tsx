import { useMemo } from 'react'
import { triplet } from '@/game/color'

export interface Flash {
  id: number
  win: boolean
  tierIndex: number
  accent: string
}

interface Spark {
  id: number
  left: number
  drift: number
  delay: number
  duration: number
  size: number
}

/**
 * Remate visual del aterrizaje: onda expansiva, tinte del nicho y una lluvia de
 * chispas cuya cantidad crece con el escalon. Todo se remonta al cambiar la
 * clave del `flash`, asi que no hace falta limpiar nada a mano.
 */
export function Celebration({ flash }: { flash: Flash }) {
  const sparks = useMemo<Spark[]>(() => {
    if (!flash.win) return []
    const count = 12 + flash.tierIndex * 9
    return Array.from({ length: count }, (_, id) => ({
      id,
      left: (Math.random() - 0.5) * 46,
      drift: (Math.random() - 0.5) * 170,
      delay: Math.random() * 0.22,
      duration: 0.85 + Math.random() * 0.9,
      size: 3 + Math.random() * 6,
    }))
  }, [flash.win, flash.tierIndex])

  const accent = triplet(flash.accent)
  const intensity = flash.win ? 0.35 + flash.tierIndex * 0.09 : 0.2

  return (
    <div
      className="reel-celebration"
      style={{ '--accent': flash.win ? accent : '244 63 94', '--power': intensity } as React.CSSProperties}
    >
      <span className="reel-shock" />
      <span className="reel-tint" />
      {sparks.map((spark) => (
        <span
          key={spark.id}
          className="reel-spark"
          style={
            {
              '--drift-x': `${spark.drift}px`,
              left: `calc(50% + ${spark.left}px)`,
              width: `${spark.size}px`,
              height: `${spark.size}px`,
              animationDelay: `${spark.delay}s`,
              animationDuration: `${spark.duration}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
