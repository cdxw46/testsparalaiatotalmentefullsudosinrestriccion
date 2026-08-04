import { AnimatePresence, motion } from 'motion/react'
import { triplet } from '@/game/color'
import { formatMultiplier } from '@/game/format'
import { tierFor } from '@/game/tiers'
import { useT } from '@/hooks/useT'
import { useGame } from '@/store/useGame'

const VISIBLE = 14

/** Tira de resultados recientes: el jugador lee la racha de un vistazo. */
export function RecentTicker() {
  const t = useT()
  const history = useGame((state) => state.history)
  const recent = history.slice(0, VISIBLE)

  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="hidden shrink-0 text-[10px] font-medium tracking-widest text-abyss-500 uppercase sm:block">
        {t('history.recent')}
      </span>

      <div className="mask-fade-x no-scrollbar flex min-h-9 flex-1 gap-1.5 overflow-x-auto">
        <AnimatePresence initial={false} mode="popLayout">
          {recent.map((round) => {
            const tier = tierFor(round.multiplier)
            return (
              <motion.span
                key={round.id}
                layout
                initial={{ opacity: 0, x: -22, scale: 0.85 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                title={`${formatMultiplier(round.multiplier)} · ${t('history.target')} ${formatMultiplier(round.target)}`}
                className="tabular grid h-8 shrink-0 place-items-center rounded-md px-2.5 text-[11.5px] font-bold"
                style={{
                  color: round.win ? tier.accent : '#7c8798',
                  background: round.win ? `rgb(${triplet(tier.accent)} / 0.14)` : 'rgb(255 255 255 / 0.04)',
                  border: `1px solid ${round.win ? `rgb(${triplet(tier.accent)} / 0.45)` : 'rgb(255 255 255 / 0.07)'}`,
                  boxShadow: round.win ? `0 0 14px -4px ${tier.accent}` : 'none',
                }}
              >
                {formatMultiplier(round.multiplier)}
              </motion.span>
            )
          })}
        </AnimatePresence>

        {recent.length === 0 && (
          <span className="self-center text-[11.5px] text-abyss-500">{t('history.empty')}</span>
        )}
      </div>
    </div>
  )
}
