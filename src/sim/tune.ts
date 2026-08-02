/**
 * Calibrador de la matemática.
 *
 *   npx tsx src/sim/tune.ts auto     # protocolo completo, sugiere constantes
 *   npx tsx src/sim/tune.ts clump    # barrido del agrupamiento del juego base
 *   npx tsx src/sim/tune.ts fs       # barrido del agrupamiento en gratis
 *
 * Mide cada componente por separado (base sin gratis, rondas de gratis
 * aisladas y compras) porque así el error estadístico es mucho menor que
 * simulando la ganancia total tirada a tirada.
 */
import {
  ANTE_COST_FACTOR,
  BUY_FREE_SPINS_COST,
  BUY_SUPER_FREE_SPINS_COST,
  REEL_SETS,
  getPayScale,
} from '../game/config';
import { clearStripCache } from '../game/strips';
import { simulateBaseOnly, simulateBuy, simulateFreeRounds } from './core';

const TARGET_RTP = 0.965;
const pct = (n: number, d = 2): string => `${(n * 100).toFixed(d)} %`;

function auto(): void {
  const scale = getPayScale();
  console.log(`protocolo de calibración · PAY_SCALE actual ${scale}\n`);

  const base = simulateBaseOnly({ spins: 2_000_000, seed: 606001 });
  const ante = simulateBaseOnly({ spins: 1_200_000, seed: 606002, ante: true });
  const round = simulateFreeRounds({
    rounds: 120_000,
    seed: 606003,
    scatterShare: base.triggerScatterShare,
  });
  const buyFree = simulateBuy({ rounds: 60_000, seed: 606004, superBuy: false, cost: BUY_FREE_SPINS_COST });
  const buySuper = simulateBuy({ rounds: 30_000, seed: 606005, superBuy: true, cost: BUY_SUPER_FREE_SPINS_COST });

  const bUnit = base.baseRtp / scale;
  const bAnteUnit = ante.baseRtp / scale;
  const roundUnit = round.mean / scale;
  const evFreeUnit = buyFree.meanReturn / scale;
  const evSuperUnit = buySuper.meanReturn / scale;

  const rtpBase = scale * (bUnit + base.triggerRate * roundUnit);
  const rtpAnte = (scale * (bAnteUnit + ante.triggerRate * roundUnit)) / ANTE_COST_FACTOR;

  console.log('medidas (por unidad de PAY_SCALE)');
  console.log(`  RTP base                ${bUnit.toFixed(4)}  (± ${(base.std / Math.sqrt(base.spins) / scale).toFixed(4)})`);
  console.log(`  RTP base con ante       ${bAnteUnit.toFixed(4)}`);
  console.log(`  ronda de gratis         x${roundUnit.toFixed(3)}  (± ${(round.std / Math.sqrt(round.rounds) / scale).toFixed(3)}), ${round.spinsPerRound.toFixed(2)} tiradas`);
  console.log(`  activación              1 en ${(1 / base.triggerRate).toFixed(1)}  ·  con ante 1 en ${(1 / ante.triggerRate).toFixed(1)}  (x${(ante.triggerRate / base.triggerRate).toFixed(2)})`);
  console.log(`  compra gratis           x${evFreeUnit.toFixed(3)}`);
  console.log(`  compra súper            x${evSuperUnit.toFixed(3)}`);
  console.log(`  frecuencia de premio    ${pct(base.hitRate)}  ·  tumbles ${base.tumblesPerSpin.toFixed(3)}`);

  console.log('\nresultado con el PAY_SCALE actual');
  console.log(`  RTP juego base          ${pct(rtpBase, 3)}  (base ${pct(scale * bUnit, 2)} + gratis ${pct(scale * base.triggerRate * roundUnit, 2)})`);
  console.log(`  RTP con apuesta ante    ${pct(rtpAnte, 3)}`);
  console.log(`  RTP compra x${BUY_FREE_SPINS_COST}          ${pct(buyFree.rtp, 2)}`);
  console.log(`  RTP compra x${BUY_SUPER_FREE_SPINS_COST}          ${pct(buySuper.rtp, 2)}`);

  const scaleForRtp = TARGET_RTP / (bUnit + base.triggerRate * roundUnit);
  const trForRtp = (TARGET_RTP / scaleForRtp - bUnit) / roundUnit;
  const scaleForBuy = (BUY_FREE_SPINS_COST * TARGET_RTP) / evFreeUnit;
  const trBalanced = (TARGET_RTP / scaleForBuy - bUnit) / roundUnit;
  const anteTrTarget = (ANTE_COST_FACTOR * TARGET_RTP - scaleForBuy * bAnteUnit) / (scaleForBuy * roundUnit);

  console.log('\nsugerencias');
  console.log(`  PAY_SCALE para RTP 96,5 %          ${scaleForRtp.toFixed(4)}  (activación 1 en ${(1 / trForRtp).toFixed(0)})`);
  console.log(`  PAY_SCALE para compra justa        ${scaleForBuy.toFixed(4)}`);
  console.log(`  con ese PAY_SCALE, activación      1 en ${(1 / trBalanced).toFixed(1)}  (ahora 1 en ${(1 / base.triggerRate).toFixed(1)})`);
  console.log(`    → scatters/cinta base            ${(REEL_SETS.base.scattersPerStrip * (trBalanced / base.triggerRate) ** (1 / 3)).toFixed(2)} (ahora ${REEL_SETS.base.scattersPerStrip})`);
  console.log(`  activación objetivo con ante       1 en ${(1 / anteTrTarget).toFixed(1)}  (ahora 1 en ${(1 / ante.triggerRate).toFixed(1)})`);
  console.log(`    → scatters/cinta ante            ${(REEL_SETS.baseAnte.scattersPerStrip * (anteTrTarget / ante.triggerRate) ** (1 / 3)).toFixed(2)} (ahora ${REEL_SETS.baseAnte.scattersPerStrip})`);
  console.log(`  factor para súper compra justa     ${((BUY_SUPER_FREE_SPINS_COST * TARGET_RTP) / (scaleForBuy * evSuperUnit)).toFixed(3)}`);
}

