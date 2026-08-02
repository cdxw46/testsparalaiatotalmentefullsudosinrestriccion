import {
  ANTE_COST_FACTOR,
  BUY_FREE_SPINS_COST,
  BUY_FREE_SPINS_COUNT,
  BUY_SUPER_FREE_SPINS_COST,
  BUY_SUPER_FREE_SPINS_COUNT,
  MAX_WIN_MULTIPLIER,
  MIN_CLUSTER,
  MULTIPLIER_LADDER,
  PAYING_SYMBOLS,
  PAYTABLE,
  PAY_MAX_SIZE,
  PAY_MIN_SIZE,
  SYMBOLS,
  freeSpinsForScatters,
} from '../game/config';
import { MATH_REPORT } from '../game/mathReport';
import type { GameSession } from '../game/session';
import { symbolImageUrl } from '../render/assets';
import { formatMoney, formatNumber } from './format';

export interface ModalDeps {
  session: GameSession;
  getSound: () => { effects: boolean; music: boolean; volume: number };
  setSound: (state: { effects?: boolean; music?: boolean; volume?: number }) => void;
  onStartAuto: (count: number) => void;
  onChange: () => void;
}

const AUTO_OPTIONS = [10, 25, 50, 100, 250, 500];

export class Modals {
  private readonly root = document.getElementById('modal') as HTMLElement;
  private readonly title = document.getElementById('modal-title') as HTMLElement;
  private readonly body = document.getElementById('modal-body') as HTMLElement;

