/**
 * Aleatoriedad verificable de Ruta Nitro.
 *
 * Una tirada de tragaperras necesita cientos de numeros aleatorios: treinta
 * simbolos iniciales, los rellenos de cada cascada, los tamanos de expansion...
 * Todos salen de un unico flujo determinista derivado de
 * `HMAC_SHA256(serverSeed, clientSeed:nonce:cursor)`, donde el cursor avanza a
 * medida que se consumen numeros. Con las tres semillas y el mismo motor, una
 * tirada pasada se reproduce entera, simbolo a simbolo.
 *
 * Es la misma construccion que usan las casas provably fair: cada digest de 32
 * octetos rinde ocho flotantes de 32 bits.
 */

import { hmacSha256, sha256, toHex, utf8 } from './hash.ts'

export { sha256, hmacSha256, toHex, utf8 }

export const sha256Hex = (value: string) => toHex(sha256(utf8(value)))

/** Semilla criptografica de `bytes` octetos en hexadecimal. */
export function randomSeed(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return toHex(buf)
}

/** Semilla de cliente legible, editable por el jugador. */
export function randomClientSeed(length = 12): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789'
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[buf[i] % alphabet.length]
  return out
}

/** Cuatro octetos consecutivos del digest -> uniforme en [0, 1). */
function bytesToFloat(digest: Uint8Array, offset: number): number {
  let float = 0
  for (let i = 0; i < 4; i++) float += digest[offset + i] / 256 ** (i + 1)
  return float
}

export interface Rng {
  /** Siguiente uniforme en [0, 1). */
  next(): number
  /** Entero en [0, max). */
  int(max: number): number
  /** Elemento al azar de una lista no vacia. */
  pick<T>(items: readonly T[]): T
  /** Cuantos numeros se han consumido; util para depurar una reproduccion. */
  consumed(): number
}

/**
 * Flujo determinista de uniformes. Cada bloque HMAC aporta ocho valores; cuando
 * se agotan se pide el siguiente avanzando el cursor, de modo que el flujo es
 * ilimitado y reproducible sin guardar estado ninguno.
 */
export function createRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  const key = utf8(serverSeed)
  let cursor = 0
  let block: number[] = []
  let used = 0

  const next = () => {
    if (block.length === 0) {
      const digest = hmacSha256(key, utf8(`${clientSeed}:${nonce}:${cursor}`))
      cursor += 1
      // Se rellena al reves para poder extraer con `pop`, que es O(1).
      for (let offset = 28; offset >= 0; offset -= 4) block.push(bytesToFloat(digest, offset))
    }
    used += 1
    return block.pop() as number
  }

  return {
    next,
    int: (max) => Math.min(Math.floor(next() * max), max - 1),
    pick: (items) => items[Math.min(Math.floor(next() * items.length), items.length - 1)],
    consumed: () => used,
  }
}

/** Elige un elemento segun pesos relativos consumiendo un solo numero. */
export function weightedPick<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  let total = 0
  for (const [, weight] of entries) total += weight

  let ticket = rng.next() * total
  for (const [value, weight] of entries) {
    ticket -= weight
    if (ticket < 0) return value
  }

  return entries[entries.length - 1][0]
}
