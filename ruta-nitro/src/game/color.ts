/**
 * Los acentos se declaran en hexadecimal por legibilidad, pero el CSS los
 * necesita como triplete `r g b` para poder modular la opacidad desde una
 * variable con `rgb(var(--accent) / <alpha>)`.
 */

const cache = new Map<string, string>()

export function triplet(hex: string): string {
  const cached = cache.get(hex)
  if (cached) return cached

  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean
  const value = Number.parseInt(full, 16)
  const result = `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`

  cache.set(hex, result)
  return result
}
