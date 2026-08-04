import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { MAX_MULTIPLIER, MAX_WIN_X, UPGRADES } from '@/game/engine'
import { useT } from '@/hooks/useT'
import type { TranslationKey } from '@/i18n'

const STEPS = ['s1', 's2', 's3', 's4'] as const

const HOTKEYS: { keys: string; label: TranslationKey }[] = [
  { keys: 'Espacio', label: 'help.hotkeySpace' },
  { keys: '↑ ↓', label: 'help.hotkeyBet' },
  { keys: 'M', label: 'help.hotkeyMute' },
]

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()

  return (
    <Modal open={open} onClose={onClose} title={t('help.title')} icon={<Icon name="help" />} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((step) => (
          <div key={step} className="rounded-xl border border-white/8 bg-black/25 p-3.5">
            <h3 className="font-display mb-1.5 text-[13px] tracking-wide text-nitro-400">
              {t(`help.${step}Title` as TranslationKey)}
            </h3>
            <p className="text-[13px] leading-relaxed text-asphalt-300">
              {t(`help.${step}` as TranslationKey, { max: MAX_MULTIPLIER })}
            </p>
          </div>
        ))}
      </div>

      <h3 className="font-display mt-6 mb-3 text-sm tracking-wide text-white">{t('free.upgrades')}</h3>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {UPGRADES.map((upgrade) => (
          <div key={upgrade} className="rounded-xl border border-nitro-500/25 bg-nitro-500/8 p-3">
            <span className="block text-[12.5px] font-bold text-nitro-400">
              {t(`upgrade.${upgrade}` as TranslationKey)}
            </span>
            <span className="mt-1 block text-[12px] leading-relaxed text-asphalt-400">
              {t(`upgrade.${upgrade}Text` as TranslationKey)}
            </span>
          </div>
        ))}
      </div>

      <h3 className="font-display mt-6 mb-3 text-sm tracking-wide text-white">{t('help.hotkeys')}</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        {HOTKEYS.map((hotkey) => (
          <div
            key={hotkey.keys}
            className="flex items-center justify-between rounded-lg border border-white/8 bg-black/25 px-3 py-2"
          >
            <span className="text-[12.5px] text-asphalt-300">{t(hotkey.label)}</span>
            <kbd className="rounded border border-white/12 bg-white/6 px-2 py-0.5 font-mono text-[11px] text-white">
              {hotkey.keys}
            </kbd>
          </div>
        ))}
      </div>

      <p className="mt-5 text-[12px] text-asphalt-400">
        {t('help.reelNote', { max: MAX_WIN_X.toLocaleString('en-US') })}
      </p>

      <p className="mt-3 flex items-start gap-2 rounded-lg border border-flame-500/25 bg-flame-500/8 px-3 py-2.5 text-[12px] leading-relaxed text-flame-400">
        <Icon name="warning" className="mt-0.5 size-4 shrink-0" />
        {t('help.responsible')}
      </p>
    </Modal>
  )
}
