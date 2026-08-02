import {
  ANTE_COST_FACTOR,
  BET_STEPS,
  BUY_FREE_SPINS_COST,
  BUY_FREE_SPINS_COUNT,
  BUY_SUPER_FREE_SPINS_COST,
  BUY_SUPER_FREE_SPINS_COUNT,
  DEFAULT_BALANCE,
  DEFAULT_BET_INDEX,
  MAX_WIN_MULTIPLIER,
  freeSpinsForScatters,
  retriggerSpins,
} from './config';
import { emptyMultipliers } from './grid';
import { Rng } from './rng';
import { playSpin } from './spin';
import type { FreeSpinsState, ReelSetId, SpinOutcome } from './types';

export type BuyKind = 'free' | 'superFree';

export interface SpinTicket {
  outcome: SpinOutcome;
  /** Coste cobrado por la tirada, en créditos. */
  cost: number;
  /** `true` si la tirada forma parte de la ronda de tiradas gratis. */
  free: boolean;
  /** Tiradas gratis compradas que originaron esta tirada. */
  boughtSpins: number;
  boughtSuper: boolean;
}

export interface SpinSettlement {
  /** Ganancia de la tirada en créditos. */
  win: number;
  /** Ganancia de la tirada en múltiplos de la apuesta. */
  winMultiple: number;
  triggeredFreeSpins: number;
  retrigger: boolean;
  /** La ronda de tiradas gratis terminó con esta tirada. */
  roundEnded: boolean;
  /** Ganancia total de la ronda de tiradas gratis, en créditos. */
  roundWin: number;
  cappedByMaxWin: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Estado del jugador: saldo, apuesta y ronda de tiradas gratis. */
export class GameSession {
  readonly rng: Rng;

  balance: number;
  betIndex = DEFAULT_BET_INDEX;
  ante = false;
  lastWin = 0;
  totalStaked = 0;
  totalReturned = 0;
  spinsPlayed = 0;

  free: FreeSpinsState = {
    active: false,
    spinsLeft: 0,
    spinsTotal: 0,
    roundWin: 0,
    multipliers: emptyMultipliers(),
    reelSet: 'free',
    superMode: false,
  };

  /** Compra pendiente que se resolverá en la próxima tirada. */
  private pendingBuy: BuyKind | null = null;

  private listeners = new Set<() => void>();

