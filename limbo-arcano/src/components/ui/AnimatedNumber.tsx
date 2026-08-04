import { useEffect, useRef, useState } from 'react'

interface AnimatedNumberProps {
  value: number
  format: (value: number) => string
  duration?: number
  className?: string
}

/**
 * Interpola hasta el nuevo valor en lugar de saltar. Un saldo que sube contando
 * comunica la ganancia mucho mejor que un cambio instantaneo.
 */
export function AnimatedNumber({ value, format, duration = 620, className }: AnimatedNumberProps) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return

    const startedAt = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - (1 - progress) ** 3
      const current = from + (value - from) * eased
      setShown(current)
      fromRef.current = current

      if (progress < 1) rafRef.current = requestAnimationFrame(step)
      else fromRef.current = value
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return <span className={className}>{format(shown)}</span>
}
