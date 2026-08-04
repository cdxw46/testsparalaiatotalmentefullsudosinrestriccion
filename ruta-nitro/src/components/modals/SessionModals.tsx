import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { audio } from '@/game/audio'
import { formatMoney, formatX, shortHash } from '@/game/format'
import { useT } from '@/hooks/useT'
import { STARTING_BALANCE, useGame } from '@/store/useGame'

export function HistoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const history = useGame((state) => state.history)

  return (
    <Modal open={open} onClose={onClose} title={t('history.title')} icon={<Icon name="clock" />} wide>
      {history.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-asphalt-500">{t('history.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-[12.5px]">
            <thead className="text-[10.5px] tracking-widest text-asphalt-400 uppercase">
              <tr>
                <th className="px-2 py-2 font-medium">{t('history.nonce')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('history.bet')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('history.win')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('history.free')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('fair.serverHash')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id} className="border-t border-white/6">
                  <td className="tabular px-2 py-2 text-asphalt-400">#{entry.nonce}</td>
                  <td className="tabular px-2 py-2 text-right text-asphalt-300">${formatMoney(entry.bet)}</td>
                  <td
                    className={`tabular px-2 py-2 text-right font-semibold ${
                      entry.win > 0 ? 'text-nitro-400' : 'text-asphalt-500'
                    }`}
                  >
                    {entry.win > 0 ? `+$${formatMoney(entry.win)}` : '—'}
                  </td>
                  <td className="tabular px-2 py-2 text-right text-asphalt-400">
                    {entry.freeSpins > 0 ? entry.freeSpins : '—'}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[10.5px] text-asphalt-600">
                    {shortHash(entry.serverSeedHash, 5)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/25 px-3.5 py-3">
      <span className="block text-[10.5px] tracking-widest text-asphalt-400 uppercase">{label}</span>
      <span
        className={`tabular font-display mt-1 block text-xl ${tone === 'good' ? 'text-nitro-400' : 'text-white'}`}
      >
        {value}
      </span>
    </div>
  )
}

export function StatsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const stats = useGame((state) => state.stats)
  const resetSession = useGame((state) => state.resetSession)

  const rtp = stats.wagered > 0 ? (stats.returned / stats.wagered) * 100 : 0

  return (
    <Modal open={open} onClose={onClose} title={t('stats.title')} icon={<Icon name="chart" />}>
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label={t('stats.rounds')} value={String(stats.rounds)} />
        <StatCard label={t('stats.wins')} value={String(stats.wins)} tone="good" />
        <StatCard label={t('stats.wagered')} value={`$${formatMoney(stats.wagered)}`} />
        <StatCard label={t('stats.returned')} value={`$${formatMoney(stats.returned)}`} tone="good" />
        <StatCard label={t('stats.rtp')} value={stats.rounds > 0 ? `${rtp.toFixed(1)}%` : t('stats.none')} />
        <StatCard label={t('stats.best')} value={stats.best > 0 ? formatX(stats.best) : t('stats.none')} tone="good" />
        <StatCard label={t('stats.bonuses')} value={String(stats.bonuses)} />
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-white/8 pt-4">
        <p className="flex-1 text-[11.5px] leading-relaxed text-asphalt-500">
          {t('stats.resetHint', { amount: `$${formatMoney(STARTING_BALANCE)}` })}
        </p>
        <button
          type="button"
          onClick={() => {
            audio.ui()
            resetSession()
            onClose()
          }}
          className="btn-ghost flex h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-[12.5px] font-semibold"
        >
          <Icon name="refresh" className="size-4" />
          {t('stats.reset')}
        </button>
      </div>
    </Modal>
  )
}
