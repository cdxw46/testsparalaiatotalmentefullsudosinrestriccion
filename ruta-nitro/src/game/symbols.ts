/**
 * Catalogo de simbolos, tabla de pagos y pesos de los bombos.
 *
 * El juego paga por dispersion: no hay lineas, gana quien reune ocho o mas
 * simbolos iguales en cualquier parte de la rejilla. Por eso la tabla se indexa
 * por cantidad y no por posicion.
 *
 * Este modulo es datos puros, sin importaciones de imagenes, para que el motor
 * y el simulador de RTP puedan correr en Node sin pasar por el bundler. La
 * parte visual esta en `art.ts`.
 */

/** Simbolos que forman combinacion por si mismos. */
export type PaySymbol = 'can' | 'cone' | 'plug' | 'wrench' | 'tyre' | 'rust' | 'duchess' | 'baron' | 'scarlet'

/**
 * `flag`  comodin, sustituye a cualquier simbolo de pago.
 * `lights` dispersion, abre las vueltas gratis.
 * `nitro`  bidon explosivo, limpia un area y duplica sus multiplicadores.
 * `gear`   cambio de marcha, revela un simbolo y lo expande por su columna.
 * `lap`    vuelta extra, solo aparece durante las vueltas gratis.
 */
export type SpecialSymbol = 'flag' | 'lights' | 'nitro' | 'gear' | 'lap'

export type SymbolId = PaySymbol | SpecialSymbol

export const PAY_SYMBOLS: readonly PaySymbol[] = [
  'can',
  'cone',
  'plug',
  'wrench',
  'tyre',
  'rust',
  'duchess',
  'baron',
  'scarlet',
]

export const HIGH_SYMBOLS: readonly PaySymbol[] = ['rust', 'duchess', 'baron', 'scarlet']

/** Minimo de simbolos iguales que forman premio. */
export const MIN_CLUSTER = 8

/** Pago en veces la apuesta para 8-9, 10-11 y 12 o mas coincidencias. */
export const PAYTABLE: Record<PaySymbol, readonly [number, number, number]> = {
  can: [0.028, 0.056, 0.122],
  cone: [0.038, 0.075, 0.15],
  plug: [0.047, 0.094, 0.197],
  wrench: [0.056, 0.122, 0.244],
  tyre: [0.075, 0.15, 0.3],
  rust: [0.103, 0.197, 0.395],
  duchess: [0.15, 0.29, 0.583],
  baron: [0.197, 0.395, 0.78],
  scarlet: [0.29, 0.583, 1.175],
}

export function payFor(symbol: PaySymbol, count: number): number {
  if (count < MIN_CLUSTER) return 0
  const band = count >= 12 ? 2 : count >= 10 ? 1 : 0
  return PAYTABLE[symbol][band]
}

type Weights = readonly (readonly [SymbolId, number])[]

/**
 * Pesos del bombo base. Ajustados por simulacion Monte Carlo hasta dejar el RTP
 * en la franja del 96% (ver `engine.test.ts`); tocarlos desequilibra el juego.
 */
export const BASE_WEIGHTS: Weights = [
  ['can', 112],
  ['cone', 108],
  ['plug', 104],
  ['wrench', 100],
  ['tyre', 96],
  ['rust', 90],
  ['duchess', 84],
  ['baron', 78],
  ['scarlet', 72],
  ['flag', 14],
  ['gear', 33],
  ['nitro', 9],
  ['lights', 9],
]

/**
 * Durante las vueltas gratis el bombo es mas generoso en modificadores: mas
 * marchas y bidones, y aparece el simbolo de vuelta extra.
 */
export const FREE_WEIGHTS: Weights = [
  ['can', 116],
  ['cone', 110],
  ['plug', 104],
  ['wrench', 98],
  ['tyre', 92],
  ['rust', 84],
  ['duchess', 76],
  ['baron', 68],
  ['scarlet', 60],
  ['flag', 12],
  ['gear', 3],
  ['nitro', 12],
  ['lights', 5],
  ['lap', 3],
]

export const isPaySymbol = (id: SymbolId): id is PaySymbol =>
  (PAY_SYMBOLS as readonly string[]).includes(id)

/**
 * RTP medido, no calculado: la mecanica de marcas acumulables no se resuelve a
 * mano. Sale de `npm run simulate -- 8000000`, y cualquier retoque de pesos o
 * de la tabla obliga a volver a medirlo.
 */
export const THEORETICAL_RTP = 0.9605
