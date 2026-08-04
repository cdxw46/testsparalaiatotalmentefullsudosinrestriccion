import { AnimatePresence, motion } from 'motion/react'
import { formatMoney } from '@/game/format'
import { useT } from '@/hooks/useT'
import { useGame } from '@/store/useGame'
import type { Upgrade } from '@/game/engine'
import type { TranslationKey } from '@/i18n'

const TIER_KEY: Record<number, TranslationKey> = {
  3: 'free.tier3',
  4: 'free.tier4',
  5: 'free.tier5',
}

function UpgradeChips({ upgrades }: { upgrades: readonly Upgrade[] }) {
  const t = useT()
  if (upgrades.length === 0) return null

  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {upgrades.map((upgrade) => (
        <span
          key={upgrade}
          className="rounded-full border border-nitro-500/50 bg-nitro-500/15 px-2.5 py-1 text-[11px] font-bold tracking-wide text-nitro-400"
        >
          {t(`upgrade.${upgrade}` as TranslationKey)}
        </span>
      ))}
    </div>
  )
}

/**
 * Contador de la serie. Va en su propia franja encima de la rejilla y no
 * flotando sobre ella: superpuesto tapaba la fila de arriba justo cuando esa
 * fila es la que esta jugando.
 */
export function FreeSpinsCounter() {
  const t = useT()
  const free = useGame((state) => state.free)
  const intro = useGame((state) => state.intro)

  return (
    <AnimatePresence>
      {free && !intro && (
        <motion.div
          key="counter"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="mb-2 flex items-center justify-center gap-3 rounded-xl border border-nitro-500/45 bg-black/60 px-4 py-1.5 backdrop-blur-md">
            <span className="text-[9.5px] tracking-widest text-nitro-400/80 uppercase">{t('free.title')}</span>
            <span className="tabular font-display text-[15px] text-white">
              {t('free.counter', { index: free.index, total: free.total })}
            </span>
            <span className="h-5 w-px bg-white/15" />
            <span className="text-[9.5px] tracking-widest text-asphalt-400 uppercase">{t('free.total')}</span>
            <span className="tabular text-[15px] font-bold text-nitro-400">${formatMoney(free.win)}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Carteles de entrada y salida de la serie. */
export function FreeSpinsLayer() {
  const t = useT()
  const intro = useGame((state) => state.intro)
  const outro = useGame((state) => state.outro)

  return (
    <>
      <AnimatePresence>
        {(intro || outro) && (
          <motion.div
            key={intro ? 'intro' : 'outro'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 grid place-items-center bg-black/72 backdrop-blur-[3px]"
          >
            <motion.div
              initial={{ scale: 0.8, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="mx-4 max-w-md rounded-2xl border border-nitro-500/45 bg-gradient-to-b from-asphalt-800 to-asphalt-950 px-8 py-7 text-center shadow-[0_0_60px_-12px_var(--color-nitro-500)]"
            >
              {intro ? (
                <>
                  <p className="text-[11px] tracking-[0.28em] text-nitro-400/80 uppercase">{t('free.intro')}</p>
                  <h2 className="plated font-display mt-1.5 text-4xl tracking-wide uppercase">
                    {t(TIER_KEY[Math.min(intro.scatters, 5)] ?? 'free.tier3')}
                  </h2>
                  <p className="font-display mt-2 mb-4 text-2xl text-white">
                    {t('free.spins', { n: intro.spins })}
                  </p>
                  <UpgradeChips upgrades={intro.upgrades} />
                </>
              ) : (
                outro && (
                  <>
                    <p className="text-[11px] tracking-[0.28em] text-nitro-400/80 uppercase">{t('free.outro')}</p>
                    <h2 className="plated font-display mt-2 text-5xl tracking-wide">
                      ${formatMoney(outro.win)}
                    </h2>
                    <p className="mt-2 text-[13px] text-asphalt-300">
                      {t('free.spins', { n: outro.spins })}
                    </p>
                  </>
                )
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
