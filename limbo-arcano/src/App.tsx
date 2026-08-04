import { useEffect, useState } from 'react'
import backdrop from '@/assets/bg-valley.webp'
import { BetPanel } from '@/components/BetPanel'
import { RecentTicker } from '@/components/RecentTicker'
import { ResultBanner } from '@/components/ResultBanner'
import { Toast } from '@/components/Toast'
import { TopBar, type ModalId } from '@/components/TopBar'
import { Reel } from '@/components/reel/Reel'
import { FairnessModal, type VerifierPrefill } from '@/components/modals/FairnessModal'
import { HelpModal } from '@/components/modals/HelpModal'
import { HistoryModal } from '@/components/modals/HistoryModal'
import { StatsModal } from '@/components/modals/StatsModal'
import { Icon } from '@/components/ui/Icon'
import { audio } from '@/game/audio'
import { HOUSE_EDGE } from '@/game/fair'
import { useT } from '@/hooks/useT'
import { useGame } from '@/store/useGame'

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export default function App() {
  const t = useT()
  const [modal, setModal] = useState<ModalId | null>(null)
  const [prefill, setPrefill] = useState<VerifierPrefill | null>(null)

  const sound = useGame((state) => state.settings.sound)

  useEffect(() => {
    audio.setMuted(!sound)
  }, [sound])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (EDITABLE.has(target.tagName) || target.isContentEditable)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const store = useGame.getState()

      switch (event.code) {
        case 'Space':
        case 'Enter': {
          event.preventDefault()
          audio.unlock()
          const { settings, auto, phase } = store
          if (settings.autoMode) {
            if (auto.running) store.stopAuto()
            else store.startAuto()
          } else if (phase === 'idle') {
            store.roll()
          }
          break
        }
        case 'ArrowRight':
          event.preventDefault()
          store.nudgeTarget(1)
          break
        case 'ArrowLeft':
          event.preventDefault()
          store.nudgeTarget(-1)
          break
        case 'ArrowUp':
          event.preventDefault()
          store.adjustBet('double')
          break
        case 'ArrowDown':
          event.preventDefault()
          store.adjustBet('half')
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

  const openVerifier = (data: VerifierPrefill) => {
    setPrefill(data)
    setModal('fair')
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* Ambiente: el mismo valle del carrusel, muy difuminado, mas dos auras frias. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center opacity-25 blur-[3px]"
        style={{ backgroundImage: `url(${backdrop})` }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(36,224,125,0.12),transparent_55%),radial-gradient(90%_70%_at_50%_110%,rgba(10,14,21,0.98),rgba(5,7,11,1))]"
      />

      <div className="mx-auto flex min-h-dvh max-w-[76rem] flex-col gap-3 px-3 py-3.5 sm:px-4 sm:py-5">
        <TopBar onOpen={setModal} />

        <main className="glass relative flex flex-1 flex-col overflow-hidden rounded-2xl">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-45"
            style={{ backgroundImage: `url(${backdrop})` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,11,0.55),rgba(5,7,11,0.2)_35%,rgba(5,7,11,0.92))]"
          />

          <div className="relative flex flex-1 flex-col">
            <div className="px-3 pt-3 sm:px-4">
              <RecentTicker />
            </div>

            <div className="relative flex min-h-0 flex-1 py-2">
              <Reel />
              <ResultBanner />
            </div>

            <div className="flex items-center justify-between gap-3 px-4 pb-1 text-[10px] tracking-[0.2em] text-abyss-500 uppercase">
              <span className="flex items-center gap-1.5">
                <Icon name="flame" className="size-3.5 text-gold-500/70" />
                {t('app.title')}
              </span>
              <span className="tabular">RTP {((1 - HOUSE_EDGE) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </main>

        <BetPanel />

        <footer className="px-1 pb-1 text-center text-[10.5px] leading-relaxed text-abyss-600">
          {t('app.demo')}
        </footer>
      </div>

      <Toast />

      <StatsModal open={modal === 'stats'} onClose={() => setModal(null)} />
      <HistoryModal open={modal === 'history'} onClose={() => setModal(null)} onVerify={openVerifier} />
      <FairnessModal open={modal === 'fair'} onClose={() => setModal(null)} prefill={prefill} />
      <HelpModal open={modal === 'help'} onClose={() => setModal(null)} />
    </div>
  )
}
