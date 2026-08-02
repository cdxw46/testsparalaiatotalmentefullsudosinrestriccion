import type { SymbolDef, SymbolId } from './types';

export const GRID_SIZE = 7;
export const MIN_CLUSTER = 5;

/** Multiplier steps inspired by progressive spot systems */
export const MULTIPLIER_STEPS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];

export const SYMBOLS: SymbolDef[] = [
  {
    id: 'bear-red',
    name: 'Gummy Rubí',
    weight: 14,
    pays: { 5: 0.2, 6: 0.4, 7: 0.8, 8: 1.5, 9: 2.5, 10: 5, 12: 10, 15: 25 },
  },
  {
    id: 'bear-purple',
    name: 'Gummy Uva',
    weight: 14,
    pays: { 5: 0.2, 6: 0.4, 7: 0.8, 8: 1.5, 9: 2.5, 10: 5, 12: 10, 15: 25 },
  },
  {
    id: 'bear-orange',
    name: 'Gummy Mandarina',
    weight: 14,
    pays: { 5: 0.25, 6: 0.5, 7: 1, 8: 2, 9: 3, 10: 6, 12: 12, 15: 30 },
  },
  {
    id: 'heart',
    name: 'Corazón',
    weight: 12,
    pays: { 5: 0.3, 6: 0.6, 7: 1.2, 8: 2.5, 9: 4, 10: 8, 12: 16, 15: 40 },
  },
  {
    id: 'star',
    name: 'Estrella',
    weight: 11,
    pays: { 5: 0.4, 6: 0.8, 7: 1.5, 8: 3, 9: 5, 10: 10, 12: 20, 15: 50 },
  },
  {
    id: 'round',
    name: 'Bola Rosa',
    weight: 10,
    pays: { 5: 0.5, 6: 1, 7: 2, 8: 4, 9: 7, 10: 14, 12: 28, 15: 70 },
  },
  {
    id: 'bean',
    name: 'Jelly Bean',
    weight: 9,
    pays: { 5: 0.6, 6: 1.2, 7: 2.5, 8: 5, 9: 9, 10: 18, 12: 36, 15: 90 },
  },
  {
    id: 'lime',
    name: 'Limón Glaze',
    weight: 8,
    pays: { 5: 0.8, 6: 1.6, 7: 3, 8: 6, 9: 12, 10: 24, 12: 48, 15: 120 },
  },
  {
    id: 'scatter',
    name: 'Máquina Scatter',
    weight: 3,
    pays: {},
    isScatter: true,
  },
];

const WEIGHT_TOTAL = SYMBOLS.reduce((s, x) => s + x.weight, 0);
const BY_ID = Object.fromEntries(SYMBOLS.map((s) => [s.id, s])) as Record<SymbolId, SymbolDef>;

export function getSymbol(id: SymbolId): SymbolDef {
  return BY_ID[id];
}

export function randomSymbol(excludeScatter = false): SymbolId {
  const pool = excludeScatter ? SYMBOLS.filter((s) => !s.isScatter) : SYMBOLS;
  const total = pool.reduce((s, x) => s + x.weight, 0);
  let roll = Math.random() * total;
  for (const s of pool) {
    roll -= s.weight;
    if (roll <= 0) return s.id;
  }
  return pool[pool.length - 1].id;
}

export function payoutForCluster(symbol: SymbolId, size: number): number {
  const def = getSymbol(symbol);
  if (def.isScatter) return 0;
  const keys = Object.keys(def.pays)
    .map(Number)
    .sort((a, b) => a - b);
  let pay = 0;
  for (const k of keys) {
    if (size >= k) pay = def.pays[k];
  }
  return pay;
}

export function freeSpinsFromScatters(count: number): number {
  if (count >= 5) return 15;
  if (count >= 4) return 12;
  if (count >= 3) return 10;
  return 0;
}

export { WEIGHT_TOTAL };
