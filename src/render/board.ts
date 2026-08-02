import gsap from 'gsap';
import { Container, Graphics, Sprite, Text, type Ticker } from 'pixi.js';
import { COLS, ROWS, SYMBOLS } from '../game/config';
import { colOf, idx, rowOf } from '../game/grid';
import type { CellMove, Cluster, Grid, SymbolId } from '../game/types';
import type { GameTextures } from './assets';
import { Flashes, Particles, Shaker } from './effects';
import { gradientTexture, radialTexture } from './gradients';
import { played } from './tween';

export interface BoardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const COLUMN_TINTS = [0xff9ad5, 0x9ad7ff, 0xb0ff9a, 0xffd89a, 0xd7a0ff, 0x9affe0, 0xffa0b8];



/** Una celda con su símbolo y su halo propio. */
class SymbolTile extends Container {
  readonly glow: Sprite;
  readonly sprite: Sprite;
  symbol: SymbolId;

  constructor(
    private readonly textures: GameTextures,
    symbol: SymbolId,
    size: number,
  ) {
    super();
    this.symbol = symbol;
    this.glow = new Sprite(textures.glow);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;
    this.glow.width = size * 2;
    this.glow.height = size * 2;
    this.sprite = new Sprite(textures.symbols[symbol]);
    this.sprite.anchor.set(0.5);
    this.sprite.width = size;
    this.sprite.height = size;
    this.addChild(this.glow, this.sprite);
  }

  setSymbol(symbol: SymbolId): void {
    this.symbol = symbol;
    this.sprite.texture = this.textures.symbols[symbol];
  }

  resize(size: number): void {
    this.sprite.width = size;
    this.sprite.height = size;
    this.glow.width = size * 2;
    this.glow.height = size * 2;
  }
}

/** Insignia del multiplicador persistente de una casilla. */
class MultiplierBadge extends Container {
  private readonly plate = new Graphics();
  private readonly caption: Text;
  value = 0;

  constructor(size: number) {
    super();
    this.caption = new Text({
      text: 'x2',
      style: {
        fontFamily: 'Baloo 2',
        fontSize: 30,
        fontWeight: '800',
        fill: 0xffffff,
        stroke: { color: 0x6b1046, width: 5, join: 'round' },
        align: 'center',
      },
    });
    this.caption.anchor.set(0.5);
    this.addChild(this.plate, this.caption);
    this.resize(size);
  }

  resize(size: number): void {
    const w = size * 0.62;
    const h = size * 0.34;
    this.plate.clear();
    this.plate
      .roundRect(-w / 2, -h / 2, w, h, h / 2)
      .fill({ color: 0x2a0538, alpha: 0.86 })
      .stroke({ width: Math.max(1.5, size * 0.022), color: 0xffd24a, alpha: 0.95 });
    this.plate
      .roundRect(-w / 2 + h * 0.16, -h / 2 + h * 0.12, w - h * 0.32, h * 0.3, h * 0.15)
      .fill({ color: 0xffffff, alpha: 0.16 });
    this.caption.style.fontSize = h * 0.72;
    this.caption.style.stroke = { color: 0x6b1046, width: Math.max(2, h * 0.14), join: 'round' };
  }

  setValue(value: number): void {
    this.value = value;
    this.caption.text = `x${value}`;
  }
}

export class BoardView extends Container {
  /** Contenedor sacudible con el tablero completo. */
  readonly root = new Container();
  private readonly decor = new Container();
  private readonly fieldLayer = new Container();
  private readonly symbolLayer = new Container();
  private readonly badgeLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly fieldMask = new Graphics();

  readonly particles: Particles;
  readonly flashes: Flashes;
  private readonly shaker: Shaker;

  private tiles: Array<SymbolTile | null> = new Array(COLS * ROWS).fill(null);
  private badges: Array<MultiplierBadge | null> = new Array(COLS * ROWS).fill(null);
  private multipliers: number[] = new Array(COLS * ROWS).fill(0);

  /** Lado de una casilla en píxeles. */
  cell = 80;
  /** Rectángulo del área de juego dentro del contenedor. */
  field: BoardRect = { x: 0, y: 0, width: 0, height: 0 };
  /** Multiplicador de velocidad: 1 normal, <1 turbo. */
  speed = 1;

