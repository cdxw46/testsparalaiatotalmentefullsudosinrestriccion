import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { audio } from '@/game/audio'
import { formatMoney, formatMultiplier, formatSigned } from '@/game/format'
import { useT } from '@/hooks/useT'
import { STARTING_BALANCE, useGame } from '@/store/useGame'

interface StatCardProps {
  label: string
  value: string
  tone?: 'default' | 'good' | 'bad'
}

function StatCard({ label, value, tone = 'default' }: StatCardProps) {
  const color = tone === 'good' ? 'text-jade-400' : tone === 'bad' ? 'text-rose-400' : 'text-white'
  return (
    <div className="rounded-xl border border-white/7 bg-black/25 px-3.5 py-3">
      <span className="block text-[10.5px] tracking-widest text-abyss-400 uppercase">{label}</span>
      <span className={`tabular font-display mt-1 block text-xl font-bold ${color}`}>{value}</span>
    </div>
  )
}

export function StatsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const stats = useGame((state) => state.stats)
  const resetSession = useGame((state) => state.resetSession)

  const winRate = stats.rounds > 0 ? (stats.wins / stats.rounds) * 100 : 0
  const streakLabel =
    stats.streak === 0 ? t('stats.none') : `${stats.streak > 0 ? '+' : ''}${stats.streak}`

  return (
    <Modal open={open} onClose={onClose} title={t('stats.title')} icon={<Icon name="chart" />}>
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label={t('stats.bets')} value={String(stats.rounds)} />
        <StatCard label={t('stats.winRate')} value={`${winRate.toFixed(1)}%`} />
        <StatCard label={t('stats.wins')} value={String(stats.wins)} tone="good" />
        <StatCard label={t('stats.losses')} value={String(stats.losses)} tone="bad" />
        <StatCard label={t('stats.wagered')} value={`$${formatMoney(stats.wagered)}`} />
        <StatCard
          label={t('stats.profit')}
          value={`$${formatSigned(stats.profit)}`}
          tone={stats.profit > 0 ? 'good' : stats.profit < 0 ? 'bad' : 'default'}
        />
        <StatCard
          label={t('stats.best')}
          value={stats.best > 0 ? formatMultiplier(stats.best) : t('stats.none')}
        />
        <StatCard label={t('stats.streak')} value={streakLabel} tone={stats.streak > 0 ? 'good' : stats.streak < 0 ? 'bad' : 'default'} />
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-white/8 pt-4">
        <p className="flex-1 text-[11.5px] leading-relaxed text-abyss-500">
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
