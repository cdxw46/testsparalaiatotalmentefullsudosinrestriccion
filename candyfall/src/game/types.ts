export type SymbolId =
  | 'bear-red'
  | 'bear-purple'
  | 'bear-orange'
  | 'heart'
  | 'star'
  | 'round'
  | 'bean'
  | 'lime'
  | 'scatter';

export interface SymbolDef {
  id: SymbolId;
  name: string;
  weight: number;
  pays: Record<number, number>; // cluster size bucket -> bet multiplier
  isScatter?: boolean;
}

export interface Cell {
  id: string;
  symbol: SymbolId;
  row: number;
  col: number;
  removing?: boolean;
  falling?: boolean;
  spawn?: boolean;
  win?: boolean;
}

export interface MultiplierSpot {
  level: number; // index into MULTIPLIER_STEPS
}

export interface Cluster {
  symbol: SymbolId;
  cells: Array<{ row: number; col: number }>;
  payout: number;
  multiplier: number;
}

export interface SpinResult {
  totalWin: number;
  cascades: number;
  freeSpinsWon: number;
  clusters: Cluster[];
}

export type GamePhase =
  | 'idle'
  | 'spinning'
  | 'evaluating'
  | 'removing'
  | 'falling'
  | 'refilling'
  | 'celebrating'
  | 'freespin';

export interface GameState {
  grid: (Cell | null)[][];
  spots: (MultiplierSpot | null)[][];
  credit: number;
  bet: number;
  lastWin: number;
  totalWin: number;
  phase: GamePhase;
  freeSpins: number;
  inFreeSpins: boolean;
  autoPlay: number;
  message: string;
  cascadeCount: number;
}
