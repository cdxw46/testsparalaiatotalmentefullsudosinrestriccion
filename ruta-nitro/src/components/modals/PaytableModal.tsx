import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { ACCENT, ART } from '@/game/art'
import { triplet } from '@/game/color'
import { MAX_WIN_X } from '@/game/engine'
import { PAYTABLE, PAY_SYMBOLS, type SymbolId } from '@/game/symbols'
import { useT } from '@/hooks/useT'
import type { TranslationKey } from '@/i18n'

const BANDS = ['8 – 9', '10 – 11', '12+']
const SPECIALS: SymbolId[] = ['flag', 'lights', 'gear', 'nitro', 'lap']

function SymbolChip({ id, size = 'size-11' }: { id: SymbolId; size?: string }) {
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-lg`}
      style={{
        background: `radial-gradient(circle at 50% 60%, rgb(${triplet(ACCENT[id])} / 0.28), transparent 70%)`,
        boxShadow: `inset 0 0 0 1px rgb(${triplet(ACCENT[id])} / 0.35)`,
      }}
    >
      <img src={ART[id]} alt="" className="size-[82%] object-contain" />
    </span>
  )
}

export function PaytableModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()

  return (
    <Modal open={open} onClose={onClose} title={t('pay.title')} icon={<Icon name="table" />} wide>
      <p className="mb-4 text-[13px] leading-relaxed text-asphalt-300">{t('pay.note')}</p>

      <div className="overflow-hidden rounded-xl border border-white/8">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-white/4 text-[10.5px] tracking-widest text-asphalt-400 uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">{t('pay.symbol')}</th>
              {BANDS.map((band) => (
                <th key={band} className="px-3 py-2 text-right font-medium">
                  {band}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...PAY_SYMBOLS].reverse().map((symbol) => (
              <tr key={symbol} className="border-t border-white/6">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-3">
                    <SymbolChip id={symbol} />
                    <span className="font-semibold text-white">{t(`sym.${symbol}` as TranslationKey)}</span>
                  </span>
                </td>
                {PAYTABLE[symbol].map((pay, index) => (
                  <td key={index} className="tabular px-3 py-2 text-right font-semibold text-nitro-400">
                    {/* Los simbolos bajos pagan centesimas: dos decimales los
                        redondearian a cero y falsearian la tabla. */}
                    {pay < 1 ? pay.toFixed(3) : pay.toFixed(2)}x
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="font-display mt-6 mb-3 text-sm tracking-wide text-white">{t('pay.specials')}</h3>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {SPECIALS.map((symbol) => (
          <div
            key={symbol}
            className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/25 p-3"
          >
            <SymbolChip id={symbol} size="size-12" />
            <span>
              <span className="block text-[13px] font-semibold text-white">
                {t(`sym.${symbol}` as TranslationKey)}
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-asphalt-400">
                {t(`sym.${symbol}Text` as TranslationKey)}
              </span>
            </span>
          </div>
        ))}
      </div>

      <p className="mt-5 rounded-lg border border-nitro-500/25 bg-nitro-500/8 px-3 py-2.5 text-[12px] text-nitro-400">
        {t('help.reelNote', { max: MAX_WIN_X.toLocaleString('en-US') })}
      </p>
    </Modal>
  )
}
