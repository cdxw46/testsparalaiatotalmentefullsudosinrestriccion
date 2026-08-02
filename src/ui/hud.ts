import { BET_STEPS } from '../game/config';
import type { GameController } from '../game/controller';
import type { GameSession } from '../game/session';
import { formatMoney } from './format';

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Falta el elemento #${id}`);
  return element as T;
};

export interface HudHandlers {
  onSpin: () => void;
  onBet: (direction: number) => void;
  onAnte: (enabled: boolean) => void;
  onBuy: (kind: 'free' | 'superFree') => void;
  onTurbo: (enabled: boolean) => void;
  onOpenInfo: () => void;
  onOpenSettings: () => void;
  onOpenAuto: () => void;
  onToggleSound: () => void;
}

/** Barra inferior, panel de compra y avisos. */
export class Hud {
  private readonly balance = $<HTMLElement>('meter-balance');
  private readonly bet = $<HTMLElement>('meter-bet');
  private readonly winValue = $<HTMLElement>('win-value');
  private readonly winLabel = $<HTMLElement>('win-label');
  private readonly winReadout = $<HTMLElement>('win-readout');
  private readonly spinButton = $<HTMLButtonElement>('spin');
  private readonly spinCount = $<HTMLElement>('spin-count');
  private readonly betUp = $<HTMLButtonElement>('bet-up');
  private readonly betDown = $<HTMLButtonElement>('bet-down');
  private readonly anteToggle = $<HTMLButtonElement>('ante-toggle');
  private readonly buyFree = $<HTMLButtonElement>('buy-free');
  private readonly buySuper = $<HTMLButtonElement>('buy-super');
  private readonly buyFreePrice = $<HTMLElement>('buy-free-price');
  private readonly buySuperPrice = $<HTMLElement>('buy-super-price');
  private readonly turboButton = $<HTMLButtonElement>('btn-turbo');
  private readonly autoButton = $<HTMLButtonElement>('btn-auto');
  private readonly soundButton = $<HTMLButtonElement>('btn-sound');
  private readonly toastNode = $<HTMLElement>('toast');

  private toastTimer = 0;
  private displayedWin = -1;

  constructor(
    private readonly session: GameSession,
    private readonly controller: GameController,
    handlers: HudHandlers,
  ) {
    this.spinButton.addEventListener('click', handlers.onSpin);
    this.betUp.addEventListener('click', () => handlers.onBet(1));
    this.betDown.addEventListener('click', () => handlers.onBet(-1));
    this.anteToggle.addEventListener('click', () => handlers.onAnte(!this.session.ante));
    this.buyFree.addEventListener('click', () => handlers.onBuy('free'));
    this.buySuper.addEventListener('click', () => handlers.onBuy('superFree'));
    this.turboButton.addEventListener('click', () => handlers.onTurbo(!this.controller.turbo));
    this.autoButton.addEventListener('click', handlers.onOpenAuto);
    $('btn-info').addEventListener('click', handlers.onOpenInfo);
    $('btn-menu').addEventListener('click', handlers.onOpenSettings);
    this.soundButton.addEventListener('click', handlers.onToggleSound);

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        handlers.onSpin();
      } else if (event.code === 'ArrowUp') {
        handlers.onBet(1);
      } else if (event.code === 'ArrowDown') {
        handlers.onBet(-1);
      } else if (event.key.toLowerCase() === 't') {
        handlers.onTurbo(!this.controller.turbo);
      }
    });
  }

  setSoundState(enabled: boolean): void {
    this.soundButton.setAttribute('aria-pressed', String(enabled));
  }

  /** Refresca todos los indicadores desde el estado actual. */
  render(): void {
    const busy = this.controller.busy;
    const free = this.session.free.active;

    this.balance.textContent = formatMoney(this.session.balance);
    this.bet.textContent = formatMoney(this.session.spinCost);
    this.buyFreePrice.textContent = formatMoney(this.session.buyCost.free);
    this.buySuperPrice.textContent = formatMoney(this.session.buyCost.superFree);

    const win = free ? this.session.free.roundWin : this.controller.lastWin;
    if (win !== this.displayedWin) {
      this.displayedWin = win;
      this.winValue.textContent = formatMoney(win);
    }
    this.winLabel.textContent = free ? 'GANANCIA DE LA RONDA' : 'GANANCIA';
    this.winReadout.classList.toggle('is-hot', win > 0 && win >= this.session.bet * 8);

    this.betUp.disabled = busy || free || this.session.betIndex >= BET_STEPS.length - 1;
    this.betDown.disabled = busy || free || this.session.betIndex <= 0;
    this.anteToggle.disabled = busy || free;
    this.anteToggle.setAttribute('aria-pressed', String(this.session.ante));

    const canBuy = !busy && !free;
    this.buyFree.disabled = !canBuy || !this.session.canAffordBuy('free');
    this.buySuper.disabled = !canBuy || !this.session.canAffordBuy('superFree');

    this.turboButton.setAttribute('aria-pressed', String(this.controller.turbo));
    this.autoButton.classList.toggle('is-on', this.controller.autoRunning);

    const autoActive = this.controller.autoRunning;
    this.spinButton.classList.toggle('is-busy', busy && !autoActive);
    this.spinButton.classList.toggle('is-auto', autoActive);
    this.spinButton.classList.toggle('is-stop', autoActive);
    this.spinCount.textContent =
      autoActive && this.controller.autoSpinsLeft !== Infinity
        ? String(this.controller.autoSpinsLeft)
        : autoActive
          ? '∞'
          : '';
    this.spinButton.disabled = free && !busy ? true : false;
    this.spinButton.title = autoActive ? 'Detener automático' : busy ? 'Acelerar' : 'Girar';
  }

  toast(message: string): void {
    this.toastNode.textContent = message;
    this.toastNode.classList.add('is-on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastNode.classList.remove('is-on'), 2600);
  }
}
