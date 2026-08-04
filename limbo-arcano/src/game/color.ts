/**
 * Los colores de escalon se guardan en hexadecimal por legibilidad, pero el CSS
 * los necesita como triplete `r g b` para poder modular la opacidad con
 * `rgb(var(--accent) / <alpha>)` desde una variable.
 */

const cache = new Map<string, string>()

export function triplet(hex: string): string {
  const cached = cache.get(hex)
  if (cached) return cached

  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean
  const value = parseInt(full, 16)
  const result = `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`

  cache.set(hex, result)
  return result
}