  constructor(options: { balance?: number; seed?: number } = {}) {
    this.balance = options.balance ?? DEFAULT_BALANCE;
    this.rng = new Rng(options.seed);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  get bet(): number {
    return BET_STEPS[this.betIndex]!;
  }

  /** Coste real de una tirada del juego base, con apuesta ante incluida. */
  get spinCost(): number {
    return round2(this.bet * (this.ante ? ANTE_COST_FACTOR : 1));
  }

  get buyCost(): Record<BuyKind, number> {
    return {
      free: round2(this.bet * BUY_FREE_SPINS_COST),
      superFree: round2(this.bet * BUY_SUPER_FREE_SPINS_COST),
    };
  }

  get hasPendingBuy(): boolean {
    return this.pendingBuy !== null;
  }

  setBetIndex(index: number): void {
    const clamped = Math.max(0, Math.min(BET_STEPS.length - 1, index));
    if (clamped === this.betIndex) return;
    this.betIndex = clamped;
    this.emit();
  }

  stepBet(direction: number): void {
    this.setBetIndex(this.betIndex + direction);
  }

  setAnte(enabled: boolean): void {
    if (this.ante === enabled) return;
    this.ante = enabled;
    this.emit();
  }

  deposit(amount: number): void {
    this.balance = round2(this.balance + amount);
    this.emit();
  }

  canAffordSpin(): boolean {
    return this.free.active || this.balance >= this.spinCost - 1e-9;
  }

  canAffordBuy(kind: BuyKind): boolean {
    return !this.free.active && this.balance >= this.buyCost[kind] - 1e-9;
  }

  /** Cobra la compra de función; la próxima tirada activará la ronda. */
  buy(kind: BuyKind): boolean {
    if (this.free.active || this.pendingBuy) return false;
    const cost = this.buyCost[kind];
    if (this.balance < cost - 1e-9) return false;
    this.balance = round2(this.balance - cost);
    this.totalStaked = round2(this.totalStaked + cost);
    this.pendingBuy = kind;
    this.lastWin = 0;
    this.emit();
    return true;
  }

  cancelBuy(): void {
    if (!this.pendingBuy) return;
    const cost = this.buyCost[this.pendingBuy];
    this.balance = round2(this.balance + cost);
    this.totalStaked = round2(this.totalStaked - cost);
    this.pendingBuy = null;
    this.emit();
  }

  private currentReelSet(): ReelSetId {
    if (this.free.active) return this.free.reelSet;
    return this.ante ? 'baseAnte' : 'base';
  }

  /** Resuelve una tirada y cobra la apuesta si corresponde. */
  startSpin(): SpinTicket | null {
    const buy = this.pendingBuy;
    const isFree = this.free.active;

    if (!isFree && !buy) {
      if (this.balance < this.spinCost - 1e-9) return null;
      this.balance = round2(this.balance - this.spinCost);
      this.totalStaked = round2(this.totalStaked + this.spinCost);
    }

    const superBuy = buy === 'superFree';
    const forcedScatters = buy ? (superBuy ? 4 : 3) : 0;
    const capLeft = isFree
      ? Math.max(0, MAX_WIN_MULTIPLIER - this.free.roundWin / this.bet)
      : MAX_WIN_MULTIPLIER;

    const outcome = playSpin({
      kind: isFree ? 'free' : 'base',
      reelSet: superBuy ? 'base' : this.currentReelSet(),
      rng: this.rng,
      multipliers: isFree ? this.free.multipliers : undefined,
      superMode: isFree ? this.free.superMode : false,
      forcedScatters,
      winCapLeft: capLeft,
    });

    this.pendingBuy = null;
    this.lastWin = 0;
    this.spinsPlayed++;
    this.emit();

    return {
      outcome,
      cost: isFree || buy ? 0 : this.spinCost,
      free: isFree,
      boughtSpins: buy ? (superBuy ? BUY_SUPER_FREE_SPINS_COUNT : BUY_FREE_SPINS_COUNT) : 0,
      boughtSuper: superBuy,
    };
  }

  /** Acredita la ganancia y actualiza el estado de la ronda de tiradas gratis. */
  settle(ticket: SpinTicket): SpinSettlement {
    const { outcome } = ticket;
    const win = round2(outcome.totalWin * this.bet);

    this.balance = round2(this.balance + win);
    this.totalReturned = round2(this.totalReturned + win);
    this.lastWin = win;

    let triggeredFreeSpins = 0;
    let retrigger = false;
    let roundEnded = false;

    if (ticket.free) {
      this.free.spinsLeft = Math.max(0, this.free.spinsLeft - 1);
      this.free.roundWin = round2(this.free.roundWin + win);
      this.free.multipliers = [...outcome.finalMultipliers];

      const extra = retriggerSpins(outcome.scatterCount);
      if (extra > 0) {
        this.free.spinsLeft += extra;
        this.free.spinsTotal += extra;
        triggeredFreeSpins = extra;
        retrigger = true;
      }

      const capReached = this.free.roundWin / this.bet >= MAX_WIN_MULTIPLIER - 1e-6;
      if (this.free.spinsLeft === 0 || capReached) roundEnded = true;
    } else if (ticket.boughtSpins > 0) {
      triggeredFreeSpins = ticket.boughtSpins;
    } else {
      triggeredFreeSpins = freeSpinsForScatters(outcome.scatterCount);
    }

    this.emit();

    return {
      win,
      winMultiple: outcome.totalWin,
      triggeredFreeSpins,
      retrigger,
      roundEnded,
      roundWin: this.free.roundWin,
      cappedByMaxWin: outcome.cappedByMaxWin,
    };
  }

  /** Arranca la ronda de tiradas gratis (tras la animación de introducción). */
  enterFreeSpins(spins: number, superMode: boolean): void {
    this.free = {
      active: true,
      spinsLeft: spins,
      spinsTotal: spins,
      roundWin: 0,
      multipliers: emptyMultipliers(),
      reelSet: superMode ? 'superFree' : 'free',
      superMode,
    };
    this.emit();
  }

  /** Cierra la ronda y devuelve la ganancia total acumulada. */
  exitFreeSpins(): number {
    const total = this.free.roundWin;
    this.free = {
      active: false,
      spinsLeft: 0,
      spinsTotal: 0,
      roundWin: 0,
      multipliers: emptyMultipliers(),
      reelSet: 'free',
      superMode: false,
    };
    this.emit();
    return total;
  }
}