  constructor(
    private readonly textures: GameTextures,
    ticker: Ticker,
  ) {
    super();
    this.addChild(this.root);
    this.root.addChild(this.decor, this.fieldLayer);
    this.fieldLayer.addChild(this.symbolLayer, this.badgeLayer, this.fxLayer);
    this.symbolLayer.mask = this.fieldMask;
    this.fieldLayer.addChild(this.fieldMask);

    this.particles = new Particles(textures, ticker);
    this.flashes = new Flashes(ticker);
    this.fxLayer.addChild(this.flashes.layer, this.particles.layer);
    this.shaker = new Shaker(this.root, ticker);
  }

  // ------------------------------------------------------------- geometría

  /** Ajusta el tablero al rectángulo disponible y redibuja la decoración. */
  layout(available: BoardRect): void {
    const margin = Math.min(available.width, available.height) * 0.045;
    const usableW = available.width - margin * 2;
    const usableH = available.height - margin * 2;
    this.cell = Math.floor(Math.min(usableW / COLS, usableH / ROWS));

    const width = this.cell * COLS;
    const height = this.cell * ROWS;
    this.field = {
      x: Math.round(available.x + (available.width - width) / 2),
      y: Math.round(available.y + (available.height - height) / 2),
      width,
      height,
    };

    this.shaker.rebase(0, 0);
    this.drawDecor();
    this.redrawMask();

    for (let cellIndex = 0; cellIndex < this.tiles.length; cellIndex++) {
      const tile = this.tiles[cellIndex];
      if (tile) {
        tile.resize(this.cell * 0.86);
        const center = this.cellCenter(cellIndex);
        tile.position.set(center.x, center.y);
      }
      const badge = this.badges[cellIndex];
      if (badge) {
        badge.resize(this.cell);
        const center = this.cellCenter(cellIndex);
        badge.position.set(center.x, center.y + this.cell * 0.3);
      }
    }
  }

  cellCenter(index: number): { x: number; y: number } {
    return {
      x: this.field.x + (colOf(index) + 0.5) * this.cell,
      y: this.field.y + (rowOf(index) + 0.5) * this.cell,
    };
  }

  rowY(row: number): number {
    return this.field.y + (row + 0.5) * this.cell;
  }

  private redrawMask(): void {
    const bleed = 1;
    this.fieldMask
      .clear()
      .roundRect(
        this.field.x - bleed,
        this.field.y - bleed,
        this.field.width + bleed * 2,
        this.field.height + bleed * 2,
        this.cell * 0.2,
      )
      .fill(0xffffff);
  }

