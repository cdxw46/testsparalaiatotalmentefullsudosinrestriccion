import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../ui/Modal'
import { CopyRow } from '../ui/CopyRow'
import { Icon } from '../ui/Icon'
import { audio } from '@/game/audio'
import { formatMultiplier } from '@/game/format'
import { randomClientSeed, resolveRound, sha256Hex } from '@/game/fair'
import { tierFor } from '@/game/tiers'
import { translate } from '@/i18n'
import { useT } from '@/hooks/useT'
import { useGame } from '@/store/useGame'
import type { TranslationKey } from '@/i18n'

export interface VerifierPrefill {
  serverSeed: string
  clientSeed: string
  nonce: number
}

interface FairnessModalProps {
  open: boolean
  onClose: () => void
  prefill: VerifierPrefill | null
}

export function FairnessModal({ open, onClose, prefill }: FairnessModalProps) {
  const t = useT()
  const lang = useGame((state) => state.settings.lang)
  const fair = useGame((state) => state.fair)
  const phase = useGame((state) => state.phase)
  const setClientSeed = useGame((state) => state.setClientSeed)
  const rotateSeeds = useGame((state) => state.rotateSeeds)

  const [seedDraft, setSeedDraft] = useState(fair.clientSeed)
  const [check, setCheck] = useState({ serverSeed: '', clientSeed: fair.clientSeed, nonce: '0' })

  useEffect(() => setSeedDraft(fair.clientSeed), [fair.clientSeed])

  useEffect(() => {
    if (prefill) setCheck({ serverSeed: prefill.serverSeed, clientSeed: prefill.clientSeed, nonce: String(prefill.nonce) })
  }, [prefill])

  const verified = useMemo(() => {
    if (!check.serverSeed.trim()) return null
    const nonce = Number.parseInt(check.nonce, 10)
    const proof = resolveRound(check.serverSeed.trim(), check.clientSeed, Number.isFinite(nonce) ? nonce : 0)
    return { ...proof, hash: sha256Hex(check.serverSeed.trim()) }
  }, [check])

  const verifiedTier = verified ? tierFor(verified.multiplier) : null

  return (
    <Modal open={open} onClose={onClose} title={t('fair.title')} icon={<Icon name="shield" />} wide>
      <p className="mb-5 text-[13px] leading-relaxed text-abyss-300">{t('fair.intro')}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3.5 rounded-xl border border-white/7 bg-black/25 p-3.5">
          <CopyRow label={t('fair.serverHash')} value={fair.serverSeedHash} hint={t('fair.serverHashHint')} />

          <div>
            <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-abyss-300 uppercase">
              {t('fair.clientSeed')}
            </span>
            <div className="inset-field flex items-center gap-2 rounded-lg px-3">
              <input
                value={seedDraft}
                spellCheck={false}
                aria-label={t('fair.clientSeed')}
                onChange={(event) => setSeedDraft(event.target.value)}
                onBlur={() => setClientSeed(seedDraft)}
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
                  setSeedDraft(next)
                  setClientSeed(next)
                }}
                className="btn-ghost grid size-7 shrink-0 place-items-center rounded-md"
              >
                <Icon name="refresh" className="size-3.5" />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-abyss-500">{t('fair.clientSeedHint')}</p>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-abyss-300 uppercase">
                {t('fair.nonce')}
              </span>
              <div className="inset-field tabular flex h-11 items-center rounded-lg px-3 text-[15px] font-bold text-white">
                {fair.nonce}
              </div>
            </div>
            <button
              type="button"
              disabled={phase === 'rolling'}
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
          <p className="text-[11px] text-abyss-500">{t('fair.rotateHint')}</p>

          <div className="border-t border-white/7 pt-3.5">
            <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-abyss-300 uppercase">
              {t('fair.previous')}
            </span>
            {fair.revealed ? (
              <>
                <code className="block truncate rounded-lg border border-jade-500/25 bg-jade-600/8 px-3 py-2.5 font-mono text-[12px] text-jade-300">
                  {fair.revealed.serverSeed}
                </code>
                <p className="mt-1.5 text-[11px] text-abyss-500">
                  {t('fair.previousRounds', { n: fair.revealed.rounds })}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-abyss-500">{t('fair.previousNone')}</p>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-white/7 bg-black/25 p-3.5">
          <div>
            <h3 className="font-display text-[13px] font-bold tracking-wide text-white">{t('fair.verifier')}</h3>
            <p className="mt-1 text-[11.5px] text-abyss-500">{t('fair.verifierHint')}</p>
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-abyss-300 uppercase">
              {t('fair.serverSeed')}
            </span>
            <textarea
              value={check.serverSeed}
              spellCheck={false}
              rows={2}
              placeholder="a3f1…"
              aria-label={t('fair.serverSeed')}
              onChange={(event) => setCheck((current) => ({ ...current, serverSeed: event.target.value }))}
              className="inset-field w-full resize-none rounded-lg px-3 py-2.5 font-mono text-[12px] break-all text-white outline-none"
            />
          </div>

          <div className="grid grid-cols-[1fr_7rem] gap-2.5">
            <div>
              <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-abyss-300 uppercase">
                {t('fair.clientSeed')}
              </span>
              <input
                value={check.clientSeed}
                spellCheck={false}
                aria-label={`${t('fair.verifier')} · ${t('fair.clientSeed')}`}
                onChange={(event) => setCheck((current) => ({ ...current, clientSeed: event.target.value }))}
                className="inset-field h-11 w-full rounded-lg px-3 font-mono text-[12.5px] text-white outline-none"
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-abyss-300 uppercase">
                {t('fair.nonce')}
              </span>
              <input
                value={check.nonce}
                inputMode="numeric"
                aria-label={`${t('fair.verifier')} · ${t('fair.nonce')}`}
                onChange={(event) =>
                  setCheck((current) => ({ ...current, nonce: event.target.value.replace(/\D/g, '') }))
                }
                className="inset-field tabular h-11 w-full rounded-lg px-3 text-[13px] font-semibold text-white outline-none"
              />
            </div>
          </div>

          <div className="rounded-lg border border-white/8 bg-black/40 p-3">
            <span className="mb-1 block text-[10.5px] tracking-widest text-abyss-500 uppercase">
              {t('fair.result')}
            </span>
            {verified && verifiedTier ? (
              <>
                <span
                  className="tabular font-display block text-3xl font-bold"
                  style={{ color: verifiedTier.accent }}
                >
                  {formatMultiplier(verified.multiplier)}
                </span>
                <span className="mt-0.5 block text-[11px] text-abyss-400">
                  {translate(lang, `tier.${verifiedTier.id}` as TranslationKey)}
                </span>
                <dl className="mt-2.5 space-y-1 border-t border-white/7 pt-2.5 font-mono text-[10.5px] text-abyss-400">
                  <div className="flex gap-2">
                    <dt className="shrink-0">sha256(server)</dt>
                    <dd className="min-w-0 flex-1 truncate text-right text-abyss-300">{verified.hash}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0">hmac</dt>
                    <dd className="min-w-0 flex-1 truncate text-right text-abyss-300">{verified.hmac}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0">float</dt>
                    <dd className="min-w-0 flex-1 truncate text-right text-abyss-300">
                      {verified.float.toFixed(10)}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <span className="font-display block text-3xl font-bold text-abyss-600">—</span>
            )}
          </div>

          <code className="block rounded-lg border border-white/7 bg-black/40 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-abyss-400">
            hmac = HMAC_SHA256(server, `client:nonce`)
            <br />
            float = Σ hmac[i] / 256^(i+1), i = 0..3
            <br />
            mult = max(1, floor(0.99 / float × 100) / 100)
          </code>
        </div>
      </div>
    </Modal>
  )
}
