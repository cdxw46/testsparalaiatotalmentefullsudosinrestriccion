/**
 * Enlace entre los simbolos y su representacion.
 *
 * Vive aparte de `symbols.ts` a proposito: el motor y el simulador de RTP solo
 * necesitan los datos, y si tuvieran que arrastrar importaciones de imagenes no
 * podrian ejecutarse fuera del bundler.
 */

import baron from '@/assets/cars/baron.webp'
import duchess from '@/assets/cars/duchess.webp'
import rust from '@/assets/cars/rust.webp'
import scarlet from '@/assets/cars/scarlet.webp'
import can from '@/assets/symbols/can.webp'
import cone from '@/assets/symbols/cone.webp'
import flag from '@/assets/symbols/flag.webp'
import gear from '@/assets/symbols/gear.webp'
import lights from '@/assets/symbols/lights.webp'
import nitro from '@/assets/symbols/nitro.webp'
import plug from '@/assets/symbols/plug.webp'
import tyre from '@/assets/symbols/tyre.webp'
import wrench from '@/assets/symbols/wrench.webp'
import type { SymbolId } from './symbols'

export const ART: Record<SymbolId, string> = {
  can,
  cone,
  plug,
  wrench,
  tyre,
  rust,
  duchess,
  baron,
  scarlet,
  flag,
  lights,
  nitro,
  gear,
  // La vuelta extra reutiliza el semaforo; la casilla le anade su propio distintivo.
  lap: lights,
}

/** Color dominante de cada simbolo, para halos, marcos y particulas. */
export const ACCENT: Record<SymbolId, string> = {
  can: '#8fae5c',
  cone: '#f2822c',
  plug: '#4fb7e8',
  wrench: '#9fb4c6',
  tyre: '#c8ced8',
  rust: '#f08a3c',
  duchess: '#5fd8d2',
  baron: '#a874f0',
  scarlet: '#f2453d',
  flag: '#f4f6fb',
  lights: '#3ee06a',
  nitro: '#ff5a2b',
  gear: '#ffc23d',
  lap: '#3ee06a',
}
