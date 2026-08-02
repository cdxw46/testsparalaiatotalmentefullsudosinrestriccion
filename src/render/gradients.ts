import { CanvasSource, Texture } from 'pixi.js';

export interface GradientStop {
  at: number;
  color: string;
}

const cache = new Map<string, Texture>();

/**
 * Textura de degradado generada en un canvas. Pixi permite rellenar formas con
 * degradados, pero la API cambió entre versiones menores: generar la textura a
 * mano es equivalente y estable.
 */
export function gradientTexture(stops: GradientStop[], horizontal = false, size = 256): Texture {
  const key = `${horizontal ? 'h' : 'v'}:${size}:${stops.map((s) => `${s.at}${s.color}`).join('|')}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = horizontal ? size : 4;
  canvas.height = horizontal ? 4 : size;
  const ctx = canvas.getContext('2d')!;
  const gradient = horizontal
    ? ctx.createLinearGradient(0, 0, size, 0)
    : ctx.createLinearGradient(0, 0, 0, size);
  for (const stop of stops) gradient.addColorStop(stop.at, stop.color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = fromCanvas(canvas);
  cache.set(key, texture);
  return texture;
}

/** Degradado radial (centro → borde). */
export function radialTexture(stops: GradientStop[], size = 256): Texture {
  const key = `r:${size}:${stops.map((s) => `${s.at}${s.color}`).join('|')}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const stop of stops) gradient.addColorStop(stop.at, stop.color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = fromCanvas(canvas);
  cache.set(key, texture);
  return texture;
}

/** Envuelve un canvas como textura de Pixi. */
function fromCanvas(canvas: HTMLCanvasElement): Texture {
  return new Texture({
    source: new CanvasSource({ resource: canvas, addressMode: 'clamp-to-edge' }),
  });
}