  /** Marco de caramelo, cristal del tablero y adornos. */
  private drawDecor(): void {
    this.decor.removeChildren().forEach((child) => child.destroy({ children: true }));

    const { x, y, width, height } = this.field;
    const cell = this.cell;
    const border = cell * 0.44;
    const radius = cell * 0.46;
    const outer = {
      x: x - border,
      y: y - border,
      width: width + border * 2,
      height: height + border * 2,
    };

    // Halo exterior de neón rosa.
    const halo = new Sprite(
      radialTexture([
        { at: 0, color: 'rgba(255,120,200,0.5)' },
        { at: 0.5, color: 'rgba(190,60,220,0.2)' },
        { at: 1, color: 'rgba(120,20,180,0)' },
      ]),
    );
    halo.anchor.set(0.5);
    halo.width = width * 1.55;
    halo.height = height * 1.6;
    halo.position.set(x + width / 2, y + height / 2);
    halo.blendMode = 'add';
    halo.alpha = 0.55;
    this.decor.addChild(halo);

    // Sombra proyectada del mueble.
    this.decor.addChild(
      new Graphics()
        .roundRect(outer.x, outer.y + border * 0.5, outer.width, outer.height, radius)
        .fill({ color: 0x1a0128, alpha: 0.45 }),
    );

    // Cuerpo del marco con degradado de caramelo.
    const frameShape = new Graphics()
      .roundRect(outer.x, outer.y, outer.width, outer.height, radius)
      .fill(0xffffff);
    const frameFill = new Sprite(
      gradientTexture([
        { at: 0, color: '#ffe3f2' },
        { at: 0.12, color: '#ff9fd0' },
        { at: 0.42, color: '#ff4fa3' },
        { at: 0.72, color: '#d4157a' },
        { at: 0.92, color: '#ff7cbc' },
        { at: 1, color: '#ffd0e9' },
      ]),
    );
    frameFill.position.set(outer.x, outer.y);
    frameFill.width = outer.width;
    frameFill.height = outer.height;
    frameFill.mask = frameShape;
    this.decor.addChild(frameFill, frameShape);

    // Bisel interior y exterior del marco.
    this.decor.addChild(
      new Graphics()
        .roundRect(outer.x, outer.y, outer.width, outer.height, radius)
        .stroke({ width: Math.max(2, cell * 0.05), color: 0xffffff, alpha: 0.55, alignment: 1 })
        .roundRect(x - cell * 0.07, y - cell * 0.07, width + cell * 0.14, height + cell * 0.14, cell * 0.24)
        .stroke({ width: Math.max(2, cell * 0.06), color: 0x8c0b4e, alpha: 0.5, alignment: 0 }),
    );

    // Cristal del tablero.
    const glassShape = new Graphics().roundRect(x, y, width, height, cell * 0.2).fill(0xffffff);
    const glass = new Sprite(
      gradientTexture([
        { at: 0, color: 'rgba(108,42,158,0.88)' },
        { at: 0.45, color: 'rgba(70,20,116,0.85)' },
        { at: 1, color: 'rgba(42,9,74,0.9)' },
      ]),
    );
    glass.position.set(x, y);
    glass.width = width;
    glass.height = height;
    glass.mask = glassShape;
    this.decor.addChild(glass, glassShape);

    // Columnas pastel y separadores muy tenues.
    const stripes = new Graphics();
    for (let col = 0; col < COLS; col++) {
      stripes
        .rect(x + col * cell, y, cell, height)
        .fill({ color: COLUMN_TINTS[col % COLUMN_TINTS.length]!, alpha: col % 2 === 0 ? 0.1 : 0.05 });
    }
    for (let row = 1; row < ROWS; row++) {
      stripes.rect(x, y + row * cell - 1, width, 1).fill({ color: 0xffffff, alpha: 0.055 });
    }
    for (let col = 1; col < COLS; col++) {
      stripes.rect(x + col * cell - 1, y, 1, height).fill({ color: 0xffffff, alpha: 0.04 });
    }
    stripes.mask = glassShape;
    this.decor.addChild(stripes);

    // Viñeta interior.
    const vignette = new Graphics()
      .rect(x, y, width, cell * 0.7)
      .fill({ color: 0x150226, alpha: 0.4 })
      .rect(x, y + height - cell * 0.4, width, cell * 0.4)
      .fill({ color: 0x150226, alpha: 0.28 });
    vignette.mask = glassShape;
    this.decor.addChild(vignette);

    // Glaseado blanco con goteo sobre el borde superior.
    const drips = Math.round(COLS * 1.6);
    const step = outer.width / drips;
    const bandTop = outer.y - border * 0.42;
    const bandHeight = border * 1.05;
    const dripY = bandTop + bandHeight;

    const dripShape = (g: Graphics, color: number, offset: number, alpha = 1): void => {
      g.roundRect(
        outer.x - border * 0.14,
        bandTop + offset,
        outer.width + border * 0.28,
        bandHeight,
        border * 0.5,
      ).fill({ color, alpha });
      for (let i = 0; i <= drips; i++) {
        const cx = outer.x + i * step;
        const wobble = ((i * 53) % 13) / 13;
        const r = border * (0.3 + wobble * 0.42);
        g.circle(cx, dripY + offset - border * 0.06, r).fill({ color, alpha });
        if (i % 2 === 1) {
          g.circle(cx, dripY + offset + r * 0.66, r * 0.66).fill({ color, alpha });
        }
      }
    };

    const dripShadow = new Graphics();
    dripShape(dripShadow, 0xc7136f, border * 0.2, 0.55);
    this.decor.addChild(dripShadow);

    const frosting = new Graphics();
    dripShape(frosting, 0xfff6fb, 0);
    frosting
      .roundRect(outer.x + border * 0.1, bandTop + border * 0.14, outer.width - border * 0.2, border * 0.24, border * 0.12)
      .fill({ color: 0xffffff, alpha: 0.95 });
    this.decor.addChild(frosting);

    // Chispitas de colores repartidas sobre el glaseado.
    const sprinkles = new Graphics();
    const colors = [0xff4fa3, 0x7c3aed, 0x34e0c8, 0xffd633, 0xa3e635, 0xff7043, 0x38bdf8];
    let seed = 11;
    const random = (): number => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < drips * 5; i++) {
      const px = outer.x + random() * outer.width;
      const py = bandTop + border * 0.14 + random() * bandHeight * 0.68;
      const angle = random() * Math.PI;
      const len = border * 0.3;
      sprinkles
        .moveTo(px - Math.cos(angle) * len * 0.5, py - Math.sin(angle) * len * 0.5)
        .lineTo(px + Math.cos(angle) * len * 0.5, py + Math.sin(angle) * len * 0.5)
        .stroke({ width: border * 0.115, color: colors[i % colors.length]!, cap: 'round' });
    }
    this.decor.addChild(sprinkles);

  }

  // --------------------------------------------------------------- símbolos

  private makeTile(symbol: SymbolId, index: number, y?: number): SymbolTile {
    const tile = new SymbolTile(this.textures, symbol, this.cell * 0.86);
    const center = this.cellCenter(index);
    tile.position.set(center.x, y ?? center.y);
    this.symbolLayer.addChild(tile);
    this.tiles[index] = tile;
    return tile;
  }

  private destroyTile(index: number): void {
    const tile = this.tiles[index];
    if (!tile) return;
    gsap.killTweensOf(tile);
    gsap.killTweensOf(tile.scale);
    tile.destroy({ children: true });
    this.tiles[index] = null;
  }

  /** Coloca el tablero al instante, sin animación. */
  setGrid(grid: Grid): void {
    for (let i = 0; i < grid.length; i++) {
      const symbol = grid[i];
      this.destroyTile(i);
      if (symbol) this.makeTile(symbol, i);
    }
  }

  clear(): void {
    for (let i = 0; i < this.tiles.length; i++) this.destroyTile(i);
  }

  /** Caída inicial de las siete columnas con rebote. */
  dropIn(grid: Grid): Promise<void> {
    const timeline = gsap.timeline();
    const fall = 0.42 * this.speed;

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const index = idx(col, row);
        const symbol = grid[index];
        this.destroyTile(index);
        if (!symbol) continue;
        const startY = this.field.y - (ROWS - row + 1.2) * this.cell;
        const tile = this.makeTile(symbol, index, startY);
        tile.alpha = 1;
        timeline.to(
          tile,
          {
            y: this.cellCenter(index).y,
            duration: fall,
            ease: 'back.out(1.35)',
            delay: col * 0.035 * this.speed + row * 0.014 * this.speed,
          },
          0,
        );
        timeline.to(
          tile.scale,
          {
            y: 0.88,
            x: 1.08,
            duration: 0.07 * this.speed,
            yoyo: true,
            repeat: 1,
            ease: 'sine.inOut',
          },
          col * 0.035 * this.speed + row * 0.014 * this.speed + fall * 0.86,
        );
      }
    }
    return played(timeline);
  }

  /** Sale volando todo el tablero (transición entre rondas). */
  dropOut(): Promise<void> {
    const timeline = gsap.timeline();
    for (let col = 0; col < COLS; col++) {
      for (let row = ROWS - 1; row >= 0; row--) {
        const tile = this.tiles[idx(col, row)];
        if (!tile) continue;
        timeline.to(
          tile,
          {
            y: this.field.y + this.field.height + this.cell * 2,
            duration: 0.32 * this.speed,
            ease: 'power2.in',
            delay: col * 0.022 * this.speed,
          },
          0,
        );
      }
    }
    return played(timeline).then(() => {
      this.clear();
    });
  }

  /** Resalta los clusters ganadores: latido, halo y multiplicadores. */
  highlight(clusters: Cluster[]): Promise<void> {
    const timeline = gsap.timeline();
    const cells = new Set<number>();
    for (const cluster of clusters) for (const cell of cluster.cells) cells.add(cell);

    for (const index of cells) {
      const tile = this.tiles[index];
      if (!tile) continue;
      this.symbolLayer.setChildIndex(tile, this.symbolLayer.children.length - 1);
      timeline.to(
        tile.scale,
        { x: 1.16, y: 1.16, duration: 0.17 * this.speed, ease: 'back.out(2.2)' },
        0,
      );
      timeline.to(tile.glow, { alpha: 0.55, duration: 0.17 * this.speed }, 0);
      timeline.to(
        tile.scale,
        { x: 1.04, y: 1.04, duration: 0.13 * this.speed, ease: 'sine.inOut' },
        0.18 * this.speed,
      );
    }

    for (const cluster of clusters) {
      for (const cell of cluster.cells) {
        const badge = this.badges[cell];
        if (!badge) continue;
        timeline.to(
          badge.scale,
          { x: 1.35, y: 1.35, duration: 0.16 * this.speed, yoyo: true, repeat: 1, ease: 'sine.out' },
          0,
        );
      }
    }

    return played(timeline);
  }

  /** Explota las celdas ganadoras con partículas del color del símbolo. */
  pop(cells: number[]): Promise<void> {
    const timeline = gsap.timeline();
    for (const index of cells) {
      const tile = this.tiles[index];
      if (!tile) continue;
      const center = this.cellCenter(index);
      const color = SYMBOLS[tile.symbol].color;
      timeline.to(
        tile.scale,
        {
          x: 0.1,
          y: 0.1,
          duration: 0.2 * this.speed,
          ease: 'power2.in',
          onStart: () => {
            this.flashes.pop(center.x, center.y, this.cell * 1.05, color, 0.34 * this.speed + 0.1);
            this.particles.burst(center.x, center.y, {
              count: 11,
              color,
              speed: this.cell * 0.075,
              size: this.cell * 0.2,
              gravity: this.cell * 0.006,
              life: 0.6,
            });
            this.particles.burst(center.x, center.y, {
              count: 5,
              color: 0xffffff,
              speed: this.cell * 0.06,
              size: this.cell * 0.13,
              gravity: this.cell * 0.004,
              life: 0.45,
              shapes: ['star4', 'dot'],
              blend: 'add',
            });
          },
        },
        0,
      );
      timeline.to(tile, { alpha: 0, duration: 0.16 * this.speed }, 0.06 * this.speed);
    }

    return played(timeline).then(() => {
      for (const index of cells) this.destroyTile(index);
    });
  }

  /** Aplica la cascada: los símbolos caen y entran los nuevos por arriba. */
  cascade(moves: CellMove[], gridAfter: Grid): Promise<void> {
    const next: Array<SymbolTile | null> = new Array(COLS * ROWS).fill(null);
    const consumed = new Set<number>();
    const timeline = gsap.timeline();

    for (const move of moves) {
      const to = idx(move.col, move.toRow);
      if (move.fromRow >= 0) {
        const from = idx(move.col, move.fromRow);
        const tile = this.tiles[from];
        if (!tile) continue;
        consumed.add(from);
        next[to] = tile;
      } else {
        const startY = this.field.y + (move.fromRow + 0.5) * this.cell;
        const tile = new SymbolTile(this.textures, move.symbol, this.cell * 0.86);
        tile.position.set(this.cellCenter(to).x, startY);
        this.symbolLayer.addChild(tile);
        next[to] = tile;
      }
    }

    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      if (tile && !consumed.has(i) && !next[i]) next[i] = tile;
    }

    this.tiles = next;

    const distanceUnit = this.cell;
    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      if (!tile) continue;
      const target = this.cellCenter(i);
      const distance = Math.abs(target.y - tile.y);
      if (distance < 0.5) continue;
      const rows = distance / distanceUnit;
      const duration = (0.2 + Math.min(0.34, rows * 0.055)) * this.speed;
      timeline.to(tile, { y: target.y, duration, ease: 'back.out(1.15)', delay: colOf(i) * 0.02 * this.speed }, 0);
      timeline.to(
        tile.scale,
        { y: 0.9, x: 1.06, duration: 0.06 * this.speed, yoyo: true, repeat: 1, ease: 'sine.inOut' },
        duration * 0.82 + colOf(i) * 0.02 * this.speed,
      );
    }

    return played(timeline).then(() => {
      for (let i = 0; i < this.tiles.length; i++) {
        const tile = this.tiles[i];
        const symbol = gridAfter[i];
        if (tile && symbol) {
          tile.setSymbol(symbol);
          const center = this.cellCenter(i);
          tile.position.set(center.x, center.y);
          tile.scale.set(1);
          tile.alpha = 1;
          tile.glow.alpha = 0;
        }
      }
    });
  }

  // ---------------------------------------------------------- multiplicadores

  /** Sincroniza las insignias con el mapa de multiplicadores. */
  setMultipliers(values: number[]): void {
    this.multipliers = [...values];
    for (let i = 0; i < values.length; i++) {
      const value = values[i] ?? 0;
      const badge = this.badges[i];
      if (value <= 0) {
        if (badge) {
          badge.destroy({ children: true });
          this.badges[i] = null;
        }
        continue;
      }
      if (badge) {
        badge.setValue(value);
      } else {
        const created = new MultiplierBadge(this.cell);
        const center = this.cellCenter(i);
        created.position.set(center.x, center.y + this.cell * 0.3);
        created.setValue(value);
        this.badgeLayer.addChild(created);
        this.badges[i] = created;
      }
    }
  }

  /** Anima la aparición o la subida de los puntos multiplicadores. */
  showMultiplierUpgrades(values: number[], upgraded: number[]): Promise<void> {
    if (!upgraded.length) {
      this.setMultipliers(values);
      return Promise.resolve();
    }

    const timeline = gsap.timeline();
    for (const index of upgraded) {
      const value = values[index] ?? 0;
      const center = this.cellCenter(index);
      const existing = this.badges[index];

      if (!existing) {
        const badge = new MultiplierBadge(this.cell);
        badge.position.set(center.x, center.y + this.cell * 0.3);
        badge.setValue(value);
        badge.scale.set(0.2);
        badge.alpha = 0;
        this.badgeLayer.addChild(badge);
        this.badges[index] = badge;
        timeline.to(badge, { alpha: 1, duration: 0.16 * this.speed }, 0);
        timeline.to(badge.scale, { x: 1, y: 1, duration: 0.34 * this.speed, ease: 'back.out(3)' }, 0);
      } else {
        existing.setValue(value);
        timeline.to(
          existing.scale,
          { x: 1.5, y: 1.5, duration: 0.14 * this.speed, yoyo: true, repeat: 1, ease: 'sine.out' },
          0,
        );
      }

      this.flashes.pop(center.x, center.y + this.cell * 0.3, this.cell * 0.8, 0xffd24a, 0.3);
      this.particles.burst(center.x, center.y + this.cell * 0.3, {
        count: 7,
        color: 0xffd24a,
        speed: this.cell * 0.05,
        size: this.cell * 0.14,
        gravity: this.cell * 0.003,
        life: 0.5,
        shapes: ['star4', 'dot'],
        blend: 'add',
      });
    }

    this.multipliers = [...values];
    return played(timeline);
  }

  /** Quita todas las insignias, con o sin animación. */
  clearMultipliers(animated = true): void {
    for (let i = 0; i < this.badges.length; i++) {
      const badge = this.badges[i];
      if (!badge) continue;
      this.badges[i] = null;
      this.multipliers[i] = 0;
      if (!animated) {
        badge.destroy({ children: true });
        continue;
      }
      gsap.to(badge, {
        alpha: 0,
        duration: 0.28,
        onComplete: () => badge.destroy({ children: true }),
      });
      gsap.to(badge.scale, { x: 0.4, y: 0.4, duration: 0.28, ease: 'power2.in' });
    }
  }

  /** Multiplicador activo en una casilla. */
  multiplierAt(index: number): number {
    return this.multipliers[index] ?? 0;
  }

  /** Latido de los scatters en pantalla. */
  pulseScatters(cells: number[], strong: boolean): Promise<void> {
    if (!cells.length) return Promise.resolve();
    const timeline = gsap.timeline();
    for (const index of cells) {
      const tile = this.tiles[index];
      if (!tile) continue;
      const center = this.cellCenter(index);
      this.symbolLayer.setChildIndex(tile, this.symbolLayer.children.length - 1);
      timeline.to(
        tile.scale,
        {
          x: strong ? 1.32 : 1.18,
          y: strong ? 1.32 : 1.18,
          duration: 0.2 * this.speed,
          yoyo: true,
          repeat: strong ? 3 : 1,
          ease: 'sine.inOut',
        },
        0,
      );
      timeline.to(tile.glow, { alpha: 0.75, duration: 0.2 * this.speed, yoyo: true, repeat: 1 }, 0);
      this.flashes.pop(center.x, center.y, this.cell * 1.3, 0xffe066, 0.5);
    }
    return played(timeline);
  }

  kick(amount: number): void {
    this.shaker.kick(amount);
  }

  celebrate(count = 80): void {
    this.particles.confetti(this.field, count);
  }
}
