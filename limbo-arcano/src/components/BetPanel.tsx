import { AnimatePresence, motion } from 'motion/react'
import { AutoPanel } from './AutoPanel'
import { Icon } from './ui/Icon'
import { NumberField } from './ui/NumberField'
import { Toggle } from './ui/Toggle'
import { audio } from '@/game/audio'
import { formatChance, formatMoney, formatMultiplier } from '@/game/format'
import { winChance } from '@/game/fair'
import { useT } from '@/hooks/useT'
import { MIN_BET, useGame } from '@/store/useGame'

const QUICK_BETS = ['min', 'half', 'double', 'max'] as const
const TARGET_PRESETS = [1.5, 2, 3, 5, 10, 100]

export function BetPanel() {
  const t = useT()

  const bet = useGame((state) => state.bet)
  const target = useGame((state) => state.target)
  const balance = useGame((state) => state.balance)
  const phase = useGame((state) => state.phase)
  const autoMode = useGame((state) => state.settings.autoMode)
  const autoRunning = useGame((state) => state.auto.running)
  const autoRemaining = useGame((state) => state.auto.remaining)
  const autoRounds = useGame((state) => state.auto.rounds)

  const setBet = useGame((state) => state.setBet)
  const adjustBet = useGame((state) => state.adjustBet)
  const setTarget = useGame((state) => state.setTarget)
  const nudgeTarget = useGame((state) => state.nudgeTarget)
  const roll = useGame((state) => state.roll)
  const setSetting = useGame((state) => state.setSetting)
  const startAuto = useGame((state) => state.startAuto)
  const stopAuto = useGame((state) => state.stopAuto)

  const rolling = phase === 'rolling'
  const chance = winChance(target)
  const payout = Math.round(bet * target * 100) / 100
  const insufficient = bet > balance

  const primaryDisabled = (rolling && !autoRunning) || (insufficient && !autoRunning)

  const handlePrimary = () => {
    audio.unlock()
    if (autoMode) {
      if (autoRunning) stopAuto()
      else startAuto()
      return
    }
    if (!rolling) roll()
  }

  const primaryLabel = autoMode
    ? autoRunning
      ? t('auto.stop')
      : t('auto.start')
    : rolling
      ? t('bet.rolling')
      : t('bet.roll')

  return (
    <section className="glass rounded-2xl p-3 sm:p-4">
      <AnimatePresence initial={false}>
        {autoMode && (
          <motion.div
            key="auto"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <AutoPanel />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,15rem)] lg:gap-4">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium tracking-wide text-abyss-300 uppercase">{t('bet.amount')}</span>
            <span className="tabular text-[11px] text-abyss-400">
              {t('hud.balance')} <span className="text-abyss-200">${formatMoney(balance)}</span>
            </span>
          </div>

          <NumberField
            value={bet}
            onCommit={setBet}
            ariaLabel={t('bet.amount')}
            disabled={autoRunning}
            prefix={
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-jade-600/25 text-[11px] font-bold text-jade-400">
                $
              </span>
            }
          />

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {QUICK_BETS.map((kind) => (
              <button
                key={kind}
                type="button"
                disabled={autoRunning}
                onClick={() => {
                  audio.ui()
                  adjustBet(kind)
                }}
                className="btn-ghost h-8 rounded-md text-[11px] font-bold tracking-wider disabled:opacity-40"
              >
                {kind === 'min' ? t('bet.min') : kind === 'half' ? t('bet.half') : kind === 'double' ? t('bet.double') : t('bet.max')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium tracking-wide text-abyss-300 uppercase">
              {t('bet.multiplier')}
            </span>
            <span className="tabular text-[11px] text-abyss-400">
              {t('bet.chance')} <span className="text-jade-400">{formatChance(chance)}</span>
            </span>
          </div>

          <div className="flex gap-1.5">
            <NumberField
              value={target}
              onCommit={setTarget}
              ariaLabel={t('bet.multiplier')}
              disabled={autoRunning}
              className="min-w-0 flex-1"
              suffix={<span className="text-sm font-semibold text-abyss-400">x</span>}
            />
            <button
              type="button"
              aria-label="-"
              disabled={autoRunning}
              onClick={() => {
                audio.ui()
                nudgeTarget(-1)
              }}
              className="btn-ghost grid h-11 w-10 shrink-0 place-items-center rounded-lg disabled:opacity-40"
            >
              <Icon name="minus" className="size-4" />
            </button>
            <button
              type="button"
              aria-label="+"
              disabled={autoRunning}
              onClick={() => {
                audio.ui()
                nudgeTarget(1)
              }}
              className="btn-ghost grid h-11 w-10 shrink-0 place-items-center rounded-lg disabled:opacity-40"
            >
              <Icon name="plus" className="size-4" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {TARGET_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={autoRunning}
                onClick={() => {
                  audio.ui()
                  setTarget(preset)
                }}
                className={`h-8 rounded-md text-[11px] font-bold tabular transition-colors disabled:opacity-40 ${
                  Math.abs(target - preset) < 0.005
                    ? 'border border-jade-500/50 bg-jade-600/20 text-jade-300'
                    : 'btn-ghost'
                }`}
              >
                {preset}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium tracking-wide text-abyss-300 uppercase">{t('bet.auto')}</span>
            <Toggle
              checked={autoMode}
              label={t('auto.title')}
              onChange={(value) => {
                audio.toggle(value)
                if (!value && autoRunning) stopAuto()
                setSetting('autoMode', value)
              }}
            />
          </div>

          <button
            type="button"
            onClick={handlePrimary}
            disabled={primaryDisabled}
            className={`roll-btn h-[4.7rem] w-full lg:h-full lg:min-h-[6.6rem] ${autoRunning ? 'is-stop' : ''}`}
          >
            <span className="roll-sheen" />
            <span className="relative flex items-center justify-center gap-2">
              <Icon name={autoRunning ? 'stop' : 'dice'} className="size-5" strokeWidth={2} />
              <span className="font-display text-lg font-bold tracking-wide">{primaryLabel}</span>
            </span>
            {autoRunning && autoRounds > 0 && (
              <span className="relative mt-0.5 block text-[11px] font-semibold text-black/70">
                {t('auto.remaining', { n: autoRemaining })}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-white/6 pt-2.5 text-[11.5px]">
        <span className="flex items-center gap-1.5 text-abyss-400">
          <Icon name="help" className="size-3.5" />
          {bet === 0 ? t('bet.zeroBet') : t('bet.rangeHint', { min: `$${formatMoney(MIN_BET)}`, max: `$${formatMoney(balance)}` })}
        </span>
        <span className="ml-auto flex items-center gap-4 tabular">
          <span className="text-abyss-400">
            {t('bet.payout')} <span className="font-semibold text-white">${formatMoney(payout)}</span>
          </span>
          <span className="text-abyss-400">
            {t('bet.profit')}{' '}
            <span className="font-semibold text-jade-400">+${formatMoney(Math.max(payout - bet, 0))}</span>
          </span>
          <span className="hidden text-abyss-500 sm:inline">{formatMultiplier(target)}</span>
        </span>
      </div>

      {insufficient && (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-rose-400">
          <Icon name="warning" className="size-3.5" />
          {t('bet.noFunds')}
        </p>
      )}
    </section>
  )
}