function sweepClump(): void {
  console.log('agrupamiento del juego base (RTP base sin tiradas gratis)');
  console.log('clump   RTP base   aciertos   tumbles   clusters   activación');
  for (const clump of [0.19, 0.21, 0.23, 0.25, 0.27]) {
    REEL_SETS.base.clump = clump;
    clearStripCache();
    const r = simulateBaseOnly({ spins: 300_000, seed: 777 });
    console.log(
      `${clump.toFixed(2)}   ${pct(r.baseRtp).padStart(8)}   ${pct(r.hitRate).padStart(8)}   ` +
        `${r.tumblesPerSpin.toFixed(3).padStart(7)}   ${r.clustersPerSpin.toFixed(3).padStart(8)}   ` +
        `1 en ${(1 / r.triggerRate).toFixed(0)}`,
    );
  }
}

function sweepFreeClump(): void {
  console.log('agrupamiento en tiradas gratis (ronda de 10 tiradas)');
  console.log('clump   ronda media   σ        tiradas/ronda');
  for (const clump of [0.29, 0.31, 0.33, 0.35, 0.37]) {
    REEL_SETS.free.clump = clump;
    clearStripCache();
    const r = simulateFreeRounds({ rounds: 40_000, seed: 4242, fixedSpins: 10 });
    console.log(
      `${clump.toFixed(2)}   ${('x' + r.mean.toFixed(2)).padStart(11)}   ${r.std.toFixed(1).padStart(7)}   ${r.spinsPerRound.toFixed(2).padStart(12)}`,
    );
  }
}

/**
 * Búsqueda conjunta de cintas y escala.
 *
 * Con el precio de compra fijado en x100 y un RTP objetivo del 96,5 %, las dos
 * ecuaciones del modelo son:
 *
 *   s · (b + tr · f) = 0,965          (RTP total)
 *   s · ev = 100 · 0,965              (compra justa)
 *
 * de donde sale la condición que no depende de la escala: b / ev = 0,01 − tr.
 * Se recorre un conjunto de variantes de cinta hasta encontrar una pareja que la
 * cumpla y que además tenga un perfil de juego razonable.
 */
