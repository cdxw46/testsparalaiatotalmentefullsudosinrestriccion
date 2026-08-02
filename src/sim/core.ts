import {
  ANTE_COST_FACTOR,
  BUY_FREE_SPINS_COUNT,
  BUY_SUPER_FREE_SPINS_COUNT,
  MAX_WIN_MULTIPLIER,
  freeSpinsForScatters,
  retriggerSpins,
} from '../game/config';
import { emptyMultipliers } from '../game/grid';
import { Rng } from '../game/rng';
import { playSpin } from '../game/spin';
import type { ReelSetId } from '../game/types';

export class Stats {
  count = 0;
  sum = 0;
  sumSq = 0;
  max = 0;
  hits = 0;

  add(value: number): void {
    this.count++;
    this.sum += value;
    this.sumSq += value * value;
    if (value > this.max) this.max = value;
    if (value > 0) this.hits++;
  }

  get mean(): number {
    return this.count ? this.sum / this.count : 0;
  }

  get std(): number {
    if (this.count < 2) return 0;
    return Math.sqrt(Math.max(0, this.sumSq / this.count - this.mean ** 2));
  }

  get hitRate(): number {
    return this.count ? this.hits / this.count : 0;
  }
}

export interface FreeRoundStats {
  spins: number;
  retriggers: number;
}

/** Juega una ronda completa de tiradas gratis; devuelve la ganancia (x apuesta). */
export function playFreeRound(
  rng: Rng,
  spins: number,
  superMode: boolean,
  stats?: FreeRoundStats,
): number {
  const reelSet: ReelSetId = superMode ? 'superFree' : 'free';
  let multipliers = emptyMultipliers();
  let left = spins;
  let win = 0;

  while (left > 0) {
    left--;
    if (stats) stats.spins++;
    const outcome = playSpin({
      kind: 'free',
      reelSet,
      rng,
      multipliers,
      superMode,
      winCapLeft: Math.max(0, MAX_WIN_MULTIPLIER - win),
    });
    win += outcome.totalWin;
    multipliers = outcome.finalMultipliers;
    const extra = retriggerSpins(outcome.scatterCount);
    if (extra > 0) {
      left += extra;
      if (stats) stats.retriggers++;
    }
    if (win >= MAX_WIN_MULTIPLIER) return MAX_WIN_MULTIPLIER;
  }
  return win;
}

export interface BaseSimOptions {
  spins: number;
  seed: number;
  ante?: boolean;
}

export interface BaseSimResult {
  spins: number;
  staked: number;
  baseWin: number;
  featureWin: number;
  rtp: number;
  baseRtp: number;
  featureRtp: number;
  hitRate: number;
  tumblesPerSpin: number;
  clustersPerSpin: number;
  triggers: number;
  triggerRate: number;
  freeSpinsPerRound: number;
  retriggersPerRound: number;
  avgRoundWin: number;
  std: number;
  maxWin: number;
  maxWinHits: number;
  scatterHistogram: number[];
  buckets: Array<{ from: number; to: number | null; share: number }>;
  clusterSizes: number[];
  seconds: number;
}

const BUCKETS = [0, 0.5, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000, 5000];

