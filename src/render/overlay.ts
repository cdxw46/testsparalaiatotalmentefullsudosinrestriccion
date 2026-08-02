import gsap from 'gsap';
import { Container, Graphics, Sprite, Text, type Ticker } from 'pixi.js';
import { formatMoney } from '../ui/format';
import type { WinTierKey } from '../game/config';
import { radialTexture } from './gradients';
import type { BoardRect } from './board';
import { played } from './tween';

const TIER_COLORS: Record<WinTierKey, { top: number; bottom: number; glow: number }> = {
  nice: { top: 0xffffff, bottom: 0xffc7e6, glow: 0xff6fb5 },
  big: { top: 0xfff6c2, bottom: 0xffc233, glow: 0xff9d2f },
  huge: { top: 0xd8fff2, bottom: 0x34e0c8, glow: 0x1ec8ff },
  epic: { top: 0xffe6ff, bottom: 0xb46bff, glow: 0x8b2bff },
  mega: { top: 0xfff0d0, bottom: 0xff8a2b, glow: 0xff3d2b },
  insane: { top: 0xffffff, bottom: 0xff4fa3, glow: 0xffd24a },
};

/** Rótulos flotantes sobre el tablero: ganancia acumulada, cascadas y avisos. */
export class Overlay extends Container {
  private readonly winPanel = new Container();
  private readonly winPlate = new Graphics();
  private readonly winValue: Text;
  private readonly winCaption: Text;

  private readonly freePanel = new Container();
  private readonly freePlate = new Graphics();
  private readonly freeTitle: Text;
  private readonly freeCount: Text;
  private readonly freeWin: Text;

  private readonly bannerPanel = new Container();
  private readonly bannerGlow: Sprite;
  private readonly bannerTitle: Text;
  private readonly bannerSub: Text;

  private cell = 80;
  speed = 1;

  constructor(_ticker: Ticker) {
    super();
    this.eventMode = 'none';

    this.winValue = new Text({
      text: '',
      style: {
        fontFamily: 'Baloo 2',
        fontSize: 54,
        fontWeight: '800',
        fill: 0xffffff,
        stroke: { color: 0x63104a, width: 7, join: 'round' },
        dropShadow: { color: 0x2a0224, blur: 6, distance: 3, alpha: 0.6, angle: Math.PI / 2 },
        align: 'center',
      },
    });
    this.winValue.anchor.set(0.5);
    this.winCaption = new Text({
      text: 'GANANCIA',
      style: {
        fontFamily: 'Nunito',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 3,
        fill: 0xffd6ef,
        align: 'center',
      },
    });
    this.winCaption.anchor.set(0.5);
    this.winPanel.addChild(this.winPlate, this.winCaption, this.winValue);
    this.winPanel.alpha = 0;
    this.winPanel.scale.set(0.8);

    this.freeTitle = new Text({
      text: 'TIRADAS GRATIS',
      style: {
        fontFamily: 'Nunito',
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 2.5,
        fill: 0xffd6ef,
      },
    });
    this.freeTitle.anchor.set(0, 0.5);
    this.freeCount = new Text({
      text: '0 / 0',
      style: {
        fontFamily: 'Baloo 2',
        fontSize: 34,
        fontWeight: '800',
        fill: 0xffffff,
        stroke: { color: 0x63104a, width: 5, join: 'round' },
      },
    });
    this.freeCount.anchor.set(0, 0.5);
    this.freeWin = new Text({
      text: '',
      style: {
        fontFamily: 'Baloo 2',
        fontSize: 26,
        fontWeight: '800',
        fill: 0xffe066,
        stroke: { color: 0x5c2a02, width: 4, join: 'round' },
      },
    });
    this.freeWin.anchor.set(1, 0.5);
    this.freePanel.addChild(this.freePlate, this.freeTitle, this.freeCount, this.freeWin);
    this.freePanel.alpha = 0;

    this.bannerGlow = new Sprite(
      radialTexture([
        { at: 0, color: 'rgba(255,255,255,0.85)' },
        { at: 0.42, color: 'rgba(255,180,240,0.35)' },
        { at: 1, color: 'rgba(255,120,220,0)' },
      ]),
    );
    this.bannerGlow.anchor.set(0.5);
    this.bannerGlow.blendMode = 'add';
    this.bannerTitle = new Text({
      text: '',
      style: {
        fontFamily: 'Baloo 2',
        fontSize: 62,
        fontWeight: '800',
        fill: 0xffffff,
        stroke: { color: 0x5c0a3f, width: 9, join: 'round' },
        dropShadow: { color: 0x2a0224, blur: 10, distance: 5, alpha: 0.7, angle: Math.PI / 2 },
        align: 'center',
      },
    });
    this.bannerTitle.anchor.set(0.5);
    this.bannerSub = new Text({
      text: '',
      style: {
        fontFamily: 'Baloo 2',
        fontSize: 40,
        fontWeight: '800',
        fill: 0xffe066,
        stroke: { color: 0x5c2a02, width: 7, join: 'round' },
        align: 'center',
      },
    });
    this.bannerSub.anchor.set(0.5);
    this.bannerPanel.addChild(this.bannerGlow, this.bannerTitle, this.bannerSub);
    this.bannerPanel.alpha = 0;

    this.addChild(this.winPanel, this.freePanel, this.bannerPanel);
  }