function fit(): void {
  const scale = getPayScale();
  const share = new Map([
    [3, 0.94],
    [4, 0.05],
    [5, 0.01],
  ]);

  console.log('FASE A · cintas del juego base');
  console.log('clump  var   b/unidad   aciertos   tumbles   activación   ev requerido');
  interface BaseCandidate {
    clump: number;
    variant: number;
    b: number;
    tr: number;
    hitRate: number;
    tumbles: number;
    evNeeded: number;
  }
  const bases: BaseCandidate[] = [];
  for (const clump of [0.19, 0.2, 0.21, 0.22]) {
    for (const variant of [0, 1, 2]) {
      REEL_SETS.base.clump = clump;
      REEL_SETS.base.variant = variant;
      clearStripCache();
      const r = simulateBaseOnly({ spins: 300_000, seed: 5150 });
      const b = r.baseRtp / scale;
      const evNeeded = b / (0.01 - r.triggerRate);
      bases.push({ clump, variant, b, tr: r.triggerRate, hitRate: r.hitRate, tumbles: r.tumblesPerSpin, evNeeded });
      console.log(
        `${clump.toFixed(2)}  ${variant}    ${b.toFixed(4).padStart(8)}   ${pct(r.hitRate).padStart(8)}   ` +
          `${r.tumblesPerSpin.toFixed(3).padStart(7)}   1 en ${(1 / r.triggerRate).toFixed(0).padStart(4)}   ${evNeeded.toFixed(2).padStart(11)}`,
      );
    }
  }

  console.log('\nFASE B · cintas de tiradas gratis');
  console.log('clump  var   ev compra   ronda natural   σ');
  interface FreeCandidate {
    clump: number;
    variant: number;
    ev: number;
    f: number;
  }
  const frees: FreeCandidate[] = [];
  for (const clump of [0.29, 0.31, 0.33, 0.35]) {
    for (const variant of [0, 1, 2]) {
      REEL_SETS.free.clump = clump;
      REEL_SETS.free.variant = variant;
      clearStripCache();
      const buy = simulateBuy({ rounds: 20_000, seed: 6260, superBuy: false, cost: BUY_FREE_SPINS_COST });
      const round = simulateFreeRounds({ rounds: 20_000, seed: 6261, scatterShare: share });
      const ev = buy.meanReturn / scale;
      const f = round.mean / scale;
      frees.push({ clump, variant, ev, f });
      console.log(
        `${clump.toFixed(2)}  ${variant}    ${ev.toFixed(2).padStart(9)}   ${f.toFixed(2).padStart(13)}   ${(buy.std / scale).toFixed(1).padStart(6)}`,
      );
    }
  }

  console.log('\nFASE C · mejores combinaciones (|b/ev − (0,01 − tr)| mínimo)');
  const combos = bases
    .filter((b) => b.hitRate > 0.3 && b.hitRate < 0.44 && b.tr > 1 / 260 && b.tr < 1 / 150)
    .flatMap((base) =>
      frees.map((free) => {
        const s = (BUY_FREE_SPINS_COST * TARGET_RTP) / free.ev;
        const rtp = s * (base.b + base.tr * free.f);
        return { base, free, s, rtp, error: Math.abs(rtp - TARGET_RTP) };
      }),
    )
    .sort((a, b) => a.error - b.error)
    .slice(0, 8);

  for (const combo of combos) {
    console.log(
      `  base(clump ${combo.base.clump} var ${combo.base.variant})  gratis(clump ${combo.free.clump} var ${combo.free.variant})  ` +
        `PAY_SCALE ${combo.s.toFixed(4)}  RTP ${pct(combo.rtp, 2)}  ` +
        `reparto base ${pct(combo.s * combo.base.b, 1)} / gratis ${pct(combo.rtp - combo.s * combo.base.b, 1)}  ` +
        `aciertos ${pct(combo.base.hitRate, 1)}  1 en ${(1 / combo.base.tr).toFixed(0)}`,
    );
  }

  const best = combos[0];
  if (!best) {
    console.log('  ninguna combinación cumple los filtros de perfil');
    return;
  }

  console.log('\nFASE D · súper tiradas gratis para la mejor combinación');
  REEL_SETS.base.clump = best.base.clump;
  REEL_SETS.base.variant = best.base.variant;
  REEL_SETS.free.clump = best.free.clump;
  REEL_SETS.free.variant = best.free.variant;
  const superTarget = (BUY_SUPER_FREE_SPINS_COST * TARGET_RTP) / best.s;
  console.log(`  objetivo ev súper/unidad ${superTarget.toFixed(1)}`);
  for (const clump of [0.34, 0.36, 0.38]) {
    for (const variant of [0, 1]) {
      REEL_SETS.superFree.clump = clump;
      REEL_SETS.superFree.variant = variant;
      clearStripCache();
      const r = simulateBuy({ rounds: 12_000, seed: 6270, superBuy: true, cost: BUY_SUPER_FREE_SPINS_COST });
      const ev = r.meanReturn / scale;
      console.log(
        `  clump ${clump.toFixed(2)} var ${variant}  ev ${ev.toFixed(1).padStart(7)}  RTP a x${BUY_SUPER_FREE_SPINS_COST} ${pct((ev * best.s) / BUY_SUPER_FREE_SPINS_COST, 1).padStart(8)}`,
      );
    }
  }

  console.log('\nFASE E · apuesta ante (RTP objetivo 96,5 % con coste x1,25)');
  const trAnteTarget = (ANTE_COST_FACTOR * TARGET_RTP - best.s * best.base.b) / (best.s * best.free.f);
  console.log(`  activación objetivo con ante: 1 en ${(1 / trAnteTarget).toFixed(0)}`);
  for (const scatters of [13, 14, 15, 16]) {
    REEL_SETS.baseAnte.clump = best.base.clump;
    REEL_SETS.baseAnte.scattersPerStrip = scatters;
    REEL_SETS.baseAnte.variant = 0;
    clearStripCache();
    const r = simulateBaseOnly({ spins: 300_000, seed: 5151, ante: true });
    const rtp = (best.s * (r.baseRtp / scale + r.triggerRate * best.free.f)) / ANTE_COST_FACTOR;
    console.log(
      `  scatters ${scatters}  1 en ${(1 / r.triggerRate).toFixed(0).padStart(4)}  b ${(r.baseRtp / scale).toFixed(4)}  RTP ante ${pct(rtp, 2).padStart(8)}`,
    );
  }
}