export function simulateBase(options: BaseSimOptions): BaseSimResult {
  const { spins, seed } = options;
  const ante = options.ante ?? false;
  const rng = new Rng(seed);
  const reelSet: ReelSetId = ante ? 'baseAnte' : 'base';
  const cost = ante ? ANTE_COST_FACTOR : 1;

  const perSpin = new Stats();
  const freeStats: FreeRoundStats = { spins: 0, retriggers: 0 };
  const scatterHistogram = new Array<number>(10).fill(0);
  const bucketCount = new Array<number>(BUCKETS.length).fill(0);
  const clusterSizes = new Array<number>(50).fill(0);

  let staked = 0;
  let baseWin = 0;
  let featureWin = 0;
  let triggers = 0;
  let maxWinHits = 0;
  let tumbleTotal = 0;
  let clusterTotal = 0;
  let noWin = 0;

  const t0 = Date.now();
  for (let i = 0; i < spins; i++) {
    staked += cost;
    const outcome = playSpin({ kind: 'base', reelSet, rng, winCapLeft: MAX_WIN_MULTIPLIER });
    let win = outcome.totalWin;
    baseWin += outcome.totalWin;
    tumbleTotal += outcome.steps.length;
    for (const step of outcome.steps) {
      clusterTotal += step.clusters.length;
      for (const cluster of step.clusters) {
        clusterSizes[Math.min(clusterSizes.length - 1, cluster.cells.length)]!++;
      }
    }
    scatterHistogram[Math.min(9, outcome.scatterCount)]!++;

    const awarded = freeSpinsForScatters(outcome.scatterCount);
    if (awarded > 0) {
      triggers++;
      const roundWin = playFreeRound(rng, awarded, false, freeStats);
      featureWin += roundWin;
      win += roundWin;
    }

    if (win >= MAX_WIN_MULTIPLIER) maxWinHits++;
    perSpin.add(win);
    if (win <= 0) noWin++;
    else {
      for (let b = BUCKETS.length - 1; b >= 0; b--) {
        if (win >= BUCKETS[b]!) {
          bucketCount[b]!++;
          break;
        }
      }
    }
  }

  const seconds = (Date.now() - t0) / 1000;
  const returned = baseWin + featureWin;

  return {
    spins,
    staked,
    baseWin,
    featureWin,
    rtp: returned / staked,
    baseRtp: baseWin / staked,
    featureRtp: featureWin / staked,
    hitRate: perSpin.hitRate,
    tumblesPerSpin: tumbleTotal / spins,
    clustersPerSpin: clusterTotal / spins,
    triggers,
    triggerRate: triggers / spins,
    freeSpinsPerRound: triggers ? freeStats.spins / triggers : 0,
    retriggersPerRound: triggers ? freeStats.retriggers / triggers : 0,
    avgRoundWin: triggers ? featureWin / triggers : 0,
    std: perSpin.std,
    maxWin: perSpin.max,
    maxWinHits,
    scatterHistogram: scatterHistogram.map((n) => n / spins),
    buckets: [
      { from: 0, to: 0, share: noWin / spins },
      ...BUCKETS.map((from, i) => ({
        from,
        to: BUCKETS[i + 1] ?? null,
        share: bucketCount[i]! / spins,
      })),
    ],
    clusterSizes,
    seconds,
  };
}

export interface BaseOnlyResult {
  spins: number;
  baseRtp: number;
  hitRate: number;
  tumblesPerSpin: number;
  clustersPerSpin: number;
  triggerRate: number;
  /** Reparto de las activaciones por cantidad de scatters. */
  triggerScatterShare: Map<number, number>;
  scatterHistogram: number[];
  clusterSizes: number[];
  std: number;
  seconds: number;
}

/**
 * Simula solo la parte base de la tirada (sin jugar las tiradas gratis).
 * Al ser mucho más rápida y de baja varianza, sirve para medir con precisión
 * el RTP base y la frecuencia de activación.
 */
