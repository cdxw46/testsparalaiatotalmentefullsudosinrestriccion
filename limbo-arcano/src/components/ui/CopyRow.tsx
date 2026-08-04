import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { copyText } from '@/game/clipboard'
import { useT } from '@/hooks/useT'

interface CopyRowProps {
  label: string
  value: string
  hint?: string
  mono?: boolean
}

export function CopyRow({ label, value, hint, mono = true }: CopyRowProps) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-abyss-300 uppercase">{label}</span>
      <div className="inset-field flex items-center gap-2 rounded-lg px-3 py-2.5">
        <code className={`min-w-0 flex-1 truncate text-[12.5px] text-white ${mono ? 'font-mono' : ''}`}>{value}</code>
        <button
          type="button"
          aria-label={t('fair.copy')}
          onClick={async () => setCopied(await copyText(value))}
          className={`grid size-7 shrink-0 place-items-center rounded-md transition-colors ${
            copied ? 'bg-jade-600/25 text-jade-300' : 'btn-ghost'
          }`}
        >
          <Icon name={copied ? 'check' : 'copy'} className="size-3.5" />
        </button>
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-abyss-500">{copied ? t('fair.copied') : hint}</p>}
    </div>
  )
}
