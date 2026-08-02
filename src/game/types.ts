/** Identificadores de los símbolos del juego. */
export type SymbolId =
  | 'bearRed'
  | 'bearOrange'
  | 'bearPurple'
  | 'bean'
  | 'gumball'
  | 'heart'
  | 'star'
  | 'scatter';

/** Una celda vacía se representa con `null` (solo ocurre a mitad de un tumble). */
export type Cell = SymbolId | null;

/**
 * Tablero de 7x7 en orden por columnas: `index = col * ROWS + row`.
 * La fila 0 es la superior, de modo que la gravedad incrementa el índice de fila.
 */
export type Grid = Cell[];

/** Conjuntos de rodillos: cada uno define su propia distribución de símbolos. */
export type ReelSetId = 'base' | 'baseAnte' | 'free' | 'superFree';

export interface Cluster {
  symbol: SymbolId;
  /** Índices del tablero que forman el cluster. */
  cells: number[];
  /** Pago base en múltiplos de la apuesta total, sin multiplicadores. */
  basePay: number;
  /** Suma de los multiplicadores persistentes cubiertos por el cluster (0 = sin multiplicador). */
  multiplier: number;
  /** Pago final del cluster en múltiplos de la apuesta total. */
  pay: number;
}

/** Movimiento de una celda durante una cascada, usado por el renderizador. */
export interface CellMove {
  col: number;
  /** Fila de origen; negativa cuando el símbolo entra desde arriba del tablero. */
  fromRow: number;
  toRow: number;
  symbol: SymbolId;
}

/** Un paso de la cascada: se detectan clusters, se pagan, se eliminan y se rellena. */
export interface TumbleStep {
  index: number;
  /** Tablero sobre el que se detectaron los clusters. */
  gridBefore: Grid;
  /** Multiplicadores persistentes antes de resolver el paso. */
  multipliersBefore: number[];
  clusters: Cluster[];
  /** Multiplicadores después de subir los puntos ganadores. */
  multipliersAfter: number[];
  /** Puntos cuyo multiplicador cambió en este paso. */
  upgradedSpots: number[];
  /** Ganancia del paso en múltiplos de la apuesta total. */
  stepWin: number;
  /** Tablero resultante tras eliminar, aplicar gravedad y rellenar. */
  gridAfter: Grid;
  moves: CellMove[];
  /** Índices de scatters presentes tras el paso. */
  scatterCells: number[];
}

export type SpinKind = 'base' | 'free';

export interface SpinOutcome {
  kind: SpinKind;
  reelSet: ReelSetId;
  initialGrid: Grid;
  /** Multiplicadores persistentes al empezar la tirada (relevante en tiradas gratis). */
  initialMultipliers: number[];
  steps: TumbleStep[];
  /** Multiplicadores al terminar la tirada. */
  finalMultipliers: number[];
  /** Ganancia total de la tirada en múltiplos de la apuesta total. */
  totalWin: number;
  /** Scatters visibles al final de la secuencia. */
  scatterCount: number;
  scatterCells: number[];
  /** Tiradas gratis otorgadas por esta tirada (activación o reactivación). */
  freeSpinsAwarded: number;
  /** `true` si la ganancia quedó limitada por el tope de pago máximo. */
  cappedByMaxWin: boolean;
}

/** Estados del ciclo de vida de la sesión de juego. */
export type SessionPhase = 'idle' | 'spinning' | 'freeSpins' | 'freeSpinsIntro' | 'freeSpinsOutro';

export interface FreeSpinsState {
  active: boolean;
  spinsLeft: number;
  spinsTotal: number;
  /** Ganancia acumulada de la ronda en múltiplos de la apuesta total. */
  roundWin: number;
  /** Multiplicadores persistentes de la ronda. */
  multipliers: number[];
  reelSet: ReelSetId;
  /** Tiradas gratis compradas con la función "súper". */
  superMode: boolean;
}
