/**
 * Los siete moradores del abismo. Cada rango de multiplicador tiene su propio
 * personaje, marco y paleta, de modo que el resultado se lee de un vistazo
 * antes incluso de mirar la cifra.
 */

import dragon from '@/assets/characters/dragon.webp'
import elfqueen from '@/assets/characters/elfqueen.webp'
import goblin from '@/assets/characters/goblin.webp'
import knight from '@/assets/characters/knight.webp'
import sorceress from '@/assets/characters/sorceress.webp'
import unicorn from '@/assets/characters/unicorn.webp'
import wraith from '@/assets/characters/wraith.webp'
import { HOUSE_EDGE } from './fair'

export type TierId = 'goblin' | 'wraith' | 'knight' | 'sorceress' | 'unicorn' | 'elfqueen' | 'dragon'

export interface Tier {
  id: TierId
  art: string
  /** Limite inferior inclusivo del rango de multiplicador. */
  min: number
  /** Limite superior exclusivo (Infinity en el ultimo escalon). */
  max: number
  /** Color dominante del marco, el resplandor y las particulas. */
  accent: string
  /** Tono profundo para el fondo del nicho. */
  deep: string
  /** Metal del marco, de mas oscuro a mas claro. */
  frame: [string, string, string]
  /** Peso relativo con el que aparece como relleno decorativo del carrusel. */
  reelWeight: number
}

export const TIERS: readonly Tier[] = [
  {
    id: 'goblin',
    art: goblin,
    min: 1,
    max: 2,
    accent: '#9bb03f',
    deep: '#1a2113',
    frame: ['#2b3128', '#5a6350', '#8d977f'],
    reelWeight: 26,
  },
  {
    id: 'wraith',
    art: wraith,
    min: 2,
    max: 5,
    accent: '#49a8e4',
    deep: '#101c2c',
    frame: ['#1e2739', '#3f5170', '#7e93b8'],
    reelWeight: 24,
  },
  {
    id: 'knight',
    art: knight,
    min: 5,
    max: 20,
    accent: '#f2a92c',
    deep: '#2a1c07',
    frame: ['#3a2a10', '#7d5a1d', '#d8ac52'],
    reelWeight: 19,
  },
  {
    id: 'sorceress',
    art: sorceress,
    min: 20,
    max: 100,
    accent: '#ac63f6',
    deep: '#1d1030',
    frame: ['#2b1c44', '#54357e', '#9a72d4'],
    reelWeight: 13,
  },
  {
    id: 'unicorn',
    art: unicorn,
    min: 100,
    max: 500,
    accent: '#2fe4d2',
    deep: '#062a2b',
    frame: ['#0e3536', '#1c6a68', '#54c3bd'],
    reelWeight: 9,
  },
  {
    id: 'elfqueen',
    art: elfqueen,
    min: 500,
    max: 5000,
    accent: '#3ee081',
    deep: '#08291a',
    frame: ['#0d3323', '#1c6b44', '#4fc98a'],
    reelWeight: 6,
  },
  {
    id: 'dragon',
    art: dragon,
    min: 5000,
    max: Infinity,
    accent: '#ff6a2b',
    deep: '#2c0b06',
    frame: ['#3a140b', '#8a3616', '#e2823f'],
    reelWeight: 3,
  },
] as const

export function tierFor(multiplier: number): Tier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (multiplier >= TIERS[i].min) return TIERS[i]
  }
  return TIERS[0]
}

/** Probabilidad real de que una ronda caiga en este escalon, en porcentaje. */
export function tierChance(tier: Tier): number {
  const edge = 1 - HOUSE_EDGE
  const upper = tier.max === Infinity ? 0 : edge / tier.max
  return (edge / tier.min - upper) * 100
}
