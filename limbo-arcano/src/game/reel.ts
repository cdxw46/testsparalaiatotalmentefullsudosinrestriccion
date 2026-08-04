/**
 * Relleno decorativo del carrusel.
 *
 * Las casillas que no son el resultado existen solo para que la tira tenga algo
 * que mostrar mientras gira. Si se sortearan con la distribucion real de Limbo,
 * la mitad de la tira serian multiplicadores por debajo de 2x y el carrusel se
 * veria plano, asi que se reparten entre escalones con pesos propios. El unico
 * numero que decide la ronda es el que devuelve `resolveRound`.
 *
 * El valor de cada casilla se deriva de su indice, de forma que la tira es
 * estable: retroceder y volver a avanzar muestra siempre lo mismo.
 */

import { TIERS, type Tier } from './tiers'

/** PRNG de 32 bits, rapido y estable entre navegadores. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TOTAL_WEIGHT = TIERS.reduce((sum, tier) => sum + tier.reelWeight, 0)

/** El ultimo escalon no tiene techo: se le da uno para poder muestrear dentro. */
const tierCeiling = (tier: Tier) => (tier.max === Infinity ? 200_000 : tier.max)

export function fillerMultiplier(index: number, salt = 0): number {
  const rand = mulberry32(index * 0x9e3779b1 + salt * 0x85ebca6b)

  let ticket = rand() * TOTAL_WEIGHT
  let tier = TIERS[0]
  for (const candidate of TIERS) {
    ticket -= candidate.reelWeight
    if (ticket <= 0) {
      tier = candidate
      break
    }
  }

  // Reparto logaritmico: dentro de 5x-20x los valores bajos no acaparan la vista.
  const low = Math.log(tier.min)
  const high = Math.log(tierCeiling(tier))
  const value = Math.exp(low + rand() * (high - low))

  return Math.max(1, Math.floor(value * 100) / 100)
}
