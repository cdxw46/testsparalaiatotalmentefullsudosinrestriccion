import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { triplet } from '@/game/color'
import { formatChance, formatMultiplier } from '@/game/format'
import { TIERS, tierChance } from '@/game/tiers'
import { translate } from '@/i18n'
import { useT } from '@/hooks/useT'
import { useGame } from '@/store/useGame'
import type { TranslationKey } from '@/i18n'

const HOTKEYS: { keys: string; label: TranslationKey }[] = [
  { keys: 'Espacio', label: 'help.hotkeySpace' },
  { keys: '← →', label: 'help.hotkeyArrows' },
  { keys: '↑ ↓', label: 'help.hotkeyBet' },
  { keys: 'M', label: 'help.hotkeyMute' },
]

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const lang = useGame((state) => state.settings.lang)

  return (
    <Modal open={open} onClose={onClose} title={t('help.title')} icon={<Icon name="help" />} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        {(['1', '2', '3'] as const).map((step) => (
          <div key={step} className="rounded-xl border border-white/7 bg-black/25 p-3.5">
            <h3 className="font-display mb-1.5 text-[13px] font-bold tracking-wide text-jade-300">
              {t(`help.step${step}Title` as TranslationKey)}
            </h3>
            <p className="text-[13px] leading-relaxed text-abyss-300">{t(`help.step${step}` as TranslationKey)}</p>
          </div>
        ))}
      </div>

      <h3 className="font-display mt-6 mb-3 text-sm tracking-wide text-white">{t('help.tiers')}</h3>

      <div className="overflow-hidden rounded-xl border border-white/7">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-white/4 text-[10.5px] tracking-widest text-abyss-400 uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">{t('help.tiers')}</th>
              <th className="px-3 py-2 font-medium">{t('help.tierRange')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('help.tierChance')}</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((tier) => (
              <tr key={tier.id} className="border-t border-white/6">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2.5">
                    <span
                      className="size-8 shrink-0 rounded-md bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${tier.art})`,
                        backgroundColor: `rgb(${triplet(tier.deep)})`,
                        boxShadow: `inset 0 0 0 1px rgb(${triplet(tier.accent)} / .4)`,
                      }}
                    />
                    <span>
                      <span className="block font-semibold text-white">
                        {translate(lang, `tier.${tier.id}` as TranslationKey)}
                      </span>
                      <span className="block text-[10.5px]" style={{ color: tier.accent }}>
                        {translate(lang, `rarity.${tier.id}` as TranslationKey)}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="tabular px-3 py-2 text-abyss-300">
                  {formatMultiplier(tier.min)} {tier.max === Infinity ? '+' : `– ${formatMultiplier(tier.max - 0.01)}`}
                </td>
                <td className="tabular px-3 py-2 text-right font-semibold text-white">
                  {formatChance(tierChance(tier))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-abyss-400">{t('help.reelNote')}</p>

      <h3 className="font-display mt-6 mb-3 text-sm tracking-wide text-white">{t('help.hotkeys')}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {HOTKEYS.map((hotkey) => (
          <div
            key={hotkey.keys}
            className="flex items-center justify-between rounded-lg border border-white/7 bg-black/25 px-3 py-2"
          >
            <span className="text-[12.5px] text-abyss-300">{t(hotkey.label)}</span>
            <kbd className="rounded border border-white/12 bg-white/6 px-2 py-0.5 font-mono text-[11px] text-white">
              {hotkey.keys}
            </kbd>
          </div>
        ))}
      </div>

      <p className="mt-6 flex items-start gap-2 rounded-lg border border-gold-500/25 bg-gold-500/8 px-3 py-2.5 text-[12px] leading-relaxed text-gold-400">
        <Icon name="warning" className="mt-0.5 size-4 shrink-0" />
        {t('help.responsible')}
      </p>
    </Modal>
  )
}
