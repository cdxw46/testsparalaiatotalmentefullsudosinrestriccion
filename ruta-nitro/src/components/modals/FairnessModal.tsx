import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { audio } from '@/game/audio'
import { copyText } from '@/game/clipboard'
import { randomClientSeed } from '@/game/fair'
import { THEORETICAL_RTP } from '@/game/symbols'
import { useT } from '@/hooks/useT'
import { useGame } from '@/store/useGame'

function CopyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-asphalt-300 uppercase">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/45 px-3 py-2.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-white">{value}</code>
        <button
          type="button"
          aria-label={t('fair.copy')}
          onClick={async () => setCopied(await copyText(value))}
          className={`grid size-7 shrink-0 place-items-center rounded-md transition-colors ${
            copied ? 'bg-nitro-500/25 text-nitro-400' : 'btn-ghost'
          }`}
        >
          <Icon name={copied ? 'check' : 'copy'} className="size-3.5" />
        </button>
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-asphalt-500">{copied ? t('fair.copied') : hint}</p>}
    </div>
  )
}

export function FairnessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const fair = useGame((state) => state.fair)
  const phase = useGame((state) => state.phase)
  const setClientSeed = useGame((state) => state.setClientSeed)
  const rotateSeeds = useGame((state) => state.rotateSeeds)

  const [draft, setDraft] = useState(fair.clientSeed)
  useEffect(() => setDraft(fair.clientSeed), [fair.clientSeed])

  return (
    <Modal open={open} onClose={onClose} title={t('fair.title')} icon={<Icon name="shield" />}>
      <p className="mb-4 text-[13px] leading-relaxed text-asphalt-300">{t('fair.intro')}</p>

      <div className="space-y-3.5 rounded-xl border border-white/8 bg-black/25 p-3.5">
        <CopyRow label={t('fair.serverHash')} value={fair.serverSeedHash} hint={t('fair.serverHashHint')} />

        <div>
          <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-asphalt-300 uppercase">
            {t('fair.clientSeed')}
          </span>
          <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/45 px-3">
            <input
              value={draft}
              spellCheck={false}
              aria-label={t('fair.clientSeed')}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => setClientSeed(draft)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              className="h-11 w-full min-w-0 bg-transparent font-mono text-[12.5px] text-white outline-none"
            />
            <button
              type="button"
              aria-label={t('fair.clientSeed')}
              onClick={() => {
                audio.ui()
                const next = randomClientSeed()
                setDraft(next)
                setClientSeed(next)
              }}
              className="btn-ghost grid size-7 shrink-0 place-items-center rounded-md"
            >
              <Icon name="refresh" className="size-3.5" />
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-asphalt-500">{t('fair.clientSeedHint')}</p>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-asphalt-300 uppercase">
              {t('fair.nonce')}
            </span>
            <div className="tabular flex h-11 items-center rounded-lg border border-white/8 bg-black/45 px-3 text-[15px] font-bold text-white">
              {fair.nonce}
            </div>
          </div>
          <button
            type="button"
            disabled={phase === 'spinning'}
            onClick={() => {
              audio.ui()
              rotateSeeds()
            }}
            className="btn-ghost flex h-11 items-center gap-2 rounded-lg px-3.5 text-[12.5px] font-semibold disabled:opacity-40"
          >
            <Icon name="refresh" className="size-4" />
            {t('fair.rotate')}
          </button>
        </div>
        <p className="text-[11px] text-asphalt-500">{t('fair.rotateHint')}</p>

        <div className="border-t border-white/8 pt-3.5">
          <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-asphalt-300 uppercase">
            {t('fair.previous')}
          </span>
          {fair.revealed ? (
            <>
              <code className="block truncate rounded-lg border border-signal-500/30 bg-signal-500/8 px-3 py-2.5 font-mono text-[12px] text-signal-400">
                {fair.revealed.serverSeed}
              </code>
              <p className="mt-1.5 text-[11px] text-asphalt-500">
                {t('fair.previousRounds', { n: fair.revealed.rounds })}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-asphalt-500">{t('fair.previousNone')}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-nitro-500/25 bg-nitro-500/8 px-3.5 py-3">
        <span className="text-[11px] tracking-widest text-nitro-400/80 uppercase">{t('fair.rtp')}</span>
        <span className="tabular font-display text-[15px] text-nitro-400">
          {t('fair.rtpValue', { value: (THEORETICAL_RTP * 100).toFixed(2) })}
        </span>
      </div>
    </Modal>
  )
}
