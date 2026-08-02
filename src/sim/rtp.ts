/**
 * Informe de RTP, frecuencias y volatilidad.
 *
 *   npm run sim                            # 400 000 tiradas
 *   npm run sim -- --spins 2000000         # corrida larga
 *   npm run sim -- --spins 600000 --ante   # con apuesta ante
 *   npm run sim -- --mode buy              # solo compras de función
 */
import {
  ANTE_COST_FACTOR,
  BUY_FREE_SPINS_COST,
  BUY_FREE_SPINS_COUNT,
  BUY_SUPER_FREE_SPINS_COST,
  BUY_SUPER_FREE_SPINS_COUNT,
  MAX_WIN_MULTIPLIER,
  MIN_CLUSTER,
  REEL_SETS,
  getPayScale,
} from '../game/config';
import { stripStats } from '../game/strips';
import { simulateBase, simulateBuy } from './core';

interface Args {
  spins: number;
  seed: number;
  ante: boolean;
  mode: 'base' | 'buy' | 'strips' | 'all';
}

function parseArgs(argv: string[]): Args {
  const args: Args = { spins: 400_000, seed: 20260801, ante: false, mode: 'all' };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--spins') args.spins = Number(argv[++i]);
    else if (key === '--seed') args.seed = Number(argv[++i]);
    else if (key === '--ante') args.ante = true;
    else if (key === '--mode') args.mode = argv[++i] as Args['mode'];
  }
  return args;
}

const pct = (n: number, digits = 2): string => `${(n * 100).toFixed(digits)} %`;
const row = (label: string, value: string): void =>
  console.log(`  ${label.padEnd(26)}${value}`);

function reportBase(args: Args): void {
  const r = simulateBase({ spins: args.spins, seed: args.seed, ante: args.ante });
  const title = args.ante ? 'JUEGO BASE + APUESTA ANTE' : 'JUEGO BASE';
  console.log(`\n${title}`);
  console.log('─'.repeat(66));
  row('tiradas', `${r.spins.toLocaleString('es')}  (${Math.round(r.spins / r.seconds).toLocaleString('es')}/s)`);
  row('coste por tirada', `x${args.ante ? ANTE_COST_FACTOR : 1}`);
  row('RTP total', pct(r.rtp, 3));
  row('  · juego base', pct(r.baseRtp, 3));
  row('  · tiradas gratis', pct(r.featureRtp, 3));
  row('frecuencia de premio', `${pct(r.hitRate)}  (1 en ${(1 / r.hitRate).toFixed(2)})`);
  row('clusters por tirada', r.clustersPerSpin.toFixed(3));
  row('tumbles por tirada', r.tumblesPerSpin.toFixed(3));
  row('activación gratis', `1 en ${(1 / r.triggerRate).toFixed(0)} tiradas  (${pct(r.triggerRate, 3)})`);
  row('tiradas por ronda', `${r.freeSpinsPerRound.toFixed(2)} (reactivaciones ${r.retriggersPerRound.toFixed(2)})`);
  row('ganancia media ronda', `x${r.avgRoundWin.toFixed(2)}`);
  row('volatilidad σ/tirada', r.std.toFixed(2));
  row('ganancia máxima vista', `x${r.maxWin.toFixed(2)} (tope x${MAX_WIN_MULTIPLIER}, ${r.maxWinHits} veces)`);
  row(
    'scatters en pantalla',
    r.scatterHistogram
      .slice(0, 6)
      .map((share, i) => `${i}:${(share * 100).toFixed(2)}%`)
      .join('  '),
  );

  console.log('\n  distribución de la ganancia por tirada');
  for (const bucket of r.buckets) {
    if (bucket.share <= 0) continue;
    const label =
      bucket.to === 0
        ? 'sin premio'
        : bucket.to === null
          ? `x${bucket.from}+`
          : `x${bucket.from} – x${bucket.to}`;
    const bar = '█'.repeat(Math.min(34, Math.round(bucket.share * 100)));
    console.log(`    ${label.padEnd(15)}${pct(bucket.share, 3).padStart(9)}  ${bar}`);
  }

  const sizes = r.clusterSizes
    .map((count, size) => ({ size, count }))
    .filter((entry) => entry.count > 0 && entry.size >= MIN_CLUSTER);
  const totalClusters = sizes.reduce((acc, entry) => acc + entry.count, 0);
  console.log('\n  tamaño de los clusters pagados');
  for (const entry of sizes.slice(0, 12)) {
    const share = entry.count / totalClusters;
    const bar = '▏'.repeat(Math.min(34, Math.round(share * 60)));
    console.log(`    ${String(entry.size).padStart(2)} símbolos ${pct(share, 2).padStart(8)}  ${bar}`);
  }
}

function reportBuy(superBuy: boolean, rounds: number, seed: number): void {
  const cost = superBuy ? BUY_SUPER_FREE_SPINS_COST : BUY_FREE_SPINS_COST;
  const spins = superBuy ? BUY_SUPER_FREE_SPINS_COUNT : BUY_FREE_SPINS_COUNT;
  const r = simulateBuy({ rounds, seed, superBuy, cost });
  console.log(`\n${superBuy ? 'COMPRA SÚPER TIRADAS GRATIS' : 'COMPRA TIRADAS GRATIS'}  (x${cost}, ${spins} tiradas)`);
  console.log('─'.repeat(66));
  row('rondas simuladas', r.rounds.toLocaleString('es'));
  row('RTP de la compra', `${pct(r.rtp, 2)}  (± ${((r.std / Math.sqrt(r.rounds) / cost) * 100).toFixed(2)} pp)`);
  row('retorno medio', `x${r.meanReturn.toFixed(2)}`);
  row('tiradas por ronda', r.spinsPerRound.toFixed(2));
  row('volatilidad σ', r.std.toFixed(1));
  row('máximo visto', `x${r.max.toFixed(0)}`);
}

function reportStrips(): void {
  console.log('\nCINTAS DE RODILLOS');
  console.log('─'.repeat(66));
  for (const reelSet of Object.keys(REEL_SETS) as Array<keyof typeof REEL_SETS>) {
    const s = stripStats(reelSet);
    const total = Object.values(s.counts).reduce((a, b) => a + b, 0);
    const parts = Object.entries(s.counts)
      .sort((a, b) => b[1] - a[1])
      .map(([symbol, count]) => `${symbol} ${((count / total) * 100).toFixed(1)}%`);
    row(reelSet, `largo ${s.length}, racha media ${s.averageRun.toFixed(2)}, clump ${REEL_SETS[reelSet].clump}`);
    console.log(`    ${parts.join('  ')}`);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  console.log('DULCE FRENESÍ 1000 · simulación de matemática');
  console.log(`semilla ${args.seed} · PAY_SCALE ${getPayScale()} · cluster mínimo ${MIN_CLUSTER}`);
  if (args.mode === 'strips' || args.mode === 'all') reportStrips();
  if (args.mode === 'base' || args.mode === 'all') reportBase(args);
  if (args.mode === 'buy' || args.mode === 'all') {
    reportBuy(false, Math.max(5000, Math.round(args.spins / 10)), args.seed + 337);
    reportBuy(true, Math.max(4000, Math.round(args.spins / 20)), args.seed + 991);
  }
  console.log('');
}

main();