  layout(field: BoardRect, cell: number): void {
    this.cell = cell;

    const cx = field.x + field.width / 2;
    this.winPanel.position.set(cx, field.y + field.height + cell * 0.62);
    this.winValue.style.fontSize = cell * 0.62;
    this.winValue.style.stroke = { color: 0x63104a, width: cell * 0.08, join: 'round' };
    this.winCaption.style.fontSize = cell * 0.19;
    this.winCaption.y = -cell * 0.42;
    this.redrawWinPlate();

    const panelWidth = Math.min(field.width * 0.86, cell * 5.6);
    const panelHeight = cell * 0.62;
    this.freePanel.position.set(cx, field.y - cell * 0.95);
    this.freePlate
      .clear()
      .roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, panelHeight / 2)
      .fill({ color: 0x39063f, alpha: 0.82 })
      .stroke({ width: Math.max(2, cell * 0.03), color: 0xff8ad0, alpha: 0.85 });
    this.freeTitle.style.fontSize = cell * 0.17;
    this.freeCount.style.fontSize = cell * 0.34;
    this.freeWin.style.fontSize = cell * 0.3;
    this.freeTitle.position.set(-panelWidth / 2 + cell * 0.28, -panelHeight * 0.02);
    this.freeCount.position.set(-panelWidth / 2 + cell * 0.28 + this.freeTitle.width + cell * 0.22, 0);
    this.freeWin.position.set(panelWidth / 2 - cell * 0.28, 0);

