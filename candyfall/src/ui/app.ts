import {
  applyClusterPayouts,
  applyGravity,
  awardFreeSpins,
  BET_STEPS,
  buyFeatureCost,
  countScatters,
  createInitialState,
  fillGrid,
  findClusters,
  formatMoney,
  markWinningCells,
  nextBet,
  refillGrid,
  removeClusters,
  resetSpots,
  spinCost,
  upgradeSpots,
} from '../game/engine';
import { GRID_SIZE, MULTIPLIER_STEPS } from '../game/symbols';
import {
  isMuted,
  setMuted,
  sfxClick,
  sfxCluster,
  sfxDrop,
  sfxFreeSpins,
  sfxSpin,
  sfxWin,
} from '../game/audio';
import type { GameState } from '../game/types';
import { candySvg } from './candies';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class CandyfallApp {
  private root: HTMLElement;
  private state: GameState;
  private busy = false;
  private particlesEl: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.state = createInitialState();
    this.mount();
    this.render();
  }

  private mount() {
    this.root.innerHTML = `
      <div class="stage">
        <div class="sky"></div>
        <div class="hills"></div>
        <div class="lollipops" aria-hidden="true">
          <span class="lolli l1"></span>
          <span class="lolli l2"></span>
          <span class="lolli l3"></span>
          <span class="candy-cane c1"></span>
          <span class="candy-cane c2"></span>
        </div>
        <header class="topbar">
          <div class="brand">
            <span class="brand-mark" aria-hidden="true"></span>
            <h1 class="brand-name">Candyfall</h1>
          </div>
          <button class="icon-btn" data-action="mute" title="Sonido" aria-label="Sonido">SON</button>
        </header>

        <main class="playfield">
          <aside class="side-panel left-panel">
            <button class="buy-btn" data-action="buy-fs">
              <span class="buy-label">Comprar Tiradas Gratis</span>
              <span class="buy-price" data-buy-price></span>
            </button>
            <button class="buy-btn buy-super" data-action="buy-super">
              <span class="buy-label">Comprar Super Tiradas</span>
              <span class="buy-price" data-buy-super-price></span>
            </button>
            <div class="pay-hint">
              <strong>Clusters</strong>
              <p>5+ caramelos iguales conectados ganan. Las casillas doradas multiplican.</p>
            </div>
          </aside>

          <section class="machine" aria-label="Tablero Candyfall">
            <div class="icing" aria-hidden="true">
              <span class="sprinkle s1"></span>
              <span class="sprinkle s2"></span>
              <span class="sprinkle s3"></span>
              <span class="sprinkle s4"></span>
              <span class="sprinkle s5"></span>
              <span class="sprinkle s6"></span>
            </div>
            <div class="pipe-frame">
              <div class="grid" data-grid></div>
            </div>
            <div class="dispenser" aria-hidden="true"></div>
            <div class="win-banner" data-banner hidden></div>
            <div class="particles" data-particles></div>
          </section>

          <aside class="side-panel right-panel">
            <div class="meter">
              <span class="meter-label">Cascada</span>
              <strong data-cascade>0</strong>
            </div>
            <div class="meter freespin-meter">
              <span class="meter-label">Tiradas Gratis</span>
              <strong data-freespins>0</strong>
            </div>
            <div class="legend">
              <div class="legend-row"><i class="spot-demo"></i> Multiplicador</div>
              <div class="legend-row"><i class="scatter-demo"></i> 3+ Scatter = Free Spins</div>
            </div>
          </aside>
        </main>

        <footer class="hud">
          <div class="hud-stats">
            <div class="stat">
              <span>Crédito</span>
              <strong data-credit>0,00</strong>
            </div>
            <div class="stat win-stat">
              <span>Ganancia</span>
              <strong data-win>0,00</strong>
            </div>
            <div class="stat">
              <span>Apuesta</span>
              <strong data-bet>1,00</strong>
            </div>
          </div>
          <p class="message" data-message></p>
          <div class="controls">
            <button class="ctrl info" data-action="info" title="Info">i</button>
            <button class="bet-btn" data-action="bet-down" aria-label="Bajar apuesta">−</button>
            <button class="spin-btn" data-action="spin" aria-label="Girar">
              <span class="spin-ring"></span>
              <span class="spin-arrows">↻</span>
            </button>
            <button class="bet-btn" data-action="bet-up" aria-label="Subir apuesta">+</button>
            <button class="ctrl auto" data-action="auto" title="Auto">AUTO</button>
          </div>
        </footer>

        <div class="modal" data-modal hidden>
          <div class="modal-card">
            <button class="modal-close" data-action="close-modal">×</button>
            <h2>Cómo jugar Candyfall</h2>
            <ul>
              <li>Tablero <strong>7×7</strong> con pagos por <strong>cluster</strong> (5+ iguales).</li>
              <li>Los clusters explotan y nuevos caramelos <strong>caen</strong> (cascadas).</li>
              <li>Cada casilla ganadora deja un <strong>multiplicador</strong> que sube: 2× → 4× → … → 1024×.</li>
              <li><strong>3+ Scatter</strong> activan tiradas gratis. Los multiplicadores se mantienen en free spins.</li>
              <li>Apuestas: ${BET_STEPS[0]} – ${BET_STEPS[BET_STEPS.length - 1]}.</li>
            </ul>
            <p class="modal-note">Juego de demostración. Sin dinero real.</p>
          </div>
        </div>
      </div>
    `;

    this.particlesEl = this.root.querySelector('[data-particles]');
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  private onClick(e: Event) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!t) return;
    const action = t.dataset.action!;
    switch (action) {
      case 'spin':
        void this.spin();
        break;
      case 'bet-up':
        this.changeBet(1);
        break;
      case 'bet-down':
        this.changeBet(-1);
        break;
      case 'auto':
        this.toggleAuto();
        break;
      case 'buy-fs':
        void this.buyFeature(false);
        break;
      case 'buy-super':
        void this.buyFeature(true);
        break;
      case 'mute':
        setMuted(!isMuted());
        sfxClick();
        this.renderChrome();
        break;
      case 'info':
        this.root.querySelector<HTMLElement>('[data-modal]')!.hidden = false;
        break;
      case 'close-modal':
        this.root.querySelector<HTMLElement>('[data-modal]')!.hidden = true;
        break;
    }
  }

  private changeBet(dir: 1 | -1) {
    if (this.busy || this.state.inFreeSpins) return;
    sfxClick();
    this.state.bet = nextBet(this.state.bet, dir);
    this.state.message = `Apuesta ${formatMoney(this.state.bet)}`;
    this.renderChrome();
  }

  private toggleAuto() {
    if (this.state.autoPlay > 0) {
      this.state.autoPlay = 0;
      this.state.message = 'Auto detenido';
      this.renderChrome();
      return;
    }
    if (this.busy) return;
    sfxClick();
    this.state.autoPlay = 25;
    this.state.message = 'Auto ×25';
    this.renderChrome();
    void this.spin();
  }

  private async buyFeature(superMode: boolean) {
    if (this.busy || this.state.inFreeSpins) return;
    const cost = buyFeatureCost(this.state.bet, superMode);
    if (this.state.credit < cost) {
      this.state.message = 'Crédito insuficiente';
      this.renderChrome();
      return;
    }
    sfxFreeSpins();
    this.state.credit = +(this.state.credit - cost).toFixed(2);
    this.state.freeSpins = superMode ? 15 : 10;
    this.state.inFreeSpins = true;
    this.state.spots = resetSpots();
    // Super mode seeds some multiplier spots
    if (superMode) {
      for (let i = 0; i < 8; i++) {
        const r = Math.floor(Math.random() * GRID_SIZE);
        const c = Math.floor(Math.random() * GRID_SIZE);
        this.state.spots[r][c] = { level: 1 + Math.floor(Math.random() * 3) };
      }
    }
    this.state.message = superMode
      ? '¡Super Tiradas Gratis activadas!'
      : '¡Tiradas Gratis activadas!';
    this.render();
    await wait(600);
    void this.spin();
  }

  private async spin() {
    if (this.busy) return;
    const paying = !this.state.inFreeSpins;
    if (paying) {
      const cost = spinCost(this.state.bet);
      if (this.state.credit < cost) {
        this.state.message = 'Crédito insuficiente';
        this.state.autoPlay = 0;
        this.renderChrome();
        return;
      }
      this.state.credit = +(this.state.credit - cost).toFixed(2);
      this.state.spots = resetSpots();
    } else {
      if (this.state.freeSpins <= 0) {
        this.state.inFreeSpins = false;
        this.renderChrome();
        return;
      }
      this.state.freeSpins -= 1;
    }

    this.busy = true;
    this.state.phase = 'spinning';
    this.state.lastWin = 0;
    this.state.totalWin = 0;
    this.state.cascadeCount = 0;
    this.state.message = this.state.inFreeSpins
      ? `Tirada gratis · quedan ${this.state.freeSpins}`
      : 'Girando…';
    sfxSpin();
    this.renderChrome();

    // Fresh drop-in grid
    this.state.grid = fillGrid(false);
    this.renderGrid(true);
    await wait(420);

    let roundWin = 0;
    let safety = 0;

    while (safety < 40) {
      safety++;
      this.state.phase = 'evaluating';
      const clusters = findClusters(this.state.grid);
      if (clusters.length === 0) break;

      const { clusters: paid, total } = applyClusterPayouts(
        clusters,
        this.state.spots,
        this.state.bet,
      );
      roundWin = +(roundWin + total).toFixed(2);
      this.state.lastWin = total;
      this.state.totalWin = roundWin;
      this.state.cascadeCount += 1;
      this.state.message =
        total > 0
          ? `Cluster ×${paid.length} · +${formatMoney(total)}`
          : 'Cascada…';

      this.state.grid = markWinningCells(this.state.grid, paid);
      this.state.spots = upgradeSpots(this.state.spots, paid);
      sfxCluster();
      this.burstParticles(paid.flatMap((c) => c.cells));
      this.showBanner(`+${formatMoney(total)}`);
      this.render();
      await wait(520);

      this.state.phase = 'removing';
      this.state.grid = removeClusters(this.state.grid, paid);
      this.renderGrid();
      await wait(160);

      this.state.phase = 'falling';
      const fallen = applyGravity(this.state.grid);
      this.state.grid = fallen.grid;
      if (fallen.moved) sfxDrop();
      this.renderGrid();
      await wait(280);

      this.state.phase = 'refilling';
      this.state.grid = refillGrid(this.state.grid);
      sfxDrop();
      this.renderGrid();
      await wait(320);
    }

    // Scatter check once per paid spin / free spin after cascades settle
    const scatters = countScatters(this.state.grid);
    const fs = awardFreeSpins(scatters);
    if (fs > 0) {
      this.state.freeSpins += fs;
      this.state.inFreeSpins = true;
      sfxFreeSpins();
      this.showBanner(`+${fs} TIRADAS GRATIS`);
      this.state.message = `¡${scatters} Scatter! +${fs} tiradas gratis`;
    }

    if (roundWin > 0) {
      this.state.credit = +(this.state.credit + roundWin).toFixed(2);
      sfxWin(roundWin >= this.state.bet * 10);
      this.state.message =
        fs > 0
          ? this.state.message
          : `Ganancia ${formatMoney(roundWin)}`;
    } else if (fs === 0) {
      this.state.message = this.state.inFreeSpins
        ? `Sin premio · quedan ${this.state.freeSpins}`
        : 'Sin premio · ¡sigue intentando!';
    }

    if (this.state.inFreeSpins && this.state.freeSpins <= 0) {
      this.state.inFreeSpins = false;
      this.state.message =
        roundWin > 0
          ? `Tiradas gratis completadas · ${formatMoney(roundWin)}`
          : 'Tiradas gratis completadas';
      this.showBanner('TIRADAS GRATIS COMPLETADAS');
    }

    this.state.phase = 'idle';
    this.busy = false;
    this.render();

    if (this.state.autoPlay > 0) {
      this.state.autoPlay -= 1;
      this.renderChrome();
      if (this.state.autoPlay > 0 || this.state.inFreeSpins) {
        await wait(450);
        void this.spin();
      }
    } else if (this.state.inFreeSpins && this.state.freeSpins > 0) {
      await wait(500);
      void this.spin();
    }
  }

  private showBanner(text: string) {
    const el = this.root.querySelector<HTMLElement>('[data-banner]');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    window.setTimeout(() => {
      el.hidden = true;
    }, 1200);
  }

  private burstParticles(cells: Array<{ row: number; col: number }>) {
    const layer = this.particlesEl;
    const grid = this.root.querySelector<HTMLElement>('[data-grid]');
    if (!layer || !grid) return;
    const gRect = grid.getBoundingClientRect();
    const cellW = gRect.width / GRID_SIZE;
    const cellH = gRect.height / GRID_SIZE;
    const colors = ['#ff4d6d', '#ffe566', '#7dff9a', '#67e8f9', '#a855f7', '#fb923c'];

    for (const { row, col } of cells) {
      for (let i = 0; i < 6; i++) {
        const p = document.createElement('span');
        p.className = 'particle';
        const x = col * cellW + cellW / 2;
        const y = row * cellH + cellH / 2;
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`);
        p.style.setProperty('--dy', `${-20 - Math.random() * 60}px`);
        layer.appendChild(p);
        window.setTimeout(() => p.remove(), 700);
      }
    }
  }

  private render() {
    this.renderGrid();
    this.renderChrome();
  }

  private renderGrid(entrance = false) {
    const gridEl = this.root.querySelector<HTMLElement>('[data-grid]');
    if (!gridEl) return;

    const frag = document.createDocumentFragment();
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = this.state.grid[r][c];
        const spot = this.state.spots[r][c];
        const tile = document.createElement('div');
        tile.className = 'tile';
        if (spot) {
          tile.classList.add('has-spot');
          tile.dataset.mult = `${MULTIPLIER_STEPS[spot.level]}x`;
        }
        if (cell) {
          tile.innerHTML = `
            <div class="candy ${cell.win ? 'is-win' : ''} ${cell.removing ? 'is-removing' : ''} ${cell.falling || cell.spawn || entrance ? 'is-drop' : ''} ${cell.symbol === 'scatter' ? 'is-scatter' : ''}" data-id="${cell.id}">
              ${candySvg(cell.symbol)}
            </div>
            ${spot ? `<span class="spot-label">${MULTIPLIER_STEPS[spot.level]}×</span>` : ''}
          `;
        } else {
          tile.innerHTML = spot
            ? `<span class="spot-label">${MULTIPLIER_STEPS[spot.level]}×</span>`
            : '';
        }
        frag.appendChild(tile);
      }
    }
    gridEl.replaceChildren(frag);
  }

  private renderChrome() {
    const s = this.state;
    const q = <T extends HTMLElement>(sel: string) =>
      this.root.querySelector<T>(sel);

    const credit = q('[data-credit]');
    const win = q('[data-win]');
    const bet = q('[data-bet]');
    const msg = q('[data-message]');
    const cascade = q('[data-cascade]');
    const fs = q('[data-freespins]');
    const buy = q('[data-buy-price]');
    const buySuper = q('[data-buy-super-price]');
    const mute = q<HTMLButtonElement>('[data-action="mute"]');
    const spin = q<HTMLButtonElement>('[data-action="spin"]');
    const auto = q<HTMLButtonElement>('[data-action="auto"]');

    if (credit) credit.textContent = `${formatMoney(s.credit)} $`;
    if (win) win.textContent = `${formatMoney(s.totalWin || s.lastWin)} $`;
    if (bet) bet.textContent = `${formatMoney(s.bet)} $`;
    if (msg) msg.textContent = s.message;
    if (cascade) cascade.textContent = String(s.cascadeCount);
    if (fs) fs.textContent = String(s.freeSpins);
    if (buy) buy.textContent = `${formatMoney(buyFeatureCost(s.bet, false))} $`;
    if (buySuper) buySuper.textContent = `${formatMoney(buyFeatureCost(s.bet, true))} $`;
    if (mute) mute.textContent = isMuted() ? 'OFF' : 'SON';
    if (spin) {
      spin.classList.toggle('busy', this.busy);
      spin.classList.toggle('free', s.inFreeSpins);
      spin.disabled = this.busy;
    }
    if (auto) {
      auto.classList.toggle('active', s.autoPlay > 0);
      auto.textContent = s.autoPlay > 0 ? `AUTO ${s.autoPlay}` : 'AUTO';
    }

    this.root.querySelector('.stage')?.classList.toggle('in-freespins', s.inFreeSpins);
  }
}
