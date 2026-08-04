import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './reel.css'
import { ReelCell } from './ReelCell'
import { Celebration } from './Celebration'
import { audio } from '@/game/audio'
import { triplet } from '@/game/color'
import { fillerMultiplier } from '@/game/reel'
import { TIERS, tierFor } from '@/game/tiers'
import { useGame } from '@/store/useGame'

/** Casillas visibles a la izquierda del centro al empezar un giro. */
const CELLS_BEHIND = 8
/** Ventana renderizada: cubre el recorrido mas largo posible con margen. */
const CELLS_RENDERED = 52
/** El carrusel avanza siempre hacia delante; el mapa de resultados se poda. */
const OVERRIDE_LIMIT = 240

interface SpinPlan {
  multiplier: number
  win: boolean
  duration: number
  /** Casillas que la tira se pasa de largo antes de encajar. */
  overshoot: number
}

/**
 * Lo que hace falta para pintar la tira. `target` y `multiplier` viven aqui, y
 * no en una ref, porque el resultado en curso forma parte de lo que se
 * renderiza: la casilla de destino debe existir ya con su valor cuando arranca
 * la animacion.
 */
interface Layout {
  start: number
  spinId: string
  target: number
  multiplier: number
}

interface Flash {
  id: number
  win: boolean
  tierIndex: number
  accent: string
}

/** Deceleracion larga tipo tragaperras: casi todo el recorrido en el primer tercio. */
const easeSpin = (t: number) => 1 - (1 - t) ** 5

/** Rebase final: la tira pasa un poco de largo y vuelve a encajar. */
function settleBump(t: number): number {
  const w = Math.max(0, (t - 0.55) / 0.45)
  return Math.sin(w * Math.PI) * (1 - w) ** 0.35
}

