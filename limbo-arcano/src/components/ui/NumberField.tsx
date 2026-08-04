import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

interface NumberFieldProps {
  value: number
  onCommit: (value: number) => void
  decimals?: number
  label?: string
  ariaLabel?: string
  prefix?: ReactNode
  suffix?: ReactNode
  disabled?: boolean
  className?: string
}

/**
 * Campo numerico con estado de texto propio.
 *
 * Reformatear mientras se escribe rompe la edicion (borrar el punto de "1.00"
 * lo reescribiria al instante), asi que el texto solo se normaliza al salir del
 * campo; el valor sube al store en cada pulsacion para que las previsiones de
 * pago se actualicen en vivo.
 */
export function NumberField({
  value,
  onCommit,
  decimals = 2,
  label,
  ariaLabel,
  prefix,
  suffix,
  disabled,
  className = '',
}: NumberFieldProps) {
  const id = useId()
  const [text, setText] = useState(() => value.toFixed(decimals))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(value.toFixed(decimals))
  }, [value, decimals])

  const handleChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
    setText(cleaned)
    const parsed = Number.parseFloat(cleaned)
    if (Number.isFinite(parsed)) onCommit(parsed)
  }

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-[11px] font-medium tracking-wide text-abyss-300 uppercase">
          {label}
        </label>
      )}
      <div
        className={`inset-field flex items-center gap-2 rounded-lg px-3 transition-colors focus-within:border-jade-500/50 ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        {prefix}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel ?? label}
          disabled={disabled}
          value={text}
          onFocus={(event) => {
            focused.current = true
            event.currentTarget.select()
          }}
          onBlur={() => {
            focused.current = false
            const parsed = Number.parseFloat(text)
            const next = Number.isFinite(parsed) ? parsed : 0
            onCommit(next)
            setText((Number.isFinite(parsed) ? next : value).toFixed(decimals))
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          onChange={(event) => handleChange(event.target.value)}
          className="tabular h-11 w-full min-w-0 bg-transparent text-[15px] font-semibold text-white outline-none"
        />
        {suffix}
      </div>
    </div>
  )
}
