import { AnimatePresence, motion } from 'motion/react'
import { triplet } from '@/game/color'
import { formatMoney, formatMultiplier } from '@/game/format'
import { tierFor } from '@/game/tiers'
import { translate } from '@/i18n'
import { useT } from '@/hooks/useT'
import { useGame } from '@/store/useGame'
import type { TierId } from '@/game/tiers'
import type { TranslationKey } from '@/i18n'

/** El aviso del resultado desaparece en cuanto arranca el siguiente giro. */
export function ResultBanner() {
  const t = useT()
  const lang = useGame((state) => state.settings.lang)
  const phase = useGame((state) => state.phase)
  const round = useGame((state) => state.lastRound)

  const visible = phase === 'idle' && round !== null
  const tier = round ? tierFor(round.multiplier) : null
  const tierName = tier ? translate(lang, `tier.${tier.id as TierId}` as TranslationKey) : ''

  return (
    <AnimatePresence>
      {visible && round && tier && (
        <motion.div
          key={round.id}
          initial={{ opacity: 0, y: -14, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          className="pointer-events-none absolute top-3 left-1/2 z-40 -translate-x-1/2"
        >
          <div
            className="flex items-center gap-3 rounded-xl border px-4 py-2 backdrop-blur-md"
            style={{
              borderColor: round.win ? `rgb(${triplet(tier.accent)} / 0.55)` : 'rgb(244 63 94 / 0.4)',
              background: round.win ? `rgb(${triplet(tier.accent)} / 0.13)` : 'rgb(20 6 10 / 0.7)',
              boxShadow: round.win ? `0 10px 40px -12px ${tier.accent}` : '0 10px 30px -14px rgb(0 0 0 / .9)',
            }}
          >
            <span
              className="font-display text-sm font-bold tracking-[0.14em]"
              style={{ color: round.win ? tier.accent : '#fb7185' }}
            >
              {round.win ? t('result.win') : t('result.lose')}
            </span>

            <span className="h-5 w-px bg-white/15" />

            <span className="leading-tight">
              <span className="tabular block text-[15px] font-bold text-white">
                {round.win ? (
                  round.bet > 0 ? (
                    `+$${formatMoney(round.profit)}`
                  ) : (
                    t('result.demo')
                  )
                ) : (
                  t('result.needed', { target: formatMultiplier(round.target) })
                )}
              </span>
              <span className="block text-[10.5px] tracking-wide text-abyss-300">
                {tierName} · {formatMultiplier(round.multiplier)}
              </span>
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
