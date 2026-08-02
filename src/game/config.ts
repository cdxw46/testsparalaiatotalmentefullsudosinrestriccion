import type { ReelSetId, SymbolId } from './types';

export const COLS = 7;
export const ROWS = 7;
export const CELLS = COLS * ROWS;

/** Tamaño mínimo de un cluster pagado. */
export const MIN_CLUSTER = 5;

/** Los pagos se definen para tamaños 5..15; a partir de 15 se usa el mismo valor. */
export const PAY_MIN_SIZE = 5;
export const PAY_MAX_SIZE = 15;

/** Tope de pago por tirada (o por ronda de tiradas gratis) en múltiplos de la apuesta. */
export const MAX_WIN_MULTIPLIER = 5000;

/** Escalera de los multiplicadores persistentes. */
export const MULTIPLIER_LADDER = [2, 4, 8, 16, 32, 64, 128] as const;

export const SYMBOL_IDS: SymbolId[] = [
  'bearRed',
  'bearOrange',
  'bearPurple',
  'bean',
  'gumball',
  'heart',
  'star',
  'scatter',
];

/** Símbolos que forman clusters (el scatter nunca paga por cluster). */
export const PAYING_SYMBOLS: SymbolId[] = SYMBOL_IDS.filter((s) => s !== 'scatter');

export interface SymbolMeta {
  id: SymbolId;
  name: string;
  tier: 'low' | 'mid' | 'high' | 'scatter';
  /** Color principal, usado en partículas y brillos. */
  color: number;
  texture: string;
}

export const SYMBOLS: Record<SymbolId, SymbolMeta> = {
  bearRed: {
    id: 'bearRed',
    name: 'Osito rojo',
    tier: 'low',
    color: 0xff2d55,
    texture: 'sym_bear_red',
  },
  bearOrange: {
    id: 'bearOrange',
    name: 'Osito naranja',
    tier: 'low',
    color: 0xff8a1f,
    texture: 'sym_bear_orange',
  },
  bearPurple: {
    id: 'bearPurple',
    name: 'Osito morado',
    tier: 'low',
    color: 0x9b4dff,
    texture: 'sym_bear_purple',
  },
  bean: {
    id: 'bean',
    name: 'Gomita violeta',
    tier: 'mid',
    color: 0xd946ef,
    texture: 'sym_bean',
  },
  gumball: {
    id: 'gumball',
    name: 'Chicle rosa',
    tier: 'mid',
    color: 0xff4fa3,
    texture: 'sym_gumball',
  },
  heart: {
    id: 'heart',
    name: 'Corazón',
    tier: 'high',
    color: 0xff5722,
    texture: 'sym_heart',
  },
  star: {
    id: 'star',
    name: 'Estrella',
    tier: 'high',
    color: 0x4ade22,
    texture: 'sym_star',
  },
  scatter: {
    id: 'scatter',
    name: 'Máquina de chicles',
    tier: 'scatter',
    color: 0xffe066,
    texture: 'sym_scatter',
  },
};

/**
 * Tabla de pagos en múltiplos de la apuesta total, por tamaño de cluster (5..15+).
 * Los valores fueron ajustados con `npm run sim` para un RTP cercano al 96,5 %.
 */
const PAYTABLE_BY_TIER: Record<'low' | 'mid' | 'high', number[]> = {
  //        5     6     7     8     9    10    11    12    13     14     15+
  low: [0.15, 0.2, 0.3, 0.4, 0.6, 0.9, 1.3, 1.8, 2.6, 4.0, 7.0],
  mid: [0.25, 0.35, 0.5, 0.7, 1.0, 1.4, 2.0, 2.9, 4.2, 6.5, 11.0],
  high: [0.4, 0.6, 0.85, 1.2, 1.7, 2.4, 3.4, 5.0, 7.5, 12.0, 18.0],
};

/**
 * Ajuste global de todos los pagos. El valor sale de `npx tsx src/sim/tune.ts`
 * y deja el RTP total en 96,5 % (41,9 % juego base + 54,6 % tiradas gratis).
 */
export const DEFAULT_PAY_SCALE = 2.4556;

let payScale = DEFAULT_PAY_SCALE;

export const PAYTABLE = {} as Record<SymbolId, number[]>;

function rebuildPaytable(): void {
  for (const id of SYMBOL_IDS) {
    const tier = SYMBOLS[id].tier;
    const row = tier === 'scatter' ? [] : PAYTABLE_BY_TIER[tier];
    PAYTABLE[id] = row.map((v) => Number((v * payScale).toFixed(4)));
  }
}

rebuildPaytable();

export function getPayScale(): number {
  return payScale;
}

/** Reescala toda la tabla de pagos; lo usa el calibrador `src/sim/tune.ts`. */
export function setPayScale(scale: number): void {
  payScale = scale;
  rebuildPaytable();
}

/** Pago (en múltiplos de la apuesta) de un cluster de `size` símbolos `symbol`. */
export function clusterPay(symbol: SymbolId, size: number): number {
  const row = PAYTABLE[symbol];
  if (!row.length || size < PAY_MIN_SIZE) return 0;
  const idx = Math.min(size, PAY_MAX_SIZE) - PAY_MIN_SIZE;
  return row[idx] ?? 0;
}

/**
 * Configuración de las cintas de rodillos. Como en los juegos de clusters
 * reales, cada columna lee una cinta con rachas del mismo símbolo: esas rachas
 * son las que hacen que los clusters se formen con una frecuencia jugable.
 */
