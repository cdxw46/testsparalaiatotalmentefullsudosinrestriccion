import { COLS, PAYING_SYMBOLS, REEL_SETS, ROWS, STRIP_SEED, SYMBOLS, runWeights } from './config';
import { Rng, WeightedPicker } from './rng';
import type { ReelSetId, SymbolId } from './types';

export type Strip = SymbolId[];

/**
 * Construye las cintas de un conjunto de rodillos. Cada cinta se rellena con
 * rachas del mismo símbolo (nunca dos rachas iguales seguidas) y después se le
 * insertan los scatters respetando una separación mínima, de modo que una
 * misma columna no pueda mostrar dos scatters en la misma ventana.
 */
function buildStrips(reelSet: ReelSetId, rng: Rng): Strip[] {
  const config = REEL_SETS[reelSet];
  const picker = new WeightedPicker<SymbolId>(
    PAYING_SYMBOLS.map((id) => [id, config.weights[id as Exclude<SymbolId, 'scatter'>]] as const),
  );
  const runPicker = (tier: 'low' | 'mid' | 'high') =>
    new WeightedPicker<number>(runWeights(config.clump, tier).map((w, i) => [i + 1, w] as const));
  const runPickers = { low: runPicker('low'), mid: runPicker('mid'), high: runPicker('high') };

  const strips: Strip[] = [];
  for (let col = 0; col < COLS; col++) {
    const strip: Strip = [];
    let previous: SymbolId | null = null;

    while (strip.length < config.stripLength) {
      let symbol = picker.pick(rng);
      let guard = 0;
      while (symbol === previous && guard++ < 12) symbol = picker.pick(rng);
      previous = symbol;

      const tier = SYMBOLS[symbol].tier as 'low' | 'mid' | 'high';
      const run = runPickers[tier].pick(rng);
      for (let i = 0; i < run && strip.length < config.stripLength; i++) strip.push(symbol);
    }

    // La cinta es circular: evita que el final y el principio formen una racha.
    if (strip[0] === strip[strip.length - 1]) {
      const alt = PAYING_SYMBOLS.find((s) => s !== strip[0]);
      if (alt) strip[strip.length - 1] = alt;
    }

    placeScatters(strip, config.scattersPerStrip, config.minScatterGap, rng);
    strips.push(strip);
  }
  return strips;
}

function placeScatters(strip: Strip, count: number, minGap: number, rng: Rng): void {
  const length = strip.length;
  const placed: number[] = [];
  let attempts = 0;
  while (placed.length < count && attempts++ < 500) {
    const at = rng.int(length);
    const ok = placed.every((p) => {
      const d = Math.abs(p - at);
      return Math.min(d, length - d) >= minGap;
    });
    if (!ok) continue;
    placed.push(at);
    strip[at] = 'scatter';
  }
}

const stripCache = new Map<ReelSetId, Strip[]>();

/** Invalida las cintas cacheadas (el calibrador cambia los parámetros en caliente). */
export function clearStripCache(): void {
  stripCache.clear();
}

export function stripsFor(reelSet: ReelSetId): Strip[] {
  let strips = stripCache.get(reelSet);
  if (!strips) {
    // Semilla derivada del nombre y de la variante calibrada: cada conjunto
    // tiene sus cintas y siempre son las mismas entre ejecuciones.
    let hash = STRIP_SEED;
    for (const ch of reelSet) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
    hash = (Math.imul(hash ^ 0x9e3779b9, 1 + REEL_SETS[reelSet].variant * 2) >>> 0) >>> 0;
    strips = buildStrips(reelSet, new Rng(hash));
    stripCache.set(reelSet, strips);
  }
  return strips;
}

/**
 * Alimentador de símbolos: mantiene la posición de cada columna sobre su cinta.
 * La ventana visible baja por la cinta, así que los símbolos nuevos que entran
 * por arriba son los que están justo antes del puntero.
 */
export class ReelFeed {
  private readonly strips: Strip[];
  private readonly pointers: number[] = [];

  constructor(
    readonly reelSet: ReelSetId,
    private readonly rng: Rng,
  ) {
    this.strips = stripsFor(reelSet);
    this.reset();
  }

  reset(): void {
    this.pointers.length = 0;
    for (let col = 0; col < COLS; col++) {
      this.pointers.push(this.rng.int(this.strips[col]!.length));
    }
  }

  /** Símbolo visible en la ventana actual. */
  private at(col: number, offset: number): SymbolId {
    const strip = this.strips[col]!;
    const length = strip.length;
    const index = (((this.pointers[col]! + offset) % length) + length) % length;
    return strip[index]!;
  }

  /** Ventana inicial de una columna, de arriba hacia abajo. */
  window(col: number): SymbolId[] {
    const out: SymbolId[] = [];
    for (let row = 0; row < ROWS; row++) out.push(this.at(col, row));
    return out;
  }

  /**
   * Consume `count` símbolos nuevos para una columna y devuelve el orden en el
   * que ocupan las filas superiores (índice 0 = fila más alta).
   */
  take(col: number, count: number): SymbolId[] {
    const out: SymbolId[] = [];
    for (let k = count; k >= 1; k--) out.push(this.at(col, -k));
    const length = this.strips[col]!.length;
    this.pointers[col] = (((this.pointers[col]! - count) % length) + length) % length;
    return out;
  }
}

/** Estadísticas de una cinta, útiles para verificar la calibración. */
export function stripStats(reelSet: ReelSetId): {
  length: number;
  counts: Record<string, number>;
  averageRun: number;
} {
  const strips = stripsFor(reelSet);
  const counts: Record<string, number> = {};
  let runs = 0;
  let total = 0;
  for (const strip of strips) {
    for (let i = 0; i < strip.length; i++) {
      const symbol = strip[i]!;
      counts[symbol] = (counts[symbol] ?? 0) + 1;
      total++;
      if (symbol !== strip[(i + 1) % strip.length]) runs++;
    }
  }
  return { length: strips[0]!.length, counts, averageRun: total / runs };
}
