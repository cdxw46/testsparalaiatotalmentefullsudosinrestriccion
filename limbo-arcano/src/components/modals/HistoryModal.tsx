import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { triplet } from '@/game/color'
import { formatMoney, formatMultiplier, shortHash } from '@/game/format'
import { tierFor } from '@/game/tiers'
import { useT } from '@/hooks/useT'
import { useGame } from '@/store/useGame'
import type { VerifierPrefill } from './FairnessModal'

interface HistoryModalProps {
  open: boolean
  onClose: () => void
  onVerify: (prefill: VerifierPrefill) => void
}

export function HistoryModal({ open, onClose, onVerify }: HistoryModalProps) {
  const t = useT()
  const history = useGame((state) => state.history)
  const revealed = useGame((state) => state.fair.revealed)

  return (
    <Modal open={open} onClose={onClose} title={t('history.title')} icon={<Icon name="clock" />} wide>
      {history.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-abyss-500">{t('history.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-[12.5px]">
            <thead className="text-[10.5px] tracking-widest text-abyss-400 uppercase">
              <tr>
                <th className="px-2 py-2 font-medium">{t('history.nonce')}</th>
                <th className="px-2 py-2 font-medium">{t('history.target')}</th>
                <th className="px-2 py-2 font-medium">{t('history.result')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('history.bet')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('history.payout')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('fair.verify')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((round) => {
                const tier = tierFor(round.multiplier)
                // Solo se puede recomputar una ronda cuya semilla ya se revelo.
                const unlocked = revealed?.serverSeedHash === round.serverSeedHash

                return (
                  <tr key={round.id} className="border-t border-white/6">
                    <td className="tabular px-2 py-2 text-abyss-400">#{round.nonce}</td>
                    <td className="tabular px-2 py-2 text-abyss-300">{formatMultiplier(round.target)}</td>
                    <td className="px-2 py-2">
                      <span
                        className="tabular inline-flex items-center rounded px-2 py-0.5 text-[11.5px] font-bold"
                        style={{
                          color: round.win ? tier.accent : '#8b95a5',
                          background: round.win ? `rgb(${triplet(tier.accent)} / 0.14)` : 'rgb(255 255 255 / 0.04)',
                        }}
                      >
                        {formatMultiplier(round.multiplier)}
                      </span>
                    </td>
                    <td className="tabular px-2 py-2 text-right text-abyss-300">${formatMoney(round.bet)}</td>
                    <td
                      className={`tabular px-2 py-2 text-right font-semibold ${
                        round.win ? 'text-jade-400' : 'text-abyss-500'
                      }`}
                    >
                      {round.win ? `+$${formatMoney(round.profit)}` : `–$${formatMoney(round.bet)}`}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {unlocked ? (
                        <button
                          type="button"
                          onClick={() =>
                            onVerify({
                              serverSeed: revealed.serverSeed,
                              clientSeed: round.clientSeed,
                              nonce: round.nonce,
                            })
                          }
                          className="btn-ghost inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold"
                        >
                          <Icon name="shield" className="size-3.5" />
                          {t('fair.verify')}
                        </button>
                      ) : (
                        <span
                          title={t('fair.rotateHint')}
                          className="font-mono text-[10.5px] text-abyss-600"
                        >
                          {shortHash(round.serverSeedHash, 5)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
