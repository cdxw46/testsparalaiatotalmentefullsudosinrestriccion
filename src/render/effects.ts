import { Container, Sprite, Texture, type BLEND_MODES, type Ticker } from 'pixi.js';
import { radialTexture } from './gradients';
import type { GameTextures, ParticleShape } from './assets';

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  spin: number;
  life: number;
  age: number;
  scaleFrom: number;
  scaleTo: number;
  fadeAt: number;
}

export interface BurstOptions {
  count?: number;
  color?: number;
  speed?: number;
  spread?: number;
  gravity?: number;
  size?: number;
  life?: number;
  shapes?: ParticleShape[];
  angle?: number;
  blend?: BLEND_MODES;
}

/**
 * Sistema de partículas con reserva de sprites. Se actualiza en el ticker de
 * Pixi para no depender de temporizadores externos.
 */
export class Particles {
  readonly layer = new Container();
  private pool: Sprite[] = [];
  private active: Particle[] = [];

  constructor(
    private readonly textures: GameTextures,
    ticker: Ticker,
  ) {
    this.layer.label = 'particles';
    ticker.add(this.update, this);
  }

  private obtain(texture: Texture): Sprite {
    const sprite = this.pool.pop() ?? new Sprite();
    sprite.texture = texture;
    sprite.anchor.set(0.5);
    sprite.alpha = 1;
    sprite.rotation = 0;
    sprite.visible = true;
    sprite.blendMode = 'normal';
    this.layer.addChild(sprite);
    return sprite;
  }

  burst(x: number, y: number, options: BurstOptions = {}): void {
    const count = options.count ?? 14;
    const color = options.color ?? 0xffffff;
    const speed = options.speed ?? 5.5;
    const spread = options.spread ?? Math.PI * 2;
    const angle = options.angle ?? -Math.PI / 2;
    const size = options.size ?? 14;
    const life = options.life ?? 0.75;
    const shapes = options.shapes ?? ['dot', 'star4', 'pill'];

    for (let i = 0; i < count; i++) {
      const shape = shapes[(Math.random() * shapes.length) | 0]!;
      const sprite = this.obtain(this.textures.particles[shape]);
      const direction = angle + (Math.random() - 0.5) * spread;
      const velocity = speed * (0.45 + Math.random() * 0.85);
      const scale = (size * (0.55 + Math.random() * 0.75)) / 64;

      sprite.position.set(x, y);
      sprite.tint = color;
      sprite.scale.set(scale);
      if (options.blend) sprite.blendMode = options.blend;

      this.active.push({
        sprite,
        vx: Math.cos(direction) * velocity,
        vy: Math.sin(direction) * velocity,
        gravity: options.gravity ?? 0.34,
        drag: 0.985,
        spin: (Math.random() - 0.5) * 0.34,
        life: life * (0.7 + Math.random() * 0.7),
        age: 0,
        scaleFrom: scale,
        scaleTo: scale * (0.1 + Math.random() * 0.4),
        fadeAt: 0.45,
      });
    }
  }

  /** Lluvia de confeti desde arriba, para las grandes ganancias. */
  confetti(
    area: { x: number; y: number; width: number; height: number },
    count = 90,
    colors: number[] = [0xff4fa3, 0x7c3aed, 0x34e0c8, 0xffd633, 0xa3e635],
  ): void {
    for (let i = 0; i < count; i++) {
      const shape: ParticleShape = Math.random() < 0.5 ? 'pill' : Math.random() < 0.6 ? 'dot' : 'star4';
      const sprite = this.obtain(this.textures.particles[shape]);
      const scale = (10 + Math.random() * 14) / 64;
      sprite.position.set(
        area.x + Math.random() * area.width,
        area.y - 30 - Math.random() * area.height * 0.5,
      );
      sprite.tint = colors[(Math.random() * colors.length) | 0]!;
      sprite.scale.set(scale);
      sprite.rotation = Math.random() * Math.PI;
      this.active.push({
        sprite,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 2 + Math.random() * 3.5,
        gravity: 0.06,
        drag: 0.995,
        spin: (Math.random() - 0.5) * 0.22,
        life: 3.4,
        age: 0,
        scaleFrom: scale,
        scaleTo: scale,
        fadeAt: 0.82,
      });
    }
  }

