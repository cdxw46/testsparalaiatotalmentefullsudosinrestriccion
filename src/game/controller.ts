import type { Synth } from '../audio/synth';
import type { Scene } from '../render/scene';
import { MAX_WIN_MULTIPLIER, winTier } from './config';
import type { GameSession, SpinTicket } from './session';
import { playSpin } from './spin';
import type { Grid } from './types';

export type Phase = 'idle' | 'spinning' | 'freeSpins';

export interface ControllerCallbacks {
  onChange: () => void;
  onToast: (message: string) => void;
}

const NORMAL_SPEED = 1;
const TURBO_SPEED = 0.42;
const QUICK_SPEED = 0.3;

const delay = (seconds: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, Math.max(0, seconds * 1000)));

/**
 * Orquesta la presentación de una tirada: caída, clusters, cascadas,
 * multiplicadores, tiradas gratis, celebraciones y juego automático.
 */
export class GameController {
  phase: Phase = 'idle';
  turbo = false;
  autoSpinsLeft = 0;
  autoRunning = false;
  /** Ganancia mostrada de la última tirada (créditos). */
  lastWin = 0;

  private quickStop = false;
  private stopRequested = false;

  constructor(
    private readonly session: GameSession,
    private readonly scene: Scene,
    private readonly synth: Synth,
    private readonly callbacks: ControllerCallbacks,
  ) {
    this.applySpeed();
    this.scene.board.setGrid(this.idleGrid());
  }

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /** Tablero de reposo ya resuelto, para que la pantalla inicial esté poblada. */
  private idleGrid(): Grid {
    const outcome = playSpin({
      kind: 'base',
      reelSet: 'base',
      rng: this.session.rng,
      winCapLeft: MAX_WIN_MULTIPLIER,
    });
    return outcome.steps.length
      ? outcome.steps[outcome.steps.length - 1]!.gridAfter
      : outcome.initialGrid;
  }

  private applySpeed(): void {
    const speed = this.quickStop ? QUICK_SPEED : this.turbo ? TURBO_SPEED : NORMAL_SPEED;
    this.scene.setSpeed(speed);
  }

  setTurbo(enabled: boolean): void {
    this.turbo = enabled;
    this.applySpeed();
    this.callbacks.onChange();
  }

  /** Botón de girar: gira, acelera la tirada en curso o corta el automático. */
  handleSpinButton(): void {
    if (this.autoRunning) {
      this.stopAuto();
      return;
    }
    if (this.busy) {
      if (!this.quickStop) {
        this.quickStop = true;
        this.applySpeed();
      }
      return;
    }
    void this.spinOnce();
  }

  async spinOnce(): Promise<void> {
    if (this.busy) return;
    if (!this.session.canAffordSpin() && !this.session.hasPendingBuy) {
      this.callbacks.onToast('Saldo insuficiente para esta apuesta');
      return;
    }

    const ticket = this.session.startSpin();
    if (!ticket) {
      this.callbacks.onToast('Saldo insuficiente para esta apuesta');
      return;
    }

    this.phase = 'spinning';
    this.quickStop = false;
    this.applySpeed();
    this.lastWin = 0;
    this.callbacks.onChange();

    this.scene.overlay.hideWin();
    this.synth.play('spin');

    const settled = await this.playTicket(ticket);

    if (settled.triggeredFreeSpins > 0) {
      await this.runFreeSpins(settled.triggeredFreeSpins, ticket.boughtSuper);
    }

    this.phase = 'idle';
    this.quickStop = false;
    this.applySpeed();
    this.callbacks.onChange();
    await this.continueAuto();
  }

  /** Compra de función: cobra y lanza la tirada que aterriza los scatters. */
  async buy(kind: 'free' | 'superFree'): Promise<void> {
    if (this.busy) return;
    if (!this.session.canAffordBuy(kind)) {
      this.callbacks.onToast('Saldo insuficiente para comprar la función');
      return;
    }
    if (!this.session.buy(kind)) return;
    this.synth.play('buy');
    this.callbacks.onChange();
    await this.spinOnce();
  }

  // ------------------------------------------------------------- animación