/**
 * Ajuste final de los dos conjuntos que quedan libres una vez fijados el juego
 * base, las tiradas gratis y la escala: la súper compra y la apuesta ante.
 */
function finalPass(): void {
  const scale = getPayScale();
  console.log(`ajuste final · PAY_SCALE ${scale}\n`);

  const base = simulateBaseOnly({ spins: 1_200_000, seed: 71001 });
  const round = simulateFreeRounds({
    rounds: 60_000,
    seed: 71002,
    scatterShare: base.triggerScatterShare,
  });
  const b = base.baseRtp / scale;
  const f = round.mean / scale;
  const rtp = scale * (b + base.triggerRate * f);
  console.log(
    `base: b ${b.toFixed(4)} · activación 1 en ${(1 / base.triggerRate).toFixed(1)} · ronda x${f.toFixed(2)} → RTP ${pct(rtp, 3)}`,
  );
  console.log(`      aciertos ${pct(base.hitRate)} · tumbles ${base.tumblesPerSpin.toFixed(3)}\n`);

  const superTarget = (BUY_SUPER_FREE_SPINS_COST * TARGET_RTP) / scale;
  console.log(`súper: objetivo ev/unidad ${superTarget.toFixed(1)}`);
  for (const clump of [0.362, 0.366, 0.37]) {
    for (const variant of [4, 5]) {
      REEL_SETS.superFree.clump = clump;
      REEL_SETS.superFree.variant = variant;
      clearStripCache();
      const r = simulateBuy({ rounds: 25_000, seed: 71003, superBuy: true, cost: BUY_SUPER_FREE_SPINS_COST });
      console.log(
        `  clump ${clump} var ${variant}  ev ${(r.meanReturn / scale).toFixed(1).padStart(7)}  RTP ${pct(r.rtp, 2).padStart(8)}  (± ${((r.std / Math.sqrt(r.rounds) / BUY_SUPER_FREE_SPINS_COST) * 100).toFixed(2)} pp)`,
      );
    }
  }

  console.log(`\nante: RTP objetivo ${pct(TARGET_RTP)} con coste x${ANTE_COST_FACTOR}`);
  for (const clump of [0.2, 0.205, 0.21, 0.215]) {
    for (const variant of [0, 1, 2]) {
      REEL_SETS.baseAnte.clump = clump;
      REEL_SETS.baseAnte.variant = variant;
      clearStripCache();
      const r = simulateBaseOnly({ spins: 400_000, seed: 71004, ante: true });
      const anteRtp = (scale * (r.baseRtp / scale + r.triggerRate * f)) / ANTE_COST_FACTOR;
      console.log(
        `  clump ${clump} var ${variant}  b ${(r.baseRtp / scale).toFixed(4)}  1 en ${(1 / r.triggerRate).toFixed(0).padStart(4)}  aciertos ${pct(r.hitRate, 1)}  RTP ante ${pct(anteRtp, 2).padStart(8)}`,
      );
    }
  }
}

const mode = process.argv[2] ?? 'auto';
if (mode === 'clump') sweepClump();
else if (mode === 'fs') sweepFreeClump();
else if (mode === 'fit') fit();
else if (mode === 'final') finalPass();
else auto();