export function simulateBaseOnly(options: BaseSimOptions): BaseOnlyResult {
  const { spins, seed } = options;
  const ante = options.ante ?? false;
  const rng = new Rng(seed);
  const reelSet: ReelSetId = ante ? 'baseAnte' : 'base';
  const stats = new Stats();
  const scatterHistogram = new Array<number>(10).fill(0);
  const clusterSizes = new Array<number>(50).fill(0);
  const triggerScatterShare = new Map<number, number>();
  let triggers = 0;
  let tumbles = 0;
  let clusters = 0;

  const t0 = Date.now();
  for (let i = 0; i < spins; i++) {
    const outcome = playSpin({ kind: 'base', reelSet, rng, winCapLeft: MAX_WIN_MULTIPLIER });
    stats.add(outcome.totalWin);
    tumbles += outcome.steps.length;
    for (const step of outcome.steps) {
      clusters += step.clusters.length;
      for (const cluster of step.clusters) {
        clusterSizes[Math.min(clusterSizes.length - 1, cluster.cells.length)]!++;
      }
    }
    scatterHistogram[Math.min(9, outcome.scatterCount)]!++;
    if (freeSpinsForScatters(outcome.scatterCount) > 0) {
      triggers++;
      const key = Math.min(7, outcome.scatterCount);
      triggerScatterShare.set(key, (triggerScatterShare.get(key) ?? 0) + 1);
    }
  }

  for (const [key, count] of triggerScatterShare) {
    triggerScatterShare.set(key, count / Math.max(1, triggers));
  }

  return {
    spins,
    baseRtp: stats.mean,
    hitRate: stats.hitRate,
    tumblesPerSpin: tumbles / spins,
    clustersPerSpin: clusters / spins,
    triggerRate: triggers / spins,
    triggerScatterShare,
    scatterHistogram: scatterHistogram.map((n) => n / spins),
    clusterSizes,
    std: stats.std,
    seconds: (Date.now() - t0) / 1000,
  };
}

/**
 * Simula rondas de tiradas gratis aisladas, repartiendo la cantidad de tiradas
 * iniciales según la distribución real de scatters de la activación.
 */
export function simulateFreeRounds(options: {
  rounds: number;
  seed: number;
  superMode?: boolean;
  /** Reparto de scatters de activación; por omisión, siempre 3 scatters. */
  scatterShare?: Map<number, number>;
  fixedSpins?: number;
}): { rounds: number; mean: number; std: number; max: number; spinsPerRound: number } {
  const rng = new Rng(options.seed);
  const stats = new Stats();
  const freeStats: FreeRoundStats = { spins: 0, retriggers: 0 };
  const share = [...(options.scatterShare ?? new Map([[3, 1]]))].sort((a, b) => a[0] - b[0]);

  for (let i = 0; i < options.rounds; i++) {
    let spins = options.fixedSpins ?? 0;
    if (!spins) {
      let roll = rng.next();
      spins = freeSpinsForScatters(share[0]![0]);
      for (const [scatters, weight] of share) {
        roll -= weight;
        if (roll <= 0) {
          spins = freeSpinsForScatters(scatters);
          break;
        }
      }
    }
    stats.add(playFreeRound(rng, spins, options.superMode ?? false, freeStats));
  }

  return {
    rounds: options.rounds,
    mean: stats.mean,
    std: stats.std,
    max: stats.max,
    spinsPerRound: freeStats.spins / options.rounds,
  };
}

export interface BuySimResult {
  rounds: number;
  cost: number;
  rtp: number;
  meanReturn: number;
  spinsPerRound: number;
  std: number;
  max: number;
  zeroShare: number;
}

export function simulateBuy(options: {
  rounds: number;
  seed: number;
  superBuy: boolean;
  cost: number;
}): BuySimResult {
  const { rounds, seed, superBuy, cost } = options;
  const rng = new Rng(seed);
  const spins = superBuy ? BUY_SUPER_FREE_SPINS_COUNT : BUY_FREE_SPINS_COUNT;
  const stats = new Stats();
  const freeStats: FreeRoundStats = { spins: 0, retriggers: 0 };
  let zero = 0;

  for (let i = 0; i < rounds; i++) {
    // La tirada que aterriza los scatters comprados también paga.
    const trigger = playSpin({
      kind: 'base',
      reelSet: 'base',
      rng,
      forcedScatters: superBuy ? 4 : 3,
      winCapLeft: MAX_WIN_MULTIPLIER,
    });
    const roundWin = playFreeRound(rng, spins, superBuy, freeStats);
    const total = Math.min(MAX_WIN_MULTIPLIER, trigger.totalWin + roundWin);
    stats.add(total);
    if (total <= 0) zero++;
  }

  return {
    rounds,
    cost,
    rtp: stats.mean / cost,
    meanReturn: stats.mean,
    spinsPerRound: freeStats.spins / rounds,
    std: stats.std,
    max: stats.max,
    zeroShare: zero / rounds,
  };
}
