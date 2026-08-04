/**
 * Nucleo provably fair de Limbo Arcano.
 *
 * Cada ronda se deriva de HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`).
 * El jugador conoce de antemano el hash SHA-256 de la semilla del servidor, y
 * al rotarla se revela la semilla original: cualquier ronda pasada puede
 * recalcularse y compararse. Nada depende del azar del navegador en el momento
 * de la jugada.
 *
 * SHA-256 y HMAC van implementados a mano en vez de usar `crypto.subtle` porque
 * la WebCrypto asincrona solo existe en contextos seguros (https/localhost) y
 * el verificador debe poder ejecutarse en cualquier sitio y de forma sincrona.
 */

/** Ventaja de la casa: RTP del 99%, identica en todos los objetivos. */
export const HOUSE_EDGE = 0.01

/** Multiplicador maximo pagable (tope de la casa). */
export const MAX_MULTIPLIER = 1_000_000

/** Objetivo minimo aceptado por el juego. */
export const MIN_TARGET = 1.01

const K = /* @__PURE__ */ new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0

export function sha256(message: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])

  const len = message.length
  const bitLen = len * 8
  const paddedLen = Math.ceil((len + 9) / 64) * 64

  const buf = new Uint8Array(paddedLen)
  buf.set(message)
  buf[len] = 0x80

  const view = new DataView(buf.buffer)
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x1_0000_0000), false)
  view.setUint32(paddedLen - 4, bitLen % 0x1_0000_0000, false)

  const w = new Uint32Array(64)

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false)

    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]
      const y = w[i - 2]
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h[0]
    let b = h[1]
    let c = h[2]
    let d = h[3]
    let e = h[4]
    let f = h[5]
    let g = h[6]
    let s = h[7]

    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0
      const ch = ((e & f) ^ (~e & g)) >>> 0
      const t1 = (s + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const t2 = (S0 + maj) >>> 0

      s = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }

    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + s) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i], false)
  return out
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = new Uint8Array(64)
  block.set(key.length > 64 ? sha256(key) : key)

  const inner = new Uint8Array(64 + message.length)
  const outer = new Uint8Array(64 + 32)

  for (let i = 0; i < 64; i++) {
    inner[i] = block[i] ^ 0x36
    outer[i] = block[i] ^ 0x5c
  }

  inner.set(message, 64)
  outer.set(sha256(inner), 64)
  return sha256(outer)
}

const encoder = /* @__PURE__ */ new TextEncoder()

export const utf8 = (value: string) => encoder.encode(value)

export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

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

/**
 * Convierte los primeros cuatro octetos del digest en un uniforme [0, 1).
 * Es la construccion estandar de la industria: cada octeto aporta 8 bits de
 * precision decreciente, dando 32 bits utiles.
 */
export function bytesToFloat(digest: Uint8Array): number {
  let float = 0
  for (let i = 0; i < 4; i++) float += digest[i] / 256 ** (i + 1)
  return float
}

/**
 * Distribucion de Limbo: `multiplicador = (1 - ventaja) / uniforme`, truncado a
 * dos decimales. De ahi sale que P(resultado >= objetivo) = 0.99 / objetivo,
 * exacto para cualquier objetivo multiplo de 0.01.
 */
export function floatToMultiplier(float: number): number {
  const safe = float > 0 ? float : Number.MIN_VALUE

  // El cociente binario puede quedar un ULP por debajo del valor exacto
  // (0.99 / 0.1 devuelve 9.899999999999999), y truncar eso a dos decimales
  // daria 9.89: un centesimo robado al jugador y la probabilidad anunciada
  // rota. Doce cifras significativas absorben el error sin llegar a confundir
  // dos resultados distintos, que se diferencian como minimo en 1 parte de 1e8.
  const scaled = ((1 - HOUSE_EDGE) * 100) / safe
  const truncated = Math.floor(Number(scaled.toPrecision(12))) / 100

  return Math.min(Math.max(truncated, 1), MAX_MULTIPLIER)
}

export interface RoundProof {
  multiplier: number
  float: number
  hmac: string
}

/** Resuelve una ronda de forma determinista a partir de las tres entradas. */
export function resolveRound(serverSeed: string, clientSeed: string, nonce: number): RoundProof {
  const digest = hmacSha256(utf8(serverSeed), utf8(`${clientSeed}:${nonce}`))
  const float = bytesToFloat(digest)
  return { multiplier: floatToMultiplier(float), float, hmac: toHex(digest) }
}

/** Probabilidad de acierto en porcentaje para un objetivo dado. */
export function winChance(target: number): number {
  if (!Number.isFinite(target) || target < 1) return 0
  return ((1 - HOUSE_EDGE) / target) * 100
}

/** Objetivo necesario para una probabilidad de acierto dada (en porcentaje). */
export function targetForChance(chance: number): number {
  if (chance <= 0) return MAX_MULTIPLIER
  return roundTarget(((1 - HOUSE_EDGE) / (chance / 100)) as number)
}

/** Los objetivos deben ser multiplos exactos de 0.01 para que la ventaja sea la anunciada. */
export function roundTarget(target: number): number {
  if (!Number.isFinite(target)) return MIN_TARGET
  const snapped = Math.round(target * 100) / 100
  return Math.min(Math.max(snapped, MIN_TARGET), MAX_MULTIPLIER)
}
