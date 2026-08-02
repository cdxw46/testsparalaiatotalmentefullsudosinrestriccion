import {
  MAX_WIN_MULTIPLIER,
  MULTIPLIER_LADDER,
  firstMultiplierIndex,
} from './config';
import {
  collapseAndRefill,
  emptyMultipliers,
  findClusters,
  gridFromFeed,
  scatterCells,
  seedScatters,
} from './grid';
import type { Rng } from './rng';
import { ReelFeed } from './strips';
import type { Grid, ReelSetId, SpinKind, SpinOutcome, TumbleStep } from './types';

export interface SpinRequest {
  kind: SpinKind;
  reelSet: ReelSetId;
  rng: Rng;
  /** Multiplicadores persistentes al empezar (tiradas gratis). */
  multipliers?: number[];
  /** En modo súper los puntos nacen en x4. */
  superMode?: boolean;
  /** Fuerza scatters en la caída inicial (compra de función). */
  forcedScatters?: number;
  /** Tope de ganancia restante en múltiplos de la apuesta. */
  winCapLeft?: number;
  /** Tablero inicial fijo, solo para tests. */
  fixedGrid?: Grid;
}

/** Sube un punto multiplicador un escalón de la escalera. */
export function nextMultiplier(current: number, superMode: boolean): number {
  if (current <= 0) return MULTIPLIER_LADDER[firstMultiplierIndex(superMode)]!;
  const at = MULTIPLIER_LADDER.indexOf(current as (typeof MULTIPLIER_LADDER)[number]);
  if (at < 0) return MULTIPLIER_LADDER[MULTIPLIER_LADDER.length - 1]!;
  return MULTIPLIER_LADDER[Math.min(at + 1, MULTIPLIER_LADDER.length - 1)]!;
}

/**
 * Resuelve una tirada completa: caída inicial y toda la cascada de tumbles,
 * devolviendo cada paso para que el renderizador lo reproduzca.
 */
export function playSpin(req: SpinRequest): SpinOutcome {
  const { rng, reelSet, kind } = req;
  const superMode = req.superMode ?? false;
  const capLeft = req.winCapLeft ?? MAX_WIN_MULTIPLIER;

  const feed = new ReelFeed(reelSet, rng);
  const initialGrid: Grid = req.fixedGrid ? [...req.fixedGrid] : gridFromFeed(feed);
  if (req.forcedScatters && req.forcedScatters > 0) {
    const present = scatterCells(initialGrid).length;
    if (present < req.forcedScatters) {
      seedScatters(initialGrid, req.forcedScatters - present, rng);
    }
  }

  const multipliers = req.multipliers ? [...req.multipliers] : emptyMultipliers();
  const initialMultipliers = [...multipliers];

  let grid: Grid = [...initialGrid];
  let totalWin = 0;
  let cappedByMaxWin = false;
  const steps: TumbleStep[] = [];

  for (let guard = 0; guard < 400; guard++) {
    const clusters = findClusters(grid, multipliers);
    if (!clusters.length) break;

    const multipliersBefore = [...multipliers];
    let stepWin = 0;
    const removed = new Set<number>();
    for (const cluster of clusters) {
      stepWin += cluster.pay;
      for (const cell of cluster.cells) removed.add(cell);
    }

    const upgradedSpots: number[] = [];
    for (const cell of removed) {
      const before = multipliers[cell] ?? 0;
      const after = nextMultiplier(before, superMode);
      if (after !== before) upgradedSpots.push(cell);
      multipliers[cell] = after;
    }

    if (totalWin + stepWin >= capLeft) {
      stepWin = Math.max(0, capLeft - totalWin);
      cappedByMaxWin = true;
    }
    totalWin += stepWin;

    const { grid: gridAfter, moves } = collapseAndRefill(grid, removed, feed);

    steps.push({
      index: steps.length,
      gridBefore: grid,
      multipliersBefore,
      clusters,
      multipliersAfter: [...multipliers],
      upgradedSpots,
      stepWin,
      gridAfter,
      moves,
      scatterCells: scatterCells(gridAfter),
    });

    grid = gridAfter;
    if (cappedByMaxWin) break;
  }

  const finalScatters = scatterCells(grid);

  return {
    kind,
    reelSet,
    initialGrid,
    initialMultipliers,
    steps,
    finalMultipliers: multipliers,
    totalWin: Number(totalWin.toFixed(6)),
    scatterCount: finalScatters.length,
    scatterCells: finalScatters,
    freeSpinsAwarded: 0,
    cappedByMaxWin,
  };
}