  private update(ticker: Ticker): void {
    const dt = Math.min(3, ticker.deltaTime);
    const seconds = dt / 60;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]!;
      p.age += seconds;
      const t = p.age / p.life;
      if (t >= 1) {
        p.sprite.visible = false;
        this.layer.removeChild(p.sprite);
        this.pool.push(p.sprite);
        this.active.splice(i, 1);
        continue;
      }

      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      const scale = p.scaleFrom + (p.scaleTo - p.scaleFrom) * t;
      p.sprite.scale.set(scale);
      p.sprite.alpha = t < p.fadeAt ? 1 : 1 - (t - p.fadeAt) / (1 - p.fadeAt);
    }
  }

  clear(): void {
    for (const p of this.active) {
      this.layer.removeChild(p.sprite);
      this.pool.push(p.sprite);
    }
    this.active.length = 0;
  }
}

/** Destello suave que crece y se desvanece. */
export class Flashes {
  readonly layer = new Container();
  private pool: Sprite[] = [];
  private active: Array<{ sprite: Sprite; age: number; life: number; from: number; to: number }> = [];
  private readonly texture = radialTexture([
    { at: 0, color: 'rgba(255,255,255,1)' },
    { at: 0.35, color: 'rgba(255,255,255,0.55)' },
    { at: 1, color: 'rgba(255,255,255,0)' },
  ]);

  constructor(ticker: Ticker) {
    this.layer.label = 'flashes';
    this.layer.blendMode = 'add';
    ticker.add(this.update, this);
  }

  pop(x: number, y: number, size: number, color = 0xffffff, life = 0.42): void {
    const sprite = this.pool.pop() ?? new Sprite(this.texture);
    sprite.texture = this.texture;
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.tint = color;
    sprite.alpha = 0.95;
    sprite.visible = true;
    sprite.scale.set(size / 256);
    this.layer.addChild(sprite);
    this.active.push({ sprite, age: 0, life, from: size / 256, to: (size * 2.1) / 256 });
  }

  private update(ticker: Ticker): void {
    const seconds = Math.min(3, ticker.deltaTime) / 60;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i]!;
      f.age += seconds;
      const t = f.age / f.life;
      if (t >= 1) {
        f.sprite.visible = false;
        this.layer.removeChild(f.sprite);
        this.pool.push(f.sprite);
        this.active.splice(i, 1);
        continue;
      }
      const eased = 1 - (1 - t) ** 2;
      f.sprite.scale.set(f.from + (f.to - f.from) * eased);
      f.sprite.alpha = 0.95 * (1 - t) ** 1.4;
    }
  }
}

/** Sacudida de cámara con amortiguación. */
export class Shaker {
  private amount = 0;
  private baseX = 0;
  private baseY = 0;

  constructor(
    private readonly target: Container,
    ticker: Ticker,
  ) {
    this.baseX = target.x;
    this.baseY = target.y;
    ticker.add(this.update, this);
  }

  rebase(x: number, y: number): void {
    this.baseX = x;
    this.baseY = y;
    this.target.position.set(x, y);
  }

  kick(amount: number): void {
    this.amount = Math.min(26, Math.max(this.amount, amount));
  }

  private update(ticker: Ticker): void {
    if (this.amount <= 0.05) {
      if (this.target.x !== this.baseX || this.target.y !== this.baseY) {
        this.target.position.set(this.baseX, this.baseY);
      }
      return;
    }
    const dt = Math.min(3, ticker.deltaTime);
    this.target.position.set(
      this.baseX + (Math.random() - 0.5) * this.amount,
      this.baseY + (Math.random() - 0.5) * this.amount,
    );
    this.amount *= Math.pow(0.86, dt);
  }
}