export function Reel() {
  const pending = useGame((state) => state.pending)
  const settle = useGame((state) => state.settle)
  const turbo = useGame((state) => state.settings.turbo)

  const viewportRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const cellsRef = useRef(new Map<number, HTMLDivElement>())
  const overridesRef = useRef(new Map<number, number>())
  const saltRef = useRef(Math.floor(Math.random() * 0x7fffffff))
  const planRef = useRef<SpinPlan | null>(null)

  const posRef = useRef(0)
  const lastPosRef = useRef(0)
  const lastCellRef = useRef(0)
  const litRef = useRef<number[]>([])
  const startRef = useRef(-CELLS_BEHIND)
  const cellWRef = useRef(0)
  const rafRef = useRef(0)

  const [cellW, setCellW] = useState(0)
  const [layout, setLayout] = useState<Layout>({ start: -CELLS_BEHIND, spinId: '', target: 0, multiplier: 0 })
  const [flash, setFlash] = useState<Flash | null>(null)

  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const register = useCallback((index: number, element: HTMLDivElement | null) => {
    if (element) cellsRef.current.set(index, element)
    else cellsRef.current.delete(index)
  }, [])

  /** Escribe posicion, desenfoque y foco directamente en el DOM, sin re-render. */
  const paint = useCallback(() => {
    const strip = stripRef.current
    const width = cellWRef.current
    if (!strip || !width) return

    const position = posRef.current
    strip.style.transform = `translate3d(${(-(position - startRef.current) * width).toFixed(2)}px, 0, 0)`

    const speed = Math.abs(position - lastPosRef.current)
    strip.style.filter = speed > 0.06 && !reducedMotion ? `blur(${Math.min(speed * 8, 6).toFixed(1)}px)` : ''

    const center = Math.round(position)
    const lit: number[] = []

    for (let index = center - 2; index <= center + 2; index++) {
      const element = cellsRef.current.get(index)
      if (!element) continue
      const proximity = Math.max(0, 1 - Math.abs(index - position) / 1.3)
      element.style.setProperty('--k', proximity.toFixed(3))
      element.style.zIndex = proximity > 0.02 ? String(10 + Math.round(proximity * 12)) : ''
      lit.push(index)
    }

    for (const index of litRef.current) {
      if (lit.includes(index)) continue
      const element = cellsRef.current.get(index)
      if (!element) continue
      element.style.setProperty('--k', '0')
      element.style.zIndex = ''
    }

    litRef.current = lit
    lastPosRef.current = position
  }, [reducedMotion])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      // La casilla se dimensiona por altura para conservar la silueta del nicho,
      // pero se limita por ancho para que siempre quepan al menos cuatro.
      const next = Math.round(Math.max(72, Math.min(height * 0.44, width / 4.35)))
      setCellW(next)
    })

    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    cellWRef.current = cellW
    startRef.current = layout.start
    paint()
  }, [cellW, layout.start, paint])

  useEffect(() => {
    if (!pending) return

    const from = Math.round(posRef.current)
    const travel = reducedMotion
      ? 2
      : turbo
        ? 5 + Math.floor(Math.random() * 4)
        : 18 + Math.floor(Math.random() * 9)

    planRef.current = {
      multiplier: pending.multiplier,
      win: pending.win,
      duration: reducedMotion ? 260 : turbo ? 470 : 2500,
      overshoot: reducedMotion ? 0 : turbo ? 0.26 : 0.45,
    }

    setLayout({
      start: from - CELLS_BEHIND,
      spinId: pending.id,
      target: from + travel,
      multiplier: pending.multiplier,
    })
  }, [pending, turbo, reducedMotion])

  const land = useCallback(
    (target: number, plan: SpinPlan) => {
      // El resultado pasa a ser historia de la tira: sobrevive al siguiente giro.
      overridesRef.current.set(target, plan.multiplier)
      if (overridesRef.current.size > OVERRIDE_LIMIT) {
        const oldest = overridesRef.current.keys().next().value
        if (oldest !== undefined) overridesRef.current.delete(oldest)
      }

      const tier = tierFor(plan.multiplier)
      const tierIndex = TIERS.findIndex((candidate) => candidate.id === tier.id)

      audio.land()
      if (plan.win) {
        audio.win(tierIndex / (TIERS.length - 1))
        if (tierIndex >= 5) audio.jackpot()
      } else {
        audio.lose()
      }

      setFlash({ id: Date.now(), win: plan.win, tierIndex, accent: tier.accent })
      settle()
    },
    [settle],
  )

  useEffect(() => {
    const plan = planRef.current
    if (!layout.spinId || !plan) return

    const from = posRef.current
    const target = layout.target
    const distance = target - from
    const startedAt = performance.now()

    audio.launch()

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / plan.duration)
      posRef.current = from + distance * easeSpin(progress) + plan.overshoot * settleBump(progress)
      paint()

      const cell = Math.round(posRef.current)
      if (cell !== lastCellRef.current) {
        lastCellRef.current = cell
        audio.tick(Math.min(1, Math.abs(posRef.current - lastPosRef.current) / 0.7))
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
        return
      }

      posRef.current = target
      paint()
      land(target, plan)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [layout.spinId, layout.target, paint, land])

  const cells = useMemo(() => {
    const list: { index: number; offset: number; multiplier: number }[] = []
    for (let offset = 0; offset < CELLS_RENDERED; offset++) {
      const index = layout.start + offset
      const value =
        index === layout.target && layout.spinId
          ? layout.multiplier
          : (overridesRef.current.get(index) ?? fillerMultiplier(index, saltRef.current))
      list.push({ index, offset, multiplier: value })
    }
    return list
  }, [layout])

  const needleAccent = flash ? triplet(flash.accent) : '255 255 255'

  return (
    <div
      ref={viewportRef}
      className="reel-viewport"
      style={{ '--cell-w': `${cellW}px`, '--needle-accent': needleAccent } as React.CSSProperties}
    >
      <div ref={stripRef} className="reel-strip">
        {cells.map((cell) => (
          <ReelCell
            key={cell.index}
            index={cell.index}
            offset={cell.offset}
            multiplier={cell.multiplier}
            register={register}
          />
        ))}
      </div>

      <span className="reel-edge reel-edge-left" />
      <span className="reel-edge reel-edge-right" />

      <div className="reel-needle">
        <span className="reel-needle-shaft" />
        <span className="reel-needle-head" />
        <span className="reel-needle-foot" />
      </div>

      {/* La clave fuerza un remontaje: cada aterrizaje reinicia las animaciones. */}
      {flash && <Celebration key={flash.id} flash={flash} />}
    </div>
  )
}
