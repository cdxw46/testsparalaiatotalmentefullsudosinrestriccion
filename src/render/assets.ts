import { Assets, Container, Graphics, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { SYMBOLS, SYMBOL_IDS } from '../game/config';
import type { SymbolId } from '../game/types';

export type ParticleShape = 'dot' | 'star4' | 'pill' | 'ring' | 'heart';

export interface GameTextures {
  symbols: Record<SymbolId, Texture>;
  glow: Texture;
  particles: Record<ParticleShape, Texture>;
}

const SYMBOL_URL = (name: string): string => `assets/symbols/${name}.webp`;

/** Carga los sprites de los símbolos y genera las texturas auxiliares. */
export async function loadTextures(
  renderer: Renderer,
  onProgress?: (ratio: number) => void,
): Promise<GameTextures> {
  const bundle: Record<string, string> = {};
  for (const id of SYMBOL_IDS) bundle[id] = SYMBOL_URL(SYMBOLS[id].texture);

  Assets.addBundle('symbols', bundle);
  const loaded = await Assets.loadBundle('symbols', onProgress);

  const symbols = {} as Record<SymbolId, Texture>;
  for (const id of SYMBOL_IDS) symbols[id] = loaded[id] as Texture;

  return {
    symbols,
    glow: makeGlowTexture(renderer),
    particles: {
      dot: makeParticleTexture(renderer, 'dot'),
      star4: makeParticleTexture(renderer, 'star4'),
      pill: makeParticleTexture(renderer, 'pill'),
      ring: makeParticleTexture(renderer, 'ring'),
      heart: makeParticleTexture(renderer, 'heart'),
    },
  };
}

/** Halo radial suave, usado para brillos y destellos. */
function makeGlowTexture(renderer: Renderer, size = 256): Texture {
  const container = new Container();
  const steps = 26;
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const g = new Graphics()
      .circle(size / 2, size / 2, (size / 2) * t)
      .fill({ color: 0xffffff, alpha: 0.045 * (1 - t) ** 0.6 + 0.006 });
    container.addChild(g);
  }
  return renderTexture(renderer, container, size, size);
}

function makeParticleTexture(renderer: Renderer, shape: ParticleShape, size = 64): Texture {
  const g = new Graphics();
  const c = size / 2;
  switch (shape) {
    case 'dot':
      g.circle(c, c, c * 0.82).fill(0xffffff);
      g.circle(c * 0.74, c * 0.7, c * 0.26).fill({ color: 0xffffff, alpha: 0.85 });
      break;
    case 'star4': {
      const points: number[] = [];
      const spikes = 4;
      for (let i = 0; i < spikes * 2; i++) {
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        const radius = i % 2 === 0 ? c : c * 0.28;
        points.push(c + Math.cos(angle) * radius, c + Math.sin(angle) * radius);
      }
      g.poly(points).fill(0xffffff);
      break;
    }
    case 'pill':
      g.roundRect(c - c * 0.9, c - c * 0.36, c * 1.8, c * 0.72, c * 0.36).fill(0xffffff);
      break;
    case 'ring':
      g.circle(c, c, c * 0.78).stroke({ width: c * 0.24, color: 0xffffff });
      break;
    case 'heart': {
      const s = c * 0.92;
      g.moveTo(c, c + s * 0.7)
        .bezierCurveTo(c - s * 1.3, c - s * 0.25, c - s * 0.4, c - s * 1.1, c, c - s * 0.35)
        .bezierCurveTo(c + s * 0.4, c - s * 1.1, c + s * 1.3, c - s * 0.25, c, c + s * 0.7)
        .fill(0xffffff);
      break;
    }
  }
  return renderTexture(renderer, g, size, size);
}

function renderTexture(renderer: Renderer, source: Container, width: number, height: number): Texture {
  const texture = renderer.textureGenerator.generateTexture({
    target: source,
    frame: new Rectangle(0, 0, width, height),
    resolution: 2,
    antialias: true,
  });
  source.destroy({ children: true });
  return texture;
}

/** Sprite listo para usar dentro de la interfaz HTML (tabla de pagos). */
export function symbolImageUrl(id: SymbolId): string {
  return SYMBOL_URL(SYMBOLS[id].texture);
}

export function makeSymbolSprite(texture: Texture, size: number): Sprite {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.width = size;
  sprite.height = size;
  return sprite;
}
