import { NumberField } from './ui/NumberField'
import { audio } from '@/game/audio'
import { useT } from '@/hooks/useT'
import { useGame, type AutoMode } from '@/store/useGame'
import type { TranslationKey } from '@/i18n'

interface ProgressionProps {
  labelKey: TranslationKey
  mode: AutoMode
  percent: number
  disabled: boolean
  onChange: (value: { mode: AutoMode; percent: number }) => void
}

/** Regla de progresion (martingala y variantes) para victorias o derrotas. */
function Progression({ labelKey, mode, percent, disabled, onChange }: ProgressionProps) {
  const t = useT()

  return (
    <div className="rounded-lg border border-white/7 bg-black/25 p-2.5">
      <span className="mb-2 block text-[11px] font-medium tracking-wide text-abyss-300 uppercase">{t(labelKey)}</span>

      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {(['reset', 'increase'] as const).map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => {
              audio.ui()
              onChange({ mode: option, percent })
            }}
            className={`h-8 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-40 ${
              mode === option ? 'border border-jade-500/50 bg-jade-600/20 text-jade-300' : 'btn-ghost'
            }`}
          >
            {option === 'reset' ? t('auto.reset') : t('auto.increase')}
          </button>
        ))}
      </div>

      <NumberField
        value={percent}
        decimals={0}
        disabled={disabled || mode === 'reset'}
        ariaLabel={`${t(labelKey)} %`}
        onCommit={(value) => onChange({ mode, percent: Math.min(Math.max(value, 0), 1000) })}
        suffix={<span className="text-sm font-semibold text-abyss-400">%</span>}
      />
    </div>
  )
}

export function AutoPanel() {
  const t = useT()

  const auto = useGame((state) => state.auto)
  const configureAuto = useGame((state) => state.configureAuto)
  const running = auto.running

  return (
    <div className="mb-3 rounded-xl border border-white/8 bg-black/20 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-jade-400" />
        <h3 className="text-xs font-semibold tracking-widest text-abyss-200 uppercase">{t('auto.title')}</h3>
        {running && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-jade-600/20 px-2.5 py-0.5 text-[10.5px] font-semibold text-jade-300">
            <span className="size-1.5 animate-pulse rounded-full bg-jade-400" />
            {t('auto.running')}
          </span>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-white/7 bg-black/25 p-2.5">
          <span className="mb-2 block text-[11px] font-medium tracking-wide text-abyss-300 uppercase">
            {t('auto.rounds')}
          </span>
          <NumberField
            value={auto.rounds}
            decimals={0}
            disabled={running}
            ariaLabel={t('auto.rounds')}
            onCommit={(value) => configureAuto({ rounds: Math.min(Math.max(Math.round(value), 0), 10_000) })}
          />
          <p className="mt-1.5 text-[10.5px] text-abyss-500">
            {auto.rounds === 0 ? t('auto.infinite') : t('auto.remaining', { n: auto.rounds })}
          </p>
        </div>

        <Progression
          labelKey="auto.onWin"
          mode={auto.onWin.mode}
          percent={auto.onWin.percent}
          disabled={running}
          onChange={(value) => configureAuto({ onWin: value })}
        />

        <Progression
          labelKey="auto.onLoss"
          mode={auto.onLoss.mode}
          percent={auto.onLoss.percent}
          disabled={running}
          onChange={(value) => configureAuto({ onLoss: value })}
        />

        <div className="grid gap-2 rounded-lg border border-white/7 bg-black/25 p-2.5">
          <NumberField
            label={t('auto.stopProfit')}
            value={auto.stopProfit}
            disabled={running}
            onCommit={(value) => configureAuto({ stopProfit: Math.max(value, 0) })}
            prefix={<span className="text-sm font-semibold text-abyss-400">$</span>}
          />
          <NumberField
            label={t('auto.stopLoss')}
            value={auto.stopLoss}
            disabled={running}
            onCommit={(value) => configureAuto({ stopLoss: Math.max(value, 0) })}
            prefix={<span className="text-sm font-semibold text-abyss-400">$</span>}
          />
        </div>
      </div>
    </div>
  )
}
