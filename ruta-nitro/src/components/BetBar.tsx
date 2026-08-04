import { Icon } from './ui/Icon'
import { audio } from '@/game/audio'
import { formatMoney } from '@/game/format'
import { runRound } from '@/game/sequencer'
import { useT } from '@/hooks/useT'
import { BET_STEPS, BUY_COST_X, useGame } from '@/store/useGame'

const AUTO_STEPS = [10, 25, 50, 100]

export function BetBar() {
  const t = useT()

  const bet = useGame((state) => state.bet)
  const balance = useGame((state) => state.balance)
  const phase = useGame((state) => state.phase)
  const roundWin = useGame((state) => state.roundWin)
  const autoplay = useGame((state) => state.autoplay)
  const stepBet = useGame((state) => state.stepBet)
  const setAutoplay = useGame((state) => state.setAutoplay)

  const spinning = phase === 'spinning'
  const buyCost = bet * BUY_COST_X
  const atMin = bet <= BET_STEPS[0]
  const atMax = bet >= BET_STEPS[BET_STEPS.length - 1]

  return (
    <section className="glass rounded-2xl p-3 sm:p-3.5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_minmax(0,1fr)] lg:items-center">
        <div className="flex items-center gap-2.5">
          <div className="flex-1">
            <span className="mb-1 block text-[10px] font-medium tracking-widest text-asphalt-400 uppercase">
              {t('hud.bet')}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="-"
                disabled={spinning || atMin}
                onClick={() => {
                  audio.ui()
                  stepBet(-1)
                }}
                className="btn-ghost grid size-10 shrink-0 place-items-center rounded-lg disabled:opacity-35"
              >
                <Icon name="minus" className="size-4" />
              </button>
              <span className="tabular grid h-10 flex-1 place-items-center rounded-lg border border-white/8 bg-black/45 px-3 text-[16px] font-bold text-white">
                ${formatMoney(bet)}
              </span>
              <button
                type="button"
                aria-label="+"
                disabled={spinning || atMax}
                onClick={() => {
                  audio.ui()
                  stepBet(1)
                }}
                className="btn-ghost grid size-10 shrink-0 place-items-center rounded-lg disabled:opacity-35"
              >
                <Icon name="plus" className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={spinning || bet > balance}
          onClick={() => {
            if (autoplay > 0) {
              setAutoplay(0)
              return
            }
            void runRound('spin')
          }}
          className="btn-go order-first h-16 w-full lg:order-none lg:h-20"
        >
          <span className="btn-sheen" />
          <span className="relative flex items-center justify-center gap-2">
            <Icon name={autoplay > 0 ? 'stop' : 'play'} className="size-5" strokeWidth={2.4} />
            <span className="font-display text-xl tracking-wide uppercase">
              {autoplay > 0 ? t('bet.autoStop') : spinning ? t('bet.spinning') : t('bet.spin')}
            </span>
          </span>
          {autoplay > 0 && (
            <span className="relative block text-[11px] font-bold text-black/65">
              {t('bet.autoRounds', { n: autoplay })}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex-1">
            <span className="mb-1 block text-[10px] font-medium tracking-widest text-asphalt-400 uppercase">
              {t('hud.win')}
            </span>
            <span
              className={`tabular grid h-10 place-items-center rounded-lg border px-3 text-[16px] font-bold transition-colors ${
                roundWin > 0
                  ? 'border-nitro-500/50 bg-nitro-500/12 text-nitro-400'
                  : 'border-white/8 bg-black/45 text-asphalt-400'
              }`}
            >
              ${formatMoney(roundWin)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-white/6 pt-2.5">
        <button
          type="button"
          disabled={spinning || buyCost > balance}
          onClick={() => void runRound('buy')}
          title={t('bet.buyHint')}
          className="flex h-9 items-center gap-2 rounded-lg border border-flame-500/45 bg-flame-500/12 px-3 text-[12px] font-bold text-flame-400 transition-colors hover:bg-flame-500/20 disabled:opacity-35"
        >
          <Icon name="cart" className="size-4" />
          {t('bet.buy')}
          <span className="tabular rounded bg-black/40 px-1.5 py-0.5 text-[11px]">${formatMoney(buyCost)}</span>
        </button>

        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] tracking-widest text-asphalt-500 uppercase">{t('bet.auto')}</span>
          {AUTO_STEPS.map((rounds) => (
            <button
              key={rounds}
              type="button"
              disabled={spinning && autoplay === 0}
              onClick={() => {
                audio.ui()
                setAutoplay(rounds)
                if (!spinning) void runRound('spin')
              }}
              className="btn-ghost tabular h-9 rounded-lg px-2.5 text-[12px] font-bold disabled:opacity-35"
            >
              {rounds}
            </button>
          ))}
        </span>
      </div>
    </section>
  )
}