  constructor(private readonly deps: ModalDeps) {
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.close === '1') this.close();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hasAttribute('hidden');
  }

  private open(title: string, html: string): void {
    this.title.textContent = title;
    this.body.innerHTML = html;
    this.root.removeAttribute('hidden');
  }

  close(): void {
    this.root.setAttribute('hidden', '');
  }

  // ------------------------------------------------------------------ pagos

  openInfo(): void {
    const bet = this.deps.session.bet;
    const sizes = [5, 6, 7, 8, 10, 12, 15];

    const cards = PAYING_SYMBOLS.map((id) => {
      const rows = sizes
        .map((size) => {
          const pay = PAYTABLE[id][Math.min(size, PAY_MAX_SIZE) - PAY_MIN_SIZE] ?? 0;
          const label = size >= PAY_MAX_SIZE ? `${PAY_MAX_SIZE}+` : String(size);
          return `<div>${label} · <b>${formatMoney(pay * bet)}</b></div>`;
        })
        .join('');
      return `
        <div class="pay-card">
          <img src="${symbolImageUrl(id)}" alt="${SYMBOLS[id].name}" />
          <div>
            <div class="pay-card__name">${SYMBOLS[id].name}</div>
            <div class="pay-card__rows">${rows}</div>
          </div>
        </div>`;
    }).join('');

    const scatterRows = [3, 4, 5, 6, 7]
      .map((n) => `<div>${n} scatters · <b>${freeSpinsForScatters(n)} tiradas</b></div>`)
      .join('');

    this.open(
      'Cómo se juega y tabla de pagos',
      `
      <h3>El juego en una frase</h3>
      <p>
        Tablero de <b>7 × 7</b> sin líneas: se paga por <b>grupos de ${MIN_CLUSTER} o más</b>
        símbolos iguales pegados en horizontal o vertical. Los símbolos premiados
        <b>explotan</b>, caen otros nuevos y la tirada continúa mientras siga habiendo premios.
      </p>

      <h3>Puntos multiplicadores</h3>
      <p>
        Cada casilla donde explota un premio se convierte en un <b>punto multiplicador</b>
        que empieza en <b>x2</b> y dobla su valor cada vez que vuelve a haber un premio encima
        (${MULTIPLIER_LADDER.map((m) => `x${m}`).join(' · ')}).
        Cuando un grupo ganador cubre puntos multiplicadores, se <b>suman</b> y multiplican ese premio.
      </p>
      <p>
        En el juego base los puntos se borran al terminar la tirada. En las
        <b>tiradas gratis se conservan durante toda la ronda</b>, que es de donde salen las
        ganancias más grandes.
      </p>

      <h3>Tiradas gratis</h3>
      <div class="pay-card__rows">${scatterRows}</div>
      <p>
        Con <b>3 o más máquinas de chicles</b> arrancan las tiradas gratis. Dentro de la ronda,
        3 scatters más suman tiradas extra. También puedes comprarlas:
        <b>${formatMoney(BUY_FREE_SPINS_COST * bet)}</b> por ${BUY_FREE_SPINS_COUNT} tiradas, o
        <b>${formatMoney(BUY_SUPER_FREE_SPINS_COST * bet)}</b> por ${BUY_SUPER_FREE_SPINS_COUNT}
        súper tiradas donde los puntos multiplicadores <b>nacen en x4</b>.
      </p>
      <p>
        La <b>apuesta ante</b> (+${Math.round((ANTE_COST_FACTOR - 1) * 100)} %) hace que los scatters
        aparezcan con mucha más frecuencia, manteniendo el mismo RTP.
      </p>

      <h3>Matemática del juego</h3>
      <div class="stat-grid">
        <div class="stat"><div class="stat__k">RTP</div><div class="stat__v">${MATH_REPORT.rtp}</div></div>
        <div class="stat"><div class="stat__k">VOLATILIDAD</div><div class="stat__v">${MATH_REPORT.volatility}</div></div>
        <div class="stat"><div class="stat__k">GANANCIA MÁXIMA</div><div class="stat__v">x${formatNumber(MAX_WIN_MULTIPLIER)}</div></div>
        <div class="stat"><div class="stat__k">FRECUENCIA DE PREMIO</div><div class="stat__v">${MATH_REPORT.hitRate}</div></div>
        <div class="stat"><div class="stat__k">TIRADAS GRATIS</div><div class="stat__v">${MATH_REPORT.triggerRate}</div></div>
        <div class="stat"><div class="stat__k">RTP DE LA COMPRA</div><div class="stat__v">${MATH_REPORT.buyRtp}</div></div>
      </div>
      <p style="opacity:.75;font-size:12px">
        Valores medidos con ${MATH_REPORT.spins} tiradas simuladas (<code>npm run sim</code>).
      </p>

      <h3>Tabla de pagos <span style="opacity:.7;font-weight:400">· apuesta ${formatMoney(bet)}</span></h3>
      <div class="paytable">${cards}</div>

      <h3>Atajos</h3>
      <ul>
        <li><b>Espacio</b> o <b>Enter</b>: girar / acelerar la tirada</li>
        <li><b>↑ ↓</b>: cambiar la apuesta</li>
        <li><b>T</b>: giro turbo</li>
      </ul>
      `,
    );
  }

  // --------------------------------------------------------------- ajustes

  openSettings(): void {
    const sound = this.deps.getSound();
    this.open(
      'Ajustes',
      `
      <div class="switch-row">
        <div>
          <div class="switch-row__label">Efectos de sonido</div>
          <div class="switch-row__hint">Explosiones, cascadas y multiplicadores</div>
        </div>
        <button class="switch" id="set-effects" type="button" aria-pressed="${sound.effects}"></button>
      </div>
      <div class="switch-row">
        <div>
          <div class="switch-row__label">Música</div>
          <div class="switch-row__hint">Melodía de fondo generada en tiempo real</div>
        </div>
        <button class="switch" id="set-music" type="button" aria-pressed="${sound.music}"></button>
      </div>
      <div class="slider-row">
        <div class="switch-row__label" style="flex:0 0 auto">Volumen</div>
        <input id="set-volume" type="range" min="0" max="100" value="${Math.round(sound.volume * 100)}" />
      </div>
      <h3>Sesión</h3>
      <div class="stat-grid">
        <div class="stat"><div class="stat__k">TIRADAS JUGADAS</div><div class="stat__v">${this.deps.session.spinsPlayed}</div></div>
        <div class="stat"><div class="stat__k">APOSTADO</div><div class="stat__v">${formatMoney(this.deps.session.totalStaked)}</div></div>
        <div class="stat"><div class="stat__k">DEVUELTO</div><div class="stat__v">${formatMoney(this.deps.session.totalReturned)}</div></div>
        <div class="stat"><div class="stat__k">RTP DE LA SESIÓN</div><div class="stat__v">${
          this.deps.session.totalStaked > 0
            ? `${((this.deps.session.totalReturned / this.deps.session.totalStaked) * 100).toFixed(1)} %`
            : '—'
        }</div></div>
      </div>
      <div class="chip-row">
        <button class="chip" id="set-topup" type="button">Recargar 1.000 $ de demostración</button>
      </div>
      `,
    );

    const effects = document.getElementById('set-effects') as HTMLButtonElement;
    const music = document.getElementById('set-music') as HTMLButtonElement;
    const volume = document.getElementById('set-volume') as HTMLInputElement;
    const topUp = document.getElementById('set-topup') as HTMLButtonElement;

    effects.addEventListener('click', () => {
      const next = effects.getAttribute('aria-pressed') !== 'true';
      effects.setAttribute('aria-pressed', String(next));
      this.deps.setSound({ effects: next });
    });
    music.addEventListener('click', () => {
      const next = music.getAttribute('aria-pressed') !== 'true';
      music.setAttribute('aria-pressed', String(next));
      this.deps.setSound({ music: next });
    });
    volume.addEventListener('input', () => {
      this.deps.setSound({ volume: Number(volume.value) / 100 });
    });
    topUp.addEventListener('click', () => {
      this.deps.session.deposit(1000);
      this.deps.onChange();
      this.openSettings();
    });
  }

  // ------------------------------------------------------------ automático

  openAuto(): void {
    this.open(
      'Tiradas automáticas',
      `
      <p>Elige cuántas tiradas quieres lanzar seguidas. Puedes detenerlas en cualquier momento con el botón central.</p>
      <div class="chip-row" id="auto-options">
        ${AUTO_OPTIONS.map((n) => `<button class="chip" data-auto="${n}" type="button">${n}</button>`).join('')}
      </div>
      `,
    );

    const container = document.getElementById('auto-options')!;
    container.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('[data-auto]') as HTMLElement | null;
      if (!button) return;
      this.close();
      this.deps.onStartAuto(Number(button.dataset.auto));
    });
  }
}