    this.bannerPanel.position.set(cx, field.y + field.height * 0.42);
    this.bannerGlow.width = field.width * 1.25;
    this.bannerGlow.height = field.height * 0.85;
    this.bannerTitle.style.fontSize = Math.min(cell * 0.86, (field.width / 9) * 1.5);
    this.bannerTitle.style.stroke = { color: 0x5c0a3f, width: cell * 0.11, join: 'round' };
    this.bannerSub.style.fontSize = cell * 0.58;
    this.bannerTitle.y = -cell * 0.42;
    this.bannerSub.y = cell * 0.42;
  }

  private redrawWinPlate(): void {
    const w = Math.max(this.cell * 3.4, this.winValue.width + this.cell * 1.1);
    const h = this.cell * 1.16;
    this.winPlate
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, h / 2)
      .fill({ color: 0x2a0538, alpha: 0.72 })
      .stroke({ width: Math.max(2, this.cell * 0.035), color: 0xffd24a, alpha: 0.7 });
  }

  /** Muestra el importe acumulado de la tirada. */
  showWin(amount: number, hot = false, tumble = 0): void {
    this.winValue.text = formatMoney(amount);
    this.winValue.style.fill = hot ? 0xffe066 : 0xffffff;
    this.winCaption.text = tumble >= 2 ? `¡CASCADA x${tumble}!` : 'GANANCIA';
    this.winCaption.style.fill = tumble >= 2 ? 0xffe066 : 0xffd6ef;
    this.redrawWinPlate();
    gsap.killTweensOf(this.winPanel);
    gsap.killTweensOf(this.winPanel.scale);
    gsap.to(this.winPanel, { alpha: 1, duration: 0.16 });
    gsap.fromTo(
      this.winPanel.scale,
      { x: 0.86, y: 0.86 },
      { x: 1, y: 1, duration: 0.34, ease: 'back.out(3)' },
    );
  }

  hideWin(delay = 0): void {
    gsap.to(this.winPanel, { alpha: 0, duration: 0.25, delay });
  }

  /** Panel de la ronda de tiradas gratis. */
  showFreeSpins(left: number, total: number, roundWin: number): void {
    this.freeCount.text = `${left} / ${total}`;
    this.freeWin.text = roundWin > 0 ? formatMoney(roundWin) : '';
    if (this.freePanel.alpha < 1) {
      gsap.to(this.freePanel, { alpha: 1, duration: 0.3 });
      gsap.fromTo(
        this.freePanel.scale,
        { x: 0.85, y: 0.85 },
        { x: 1, y: 1, duration: 0.5, ease: 'back.out(2.4)' },
      );
    }
  }

  /** Latido del contador al consumir una tirada gratis. */
  pulseFreeSpins(): void {
    gsap.killTweensOf(this.freeCount.scale);
    gsap.fromTo(
      this.freeCount.scale,
      { x: 1.3, y: 1.3 },
      { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' },
    );
  }

  hideFreeSpins(): void {
    gsap.to(this.freePanel, { alpha: 0, duration: 0.3 });
  }

  /** Cartel grande: celebraciones, entrada y salida de tiradas gratis. */
  async banner(
    title: string,
    subtitle: string,
    options: { tier?: WinTierKey; hold?: number; countTo?: number } = {},
  ): Promise<void> {
    const colors = TIER_COLORS[options.tier ?? 'big'];
    this.bannerTitle.text = title;
    this.bannerTitle.style.fill = colors.top;
    this.bannerSub.style.fill = colors.bottom;
    this.bannerGlow.tint = colors.glow;
    this.bannerSub.text = options.countTo !== undefined ? formatMoney(0) : subtitle;

    const hold = (options.hold ?? 1.5) * Math.max(0.55, this.speed);
    // El latido del halo se anima aparte: un repeat infinito dentro del timeline
    // impediría que su promesa se resolviese nunca.
    const glow = gsap.to(this.bannerGlow, {
      alpha: 0.45,
      duration: 0.4,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
    const timeline = gsap.timeline();
    timeline.set(this.bannerPanel.scale, { x: 0.6, y: 0.6 });
    timeline.to(this.bannerPanel, { alpha: 1, duration: 0.2 }, 0);
    timeline.to(this.bannerPanel.scale, { x: 1, y: 1, duration: 0.6, ease: 'elastic.out(1, 0.6)' }, 0);

    if (options.countTo !== undefined) {
      const counter = { value: 0 };
      timeline.to(
        counter,
        {
          value: options.countTo,
          duration: Math.max(0.8, hold * 0.75),
          ease: 'power1.out',
          onUpdate: () => {
            this.bannerSub.text = formatMoney(counter.value);
          },
        },
        0.25,
      );
    }

    timeline.to(this.bannerPanel, { alpha: 0, duration: 0.3, delay: hold }, '>');
    await played(timeline);
    glow.kill();
    this.bannerGlow.alpha = 1;
  }

  /** Aviso corto centrado, sin bloquear. */
  flashBanner(title: string, subtitle: string, tier: WinTierKey = 'nice'): void {
    void this.banner(title, subtitle, { tier, hold: 0.9 });
  }

  reset(): void {
    gsap.killTweensOf(this.winPanel);
    gsap.killTweensOf(this.freePanel);
    gsap.killTweensOf(this.bannerPanel);
    this.winPanel.alpha = 0;
    this.freePanel.alpha = 0;
    this.bannerPanel.alpha = 0;
  }
}
