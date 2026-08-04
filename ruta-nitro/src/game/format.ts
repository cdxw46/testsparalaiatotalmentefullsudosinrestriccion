const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export const formatMoney = (value: number) => money.format(Number.isFinite(value) ? value : 0)

/** `1234.5` -> `1,235x`; las cifras pequenas conservan sus dos decimales. */
export function formatX(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1000) return `${compact.format(Math.round(value))}x`
  if (value >= 100) return `${value.toFixed(0)}x`
  return `${money.format(value)}x`
}

export const shortHash = (hash: string, size = 8) =>
  hash.length <= size * 2 ? hash : `${hash.slice(0, size)}…${hash.slice(-size)}`