  /** Reproduce una tirada completa y liquida el resultado. */
  private async playTicket(ticket: SpinTicket): Promise<{ triggeredFreeSpins: number }> {
    const { board, overlay } = this.scene;
    const outcome = ticket.outcome;
    const bet = this.session.bet;

    board.setMultipliers(outcome.initialMultipliers);
    await board.dropOut();
    await board.dropIn(outcome.initialGrid);
    this.synth.play('land');

    let accumulated = 0;
    let scatterSeen = outcome.initialGrid.filter((symbol) => symbol === 'scatter').length;
    if (scatterSeen >= 2) {
      this.synth.play('scatter');
      await board.pulseScatters(
        outcome.initialGrid.flatMap((symbol, index) => (symbol === 'scatter' ? [index] : [])),
        scatterSeen >= 3,
      );
    }

    for (const step of outcome.steps) {
      const cells = step.clusters.flatMap((cluster) => cluster.cells);
      await board.highlight(step.clusters);

      accumulated += step.stepWin * bet;
      this.lastWin = accumulated;
      overlay.showWin(accumulated, step.index >= 1, step.index + 1);
      this.callbacks.onChange();

      this.synth.play('pop', step.index);
      await board.pop(cells);

      if (step.upgradedSpots.length) {
        this.synth.play('multiplier', step.index);
        await board.showMultiplierUpgrades(step.multipliersAfter, step.upgradedSpots);
      }

      board.kick(Math.min(16, 3 + step.index * 2 + step.stepWin));
      if (step.index >= 1) this.synth.play('cascade', step.index);
      await board.cascade(step.moves, step.gridAfter);

      const scatterNow = step.scatterCells.length;
      if (scatterNow > scatterSeen && scatterNow >= 2) {
        this.synth.play('scatter');
        await board.pulseScatters(step.scatterCells, scatterNow >= 3);
      }
      scatterSeen = scatterNow;
    }

    const settlement = this.session.settle(ticket);
    this.lastWin = settlement.win;
    this.callbacks.onChange();

    if (settlement.win > 0) {
      overlay.showWin(settlement.win, settlement.winMultiple >= 8, outcome.steps.length);
      this.synth.play(settlement.winMultiple >= 20 ? 'bigwin' : 'win');
    }

    if (!ticket.free) {
      board.clearMultipliers();
    } else {
      overlay.showFreeSpins(this.session.free.spinsLeft, this.session.free.spinsTotal, this.session.free.roundWin);
    }

    const tier = winTier(settlement.winMultiple);
    if (tier) {
      board.celebrate(tier.at >= 100 ? 160 : 90);
      board.kick(tier.at >= 50 ? 22 : 12);
      this.synth.play('bigwin');
      await overlay.banner(tier.label, '', {
        tier: tier.key,
        hold: tier.at >= 100 ? 2.4 : 1.5,
        countTo: settlement.win,
      });
      this.synth.play('coins');
    }

    if (settlement.cappedByMaxWin) {
      this.callbacks.onToast(`¡Tope de ganancia alcanzado: x${MAX_WIN_MULTIPLIER}!`);
    }

    if (settlement.retrigger) {
      this.synth.play('freespins');
      await overlay.banner('¡MÁS TIRADAS!', `+${settlement.triggeredFreeSpins}`, { tier: 'huge', hold: 1.2 });
      overlay.showFreeSpins(this.session.free.spinsLeft, this.session.free.spinsTotal, this.session.free.roundWin);
      return { triggeredFreeSpins: 0 };
    }

    if (!ticket.free && settlement.triggeredFreeSpins > 0) {
      return { triggeredFreeSpins: settlement.triggeredFreeSpins };
    }
    return { triggeredFreeSpins: 0 };
  }

  /** Ronda completa de tiradas gratis. */
  private async runFreeSpins(spins: number, superMode: boolean): Promise<void> {
    const { board, overlay } = this.scene;
    this.phase = 'freeSpins';
    document.body.classList.add('is-free');
    this.synth.setMood(true);
    this.synth.play('freespins');
    this.callbacks.onChange();

    await overlay.banner(superMode ? '¡SÚPER TIRADAS GRATIS!' : '¡TIRADAS GRATIS!', `${spins} TIRADAS`, {
      tier: superMode ? 'epic' : 'huge',
      hold: 2,
    });

    this.session.enterFreeSpins(spins, superMode);
    board.clearMultipliers(false);
    overlay.showFreeSpins(spins, spins, 0);
    this.callbacks.onChange();

    while (this.session.free.active && this.session.free.spinsLeft > 0) {
      this.quickStop = false;
      this.applySpeed();
      overlay.hideWin();
      overlay.pulseFreeSpins();
      this.synth.play('spin');

      const ticket = this.session.startSpin();
      if (!ticket) break;
      await this.playTicket(ticket);
      this.callbacks.onChange();

      if (this.session.free.spinsLeft > 0) await delay(0.35 * (this.turbo ? 0.4 : 1));
    }

    const total = this.session.exitFreeSpins();
    overlay.hideFreeSpins();
    board.clearMultipliers();
    document.body.classList.remove('is-free');
    this.synth.setMood(false);

    if (total > 0) {
      board.celebrate(140);
      this.synth.play('bigwin');
    }
    await overlay.banner('TIRADAS GRATIS COMPLETADAS', '', {
      tier: total / this.session.bet >= 50 ? 'mega' : 'big',
      hold: 2.2,
      countTo: total,
    });
    this.lastWin = total;
    this.callbacks.onChange();
  }

  // ------------------------------------------------------------ automático

  startAuto(count: number): void {
    this.autoSpinsLeft = count;
    this.autoRunning = true;
    this.stopRequested = false;
    this.callbacks.onChange();
    if (!this.busy) void this.spinOnce();
  }

  stopAuto(): void {
    this.autoRunning = false;
    this.autoSpinsLeft = 0;
    this.stopRequested = true;
    this.callbacks.onChange();
  }

  private async continueAuto(): Promise<void> {
    if (!this.autoRunning || this.stopRequested) return;
    if (this.autoSpinsLeft !== Infinity) this.autoSpinsLeft--;
    if (this.autoSpinsLeft <= 0) {
      this.autoRunning = false;
      this.autoSpinsLeft = 0;
      this.callbacks.onChange();
      return;
    }
    if (!this.session.canAffordSpin()) {
      this.autoRunning = false;
      this.autoSpinsLeft = 0;
      this.callbacks.onToast('Automático detenido: saldo insuficiente');
      this.callbacks.onChange();
      return;
    }
    await delay(0.28 * (this.turbo ? 0.4 : 1));
    if (!this.autoRunning || this.stopRequested) return;
    void this.spinOnce();
  }
}