export interface ReelSetConfig {
  /** Pesos de los símbolos que pagan al construir la cinta. */
  weights: Record<Exclude<SymbolId, 'scatter'>, number>;
  /** Longitud de cada cinta. */
  stripLength: number;
  /** Scatters insertados en cada cinta. */
  scattersPerStrip: number;
  /** Separación mínima entre scatters (>= 7 evita dos en la misma ventana). */
  minScatterGap: number;
  /**
   * Nivel de agrupamiento de las cintas: probabilidad de que una racha continúe.
   * 0 = símbolos siempre alternados, valores altos = rachas largas y más clusters.
   * Es la palanca principal de la frecuencia de premio.
   */
  clump: number;
  /**
   * Variante de cinta elegida durante la calibración. Dos cintas con los mismos
   * parámetros pueden diferir varios puntos de RTP, así que la variante forma
   * parte de la matemática publicada del juego.
   */
  variant: number;
}

export const MAX_RUN = 4;

/** Pesos de longitud de racha (índice 0 = racha de 1) derivados del agrupamiento. */
export function runWeights(clump: number, tier: 'low' | 'mid' | 'high'): number[] {
  const q = clump * (tier === 'low' ? 1 : tier === 'mid' ? 0.8 : 0.6);
  const out: number[] = [];
  for (let k = 0; k < MAX_RUN; k++) out.push(Math.max(0.0001, q ** k));
  return out;
}

export const REEL_SETS: Record<ReelSetId, ReelSetConfig> = {
  base: {
    weights: {
      bearRed: 200,
      bearOrange: 196,
      bearPurple: 192,
      bean: 158,
      gumball: 152,
      heart: 110,
      star: 104,
    },
    stripLength: 1337,
    scattersPerStrip: 10,
    minScatterGap: 8,
    clump: 0.2,
    variant: 2,
  },
  baseAnte: {
    weights: {
      bearRed: 200,
      bearOrange: 196,
      bearPurple: 192,
      bean: 158,
      gumball: 152,
      heart: 110,
      star: 104,
    },
    stripLength: 1284,
    scattersPerStrip: 11,
    minScatterGap: 8,
    clump: 0.2,
    variant: 0,
  },
  free: {
    weights: {
      bearRed: 186,
      bearOrange: 182,
      bearPurple: 178,
      bean: 164,
      gumball: 158,
      heart: 126,
      star: 118,
    },
    stripLength: 1260,
    scattersPerStrip: 6,
    minScatterGap: 8,
    clump: 0.31,
    variant: 0,
  },
  superFree: {
    weights: {
      bearRed: 172,
      bearOrange: 168,
      bearPurple: 166,
      bean: 168,
      gumball: 164,
      heart: 142,
      star: 134,
    },
    stripLength: 1440,
    scattersPerStrip: 6,
    minScatterGap: 8,
    clump: 0.36,
    variant: 0,
  },
};

/** Semilla fija con la que se generan las cintas: la matemática es reproducible. */
export const STRIP_SEED = 0x5ca1ab1e;

/** Coste de la apuesta ante (aumenta la probabilidad de scatter). */
export const ANTE_COST_FACTOR = 1.25;

/** Precio de las compras de función, en múltiplos de la apuesta total. */
export const BUY_FREE_SPINS_COST = 100;
export const BUY_SUPER_FREE_SPINS_COST = 500;

/** Tiradas gratis otorgadas según la cantidad de scatters. */
export function freeSpinsForScatters(count: number): number {
  if (count < 3) return 0;
  if (count === 3) return 10;
  if (count === 4) return 12;
  if (count === 5) return 15;
  if (count === 6) return 20;
  return 25;
}

/** Tiradas gratis extra al reactivar dentro de la ronda. */
export function retriggerSpins(count: number): number {
  if (count < 3) return 0;
  return count >= 5 ? 8 : 5;
}

/** Tiradas de la compra de función. */
export const BUY_FREE_SPINS_COUNT = 10;
export const BUY_SUPER_FREE_SPINS_COUNT = 12;

/**
 * Índice inicial de la escalera de multiplicadores.
 * En las súper tiradas gratis los puntos nacen en x4 en lugar de x2.
 */
export function firstMultiplierIndex(superMode: boolean): number {
  return superMode ? 1 : 0;
}

/** Umbrales de celebración en múltiplos de la apuesta. */
export const WIN_TIERS = [
  { at: 8, label: 'GANANCIA DULCE', key: 'nice' },
  { at: 20, label: 'GRAN GANANCIA', key: 'big' },
  { at: 50, label: 'GANANCIA ENORME', key: 'huge' },
  { at: 100, label: 'GANANCIA ÉPICA', key: 'epic' },
  { at: 250, label: 'MEGA GANANCIA', key: 'mega' },
  { at: 1000, label: '¡FRENESÍ TOTAL!', key: 'insane' },
] as const;

export type WinTierKey = (typeof WIN_TIERS)[number]['key'];

export function winTier(multiple: number): (typeof WIN_TIERS)[number] | null {
  let found: (typeof WIN_TIERS)[number] | null = null;
  for (const tier of WIN_TIERS) {
    if (multiple >= tier.at) found = tier;
  }
  return found;
}

/** Escalones de apuesta disponibles, en créditos. */
export const BET_STEPS = [
  0.2, 0.4, 0.6, 0.8, 1, 1.5, 2, 3, 4, 5, 7.5, 10, 15, 20, 30, 40, 50, 75, 100,
];

export const DEFAULT_BET_INDEX = 4;
export const DEFAULT_BALANCE = 5000;
