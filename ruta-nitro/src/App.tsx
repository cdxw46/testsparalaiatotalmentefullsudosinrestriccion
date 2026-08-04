import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import backdrop from '@/assets/bg-canyon.webp'
import { BetBar } from '@/components/BetBar'
import { FreeSpinsLayer } from '@/components/FreeSpinsLayer'
import { TopBar, type ModalId } from '@/components/TopBar'
import { Grid } from '@/components/grid/Grid'
import { FairnessModal } from '@/components/modals/FairnessModal'
import { HelpModal } from '@/components/modals/HelpModal'
import { PaytableModal } from '@/components/modals/PaytableModal'
import { HistoryModal, StatsModal } from '@/components/modals/SessionModals'
import { Icon } from '@/components/ui/Icon'
import { audio } from '@/game/audio'
import { formatMoney } from '@/game/format'
import { abortPlayback, runRound } from '@/game/sequencer'
import { THEORETICAL_RTP } from '@/game/symbols'
import { useT } from '@/hooks/useT'
import { useGame } from '@/store/useGame'

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export default function App() {
  const t = useT()
  const [modal, setModal] = useState<ModalId | null>(null)

  const sound = useGame((state) => state.settings.sound)
  const phase = useGame((state) => state.phase)
  const autoplay = useGame((state) => state.autoplay)
  const clusters = useGame((state) => state.clusters)
  const stageWin = useGame((state) => state.stageWin)
  const notice = useGame((state) => state.notice)
  const dismissNotice = useGame((state) => state.dismissNotice)

  useEffect(() => {
    audio.setMuted(!sound)
  }, [sound])

  useEffect(() => () => abortPlayback(), [])

  // Cadena de tiradas automaticas: cada ronda que termina lanza la siguiente.
  useEffect(() => {
    if (phase !== 'idle' || autoplay <= 0) return
    const timer = setTimeout(() => void runRound('spin'), 260)
    return () => clearTimeout(timer)
  }, [phase, autoplay])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(dismissNotice, 3200)
    return () => clearTimeout(timer)
  }, [notice, dismissNotice])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (EDITABLE.has(target.tagName) || target.isContentEditable)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const store = useGame.getState()

      switch (event.code) {
        case 'Space':
        case 'Enter':
          event.preventDefault()
          if (store.autoplay > 0) store.setAutoplay(0)
          else if (store.phase === 'idle') void runRound('spin')
          break
        case 'ArrowUp':
          event.preventDefault()
          store.stepBet(1)
          break
        case 'ArrowDown':
          event.preventDefault()
          store.stepBet(-1)
          break
        case 'KeyM':
          store.setSetting('sound', !store.settings.sound)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center opacity-30 blur-[3px]"
        style={{ backgroundImage: `url(${backdrop})` }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(245,166,35,0.13),transparent_55%),radial-gradient(90%_70%_at_50%_110%,rgba(7,8,12,0.98),rgba(7,8,12,1))]"
      />

      <div className="mx-auto flex min-h-dvh max-w-[68rem] flex-col gap-3 px-3 py-3.5 sm:px-4 sm:py-5">
        <TopBar onOpen={setModal} />

        <main className="glass relative flex flex-1 flex-col overflow-hidden rounded-2xl">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40"
            style={{ backgroundImage: `url(${backdrop})` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,12,0.62),rgba(7,8,12,0.3)_38%,rgba(7,8,12,0.94))]"
          />

          <div className="relative flex flex-1 flex-col justify-center p-2.5 sm:p-3">
            {/* La rejilla es 6:5, asi que su ancho se limita tambien por lo que
                queda de alto una vez descontadas la barra superior y la de
                apuesta; sin esto se come el panel inferior en pantallas bajas. */}
            <div
              className="relative mx-auto w-full"
              style={{ width: 'min(100%, min(52rem, calc((100dvh - 20rem) * 1.2)))' }}
            >
              <Grid />
              <FreeSpinsLayer />

              {/* Premio de la cascada en curso, sobre la rejilla. */}
              <AnimatePresence>
                {clusters && stageWin > 0 && (
                  <motion.div
                    key={`${clusters[0]?.symbol}-${stageWin}`}
                    initial={{ opacity: 0, scale: 0.7, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                    className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center"
                  >
                    <span className="tabular font-display rounded-xl border border-nitro-500/55 bg-black/78 px-4 py-1.5 text-2xl text-nitro-400 shadow-[0_0_34px_-6px_var(--color-nitro-500)] backdrop-blur-md">
                      +${formatMoney(stageWin)}
                      {clusters[0] && clusters[0].multiplier > 1 && (
                        <span className="ml-2 text-[13px] text-flame-400">x{clusters[0].multiplier}</span>
                      )}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="relative flex items-center justify-between gap-3 px-4 pb-2 text-[10px] tracking-[0.2em] text-asphalt-500 uppercase">
            <span className="flex items-center gap-1.5">
              <Icon name="bolt" className="size-3.5 text-nitro-500/70" />
              {t('app.title')}
            </span>
            <span className="tabular">RTP {(THEORETICAL_RTP * 100).toFixed(2)}%</span>
          </div>
        </main>

        <BetBar />

        <footer className="px-1 pb-1 text-center text-[10.5px] text-asphalt-600">{t('app.demo')}</footer>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-60 flex justify-center px-4">
        <AnimatePresence>
          {notice && (
            <motion.div
              key={notice.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10 }}
              className={`glass flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-medium ${
                notice.tone === 'warn' ? 'text-flame-400' : 'text-signal-400'
              }`}
            >
              <Icon name={notice.tone === 'warn' ? 'warning' : 'check'} className="size-4" />
              {t('bet.noFunds')}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <PaytableModal open={modal === 'paytable'} onClose={() => setModal(null)} />
      <StatsModal open={modal === 'stats'} onClose={() => setModal(null)} />
      <HistoryModal open={modal === 'history'} onClose={() => setModal(null)} />
      <FairnessModal open={modal === 'fair'} onClose={() => setModal(null)} />
      <HelpModal open={modal === 'help'} onClose={() => setModal(null)} />
    </div>
  )
}
