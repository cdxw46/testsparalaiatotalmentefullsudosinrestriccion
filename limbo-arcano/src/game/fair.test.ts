import { describe, expect, it } from 'vitest'
import {
  MIN_TARGET,
  bytesToFloat,
  floatToMultiplier,
  hmacSha256,
  resolveRound,
  roundTarget,
  sha256,
  sha256Hex,
  toHex,
  utf8,
  winChance,
} from './fair'

const hex = (value: string) => toHex(sha256(utf8(value)))

describe('sha256', () => {
  it('reproduce los vectores publicados del FIPS 180-4', () => {
    expect(hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('cruza el limite de bloque sin desalinearse', () => {
    // 64 octetos exactos: fuerza un bloque entero de relleno adicional.
    expect(hex('a'.repeat(64))).toBe('ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb')
    expect(hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3')
  })
})

describe('hmacSha256', () => {
  it('reproduce los casos 1 y 2 del RFC 4231', () => {
    const key = new Uint8Array(20).fill(0x0b)
    expect(toHex(hmacSha256(key, utf8('Hi There')))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    )
    expect(toHex(hmacSha256(utf8('Jefe'), utf8('what do ya want for nothing?')))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    )
  })

  it('aplica el hash previo a las claves de mas de 64 octetos', () => {
    const key = new Uint8Array(131).fill(0xaa)
    expect(toHex(hmacSha256(key, utf8('Test Using Larger Than Block-Size Key - Hash Key First')))).toBe(
      '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
    )
  })
})

describe('bytesToFloat', () => {
  it('recorre el intervalo [0, 1)', () => {
    expect(bytesToFloat(new Uint8Array([0, 0, 0, 0]))).toBe(0)
    expect(bytesToFloat(new Uint8Array([255, 255, 255, 255]))).toBeLessThan(1)
    expect(bytesToFloat(new Uint8Array([128, 0, 0, 0]))).toBeCloseTo(0.5, 12)
  })
})

describe('floatToMultiplier', () => {
  it('trunca a dos decimales en vez de redondear', () => {
    // 0.99 / 0.1 = 9.9 exacto; 0.99 / 0.07 = 14.142857... -> 14.14
    expect(floatToMultiplier(0.1)).toBe(9.9)
    expect(floatToMultiplier(0.07)).toBe(14.14)
  })

  it('nunca baja de 1.00', () => {
    expect(floatToMultiplier(0.999)).toBe(1)
    expect(floatToMultiplier(0.99)).toBe(1)
  })

  it('soporta el uniforme degenerado sin devolver infinito', () => {
    expect(Number.isFinite(floatToMultiplier(0))).toBe(true)
  })
})

describe('winChance', () => {
  it('codifica el 1% de ventaja de la casa', () => {
    expect(winChance(2)).toBeCloseTo(49.5, 10)
    expect(winChance(10)).toBeCloseTo(9.9, 10)
    expect(winChance(100)).toBeCloseTo(0.99, 10)
  })
})

describe('roundTarget', () => {
  it('encaja el objetivo en pasos de 0.01 dentro de los limites', () => {
    expect(roundTarget(2.005)).toBe(2.01)
    expect(roundTarget(0.5)).toBe(MIN_TARGET)
    expect(roundTarget(Number.NaN)).toBe(MIN_TARGET)
    expect(roundTarget(99_999_999)).toBe(1_000_000)
  })
})

describe('resolveRound', () => {
  it('es determinista para las mismas tres entradas', () => {
    const a = resolveRound('deadbeef', 'jugador', 7)
    const b = resolveRound('deadbeef', 'jugador', 7)
    expect(a).toEqual(b)
  })

  it('cambia con cualquiera de las tres entradas', () => {
    const base = resolveRound('deadbeef', 'jugador', 7).multiplier
    expect(resolveRound('deadbeee', 'jugador', 7).multiplier).not.toBe(base)
    expect(resolveRound('deadbeef', 'jugadoR', 7).multiplier).not.toBe(base)
    expect(resolveRound('deadbeef', 'jugador', 8).multiplier).not.toBe(base)
  })

  it('el hash de la semilla coincide con el compromiso publicado', () => {
    expect(sha256Hex('deadbeef')).toBe(hex('deadbeef'))
  })
})

describe('distribucion', () => {
  const SAMPLES = 200_000
  const server = 'ab'.repeat(32)

  /** Frecuencia observada de resultados que alcanzan `target`. */
  const observed = (target: number) => {
    let hits = 0
    for (let nonce = 0; nonce < SAMPLES; nonce++) {
      if (resolveRound(server, 'muestra', nonce).multiplier >= target) hits++
    }
    return (hits / SAMPLES) * 100
  }

  it.each([
    [1.5, 66],
    [2, 49.5],
    [5, 19.8],
    [10, 9.9],
  ])('acierta el %sx cerca del %s%% teorico', (target, expected) => {
    // Tolerancia holgada: con 200k muestras el error tipico ronda las decimas.
    expect(observed(target)).toBeCloseTo(expected, 0)
  })

  it('devuelve un RTP del 99% al apostar siempre al mismo objetivo', () => {
    const target = 3
    let returned = 0
    for (let nonce = 0; nonce < SAMPLES; nonce++) {
      if (resolveRound(server, 'rtp', nonce).multiplier >= target) returned += target
    }
    expect(returned / SAMPLES).toBeCloseTo(0.99, 1)
  })
})
