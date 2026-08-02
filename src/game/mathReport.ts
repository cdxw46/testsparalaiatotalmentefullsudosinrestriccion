/**
 * Cifras publicadas de la matemática del juego. Salen de `npm run sim`, que
 * simula el modelo real (las mismas cintas y la misma tabla de pagos que usa el
 * juego), y se muestran en el panel de información.
 */
export const MATH_REPORT = {
  rtp: '96,52 %',
  hitRate: '36,0 %',
  triggerRate: '1 en 209',
  buyRtp: '96,5 %',
  volatility: 'muy alta (σ ≈ 20)',
  spins: '3 millones de',
} as const;
