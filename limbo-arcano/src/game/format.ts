const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const plain = new Intl.NumberFormat('en-US')

export const formatMoney = (value: number) => money.format(Number.isFinite(value) ? value : 0)

export function formatSigned(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${money.format(Math.abs(value))}`
}

/** `12.4827` -> `12.48x`; los valores enormes se abrevian para no romper el marco. */
export function formatMultiplier(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1_000_000) return `${plain.format(Math.round(value / 1_000_000))}Mx`
  if (value >= 100_000) return `${plain.format(Math.round(value / 1000))}Kx`
  return `${money.format(value)}x`
}

/** Probabilidades diminutas siguen siendo legibles: `0.0099%` en vez de `0.01%`. */
export function formatChance(chance: number): string {
  if (chance >= 10) return `${chance.toFixed(2)}%`
  if (chance >= 0.01) return `${chance.toFixed(4)}%`
  if (chance <= 0) return '0%'
  return `${chance.toPrecision(2)}%`
}

export const shortHash = (hash: string, size = 8) =>
  hash.length <= size * 2 ? hash : `${hash.slice(0, size)}…${hash.slice(-size)}`
