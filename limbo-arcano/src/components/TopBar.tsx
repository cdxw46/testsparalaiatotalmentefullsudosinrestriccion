import { AnimatedNumber } from './ui/AnimatedNumber'
import { Icon, type IconName } from './ui/Icon'
import { audio } from '@/game/audio'
import { formatMoney } from '@/game/format'
import { useT } from '@/hooks/useT'
import { useGame } from '@/store/useGame'

export type ModalId = 'stats' | 'history' | 'fair' | 'help'

interface TopBarProps {
  onOpen: (modal: ModalId) => void
}

interface BarButtonProps {
  icon: IconName
  label: string
  active?: boolean
  onClick: () => void
}

function BarButton({ icon, label, active, onClick }: BarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-lg transition-all sm:size-9.5 ${
        active
          ? 'border border-jade-500/50 bg-jade-600/20 text-jade-300 shadow-[0_0_16px_-4px_var(--color-jade-500)]'
          : 'btn-ghost'
      }`}
    >
      <Icon name={icon} className="size-4.5" />
    </button>
  )
}

export function TopBar({ onOpen }: TopBarProps) {
  const t = useT()

  const balance = useGame((state) => state.balance)
  const sound = useGame((state) => state.settings.sound)
  const turbo = useGame((state) => state.settings.turbo)
  const lang = useGame((state) => state.settings.lang)
  const setSetting = useGame((state) => state.setSetting)

  const toggleFullscreen = () => {
    audio.ui()
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => undefined)
  }

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 place-items-center rounded-xl border border-gold-500/35 bg-gradient-to-b from-abyss-700 to-abyss-900 shadow-[inset_0_1px_0_rgb(255_255_255/0.14)]">
          <Icon name="flame" className="size-5 text-gold-400" />
        </span>
        <div className="leading-tight">
          <h1 className="engraved font-display text-[19px] font-bold tracking-[0.16em] uppercase sm:text-[21px]">
            {t('app.title')}
          </h1>
          <p className="text-[10px] tracking-[0.24em] text-abyss-400 uppercase">{t('app.tagline')}</p>
        </div>
      </div>

      <div className="order-3 flex-1 sm:order-none">
        <div className="inline-flex items-center gap-2.5 rounded-xl border border-white/8 bg-black/40 px-3.5 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
          <span className="grid size-6 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-500 text-[11px] font-black text-abyss-950">
            $
          </span>
          <span className="leading-none">
            <span className="block text-[9.5px] tracking-widest text-abyss-400 uppercase">{t('hud.balance')}</span>
            <AnimatedNumber
              value={balance}
              format={formatMoney}
              className="tabular block text-[15px] font-bold text-white"
            />
          </span>
        </div>
      </div>

      <nav className="ml-auto flex items-center gap-1.5">
        <BarButton
          icon={sound ? 'volume' : 'mute'}
          label={t('hud.sound')}
          active={sound}
          onClick={() => {
            audio.unlock()
            audio.toggle(!sound)
            setSetting('sound', !sound)
          }}
        />
        <BarButton
          icon="bolt"
          label={t('hud.turbo')}
          active={turbo}
          onClick={() => {
            audio.toggle(!turbo)
            setSetting('turbo', !turbo)
          }}
        />
        <BarButton
          icon="globe"
          label={t('hud.lang')}
          onClick={() => {
            audio.ui()
            setSetting('lang', lang === 'es' ? 'en' : 'es')
          }}
        />
        <span className="mx-0.5 h-6 w-px bg-white/10" />
        <BarButton icon="chart" label={t('hud.stats')} onClick={() => onOpen('stats')} />
        <BarButton icon="clock" label={t('hud.history')} onClick={() => onOpen('history')} />
        <BarButton icon="shield" label={t('hud.fair')} onClick={() => onOpen('fair')} />
        <BarButton icon="help" label={t('hud.help')} onClick={() => onOpen('help')} />
        <BarButton icon="expand" label={t('hud.fullscreen')} onClick={toggleFullscreen} />
      </nav>
    </header>
  )
}
