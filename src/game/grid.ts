import { CELLS, COLS, MIN_CLUSTER, ROWS, clusterPay } from './config';
import type { Rng } from './rng';
import { ReelFeed } from './strips';
import type { Cell, CellMove, Cluster, Grid, ReelSetId, SymbolId } from './types';

export const idx = (col: number, row: number): number => col * ROWS + row;
export const colOf = (index: number): number => Math.floor(index / ROWS);
export const rowOf = (index: number): number => index % ROWS;

/** Tablero inicial leyendo la ventana visible de cada cinta. */
export function gridFromFeed(feed: ReelFeed): Grid {
  const grid: Grid = new Array<Cell>(CELLS).fill(null);
  for (let col = 0; col < COLS; col++) {
    const window = feed.window(col);
    for (let row = 0; row < ROWS; row++) grid[idx(col, row)] = window[row]!;
  }
  return grid;
}

export function randomGrid(reelSet: ReelSetId, rng: Rng): Grid {
  return gridFromFeed(new ReelFeed(reelSet, rng));
}

export function emptyMultipliers(): number[] {
  return new Array<number>(CELLS).fill(0);
}

/** Coloca scatters en posiciones libres al azar (usado por la compra de función). */
export function seedScatters(grid: Grid, count: number, rng: Rng): number[] {
  const free: number[] = [];
  for (let i = 0; i < CELLS; i++) if (grid[i] !== 'scatter') free.push(i);
  const placed: number[] = [];
  for (let n = 0; n < count && free.length; n++) {
    const pick = rng.int(free.length);
    const cell = free[pick]!;
    free.splice(pick, 1);
    grid[cell] = 'scatter';
    placed.push(cell);
  }
  return placed;
}

export function scatterCells(grid: Grid): number[] {
  const cells: number[] = [];
  for (let i = 0; i < CELLS; i++) if (grid[i] === 'scatter') cells.push(i);
  return cells;
}

/**
 * Busca todos los clusters de 5 o más símbolos iguales conectados en
 * horizontal o vertical. El scatter nunca forma cluster.
 */
export function findClusters(grid: Grid, multipliers?: number[]): Cluster[] {
  const seen = new Uint8Array(CELLS);
  const clusters: Cluster[] = [];
  const stack: number[] = [];

  for (let start = 0; start < CELLS; start++) {
    const symbol = grid[start];
    if (!symbol || symbol === 'scatter' || seen[start]) continue;

    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    const cells: number[] = [];

    while (stack.length) {
      const cell = stack.pop()!;
      cells.push(cell);
      const col = colOf(cell);
      const row = rowOf(cell);

      if (row > 0) maybePush(cell - 1);
      if (row < ROWS - 1) maybePush(cell + 1);
      if (col > 0) maybePush(cell - ROWS);
      if (col < COLS - 1) maybePush(cell + ROWS);
    }

    if (cells.length >= MIN_CLUSTER) {
      cells.sort((a, b) => a - b);
      const basePay = clusterPay(symbol, cells.length);
      let multiplier = 0;
      if (multipliers) {
        for (const cell of cells) multiplier += multipliers[cell] ?? 0;
      }
      clusters.push({
        symbol,
        cells,
        basePay,
        multiplier,
        pay: basePay * (multiplier > 0 ? multiplier : 1),
      });
    }

    function maybePush(next: number): void {
      if (!seen[next] && grid[next] === symbol) {
        seen[next] = 1;
        stack.push(next);
      }
    }
  }

  return clusters;
}

export interface TumbleResult {
  grid: Grid;
  moves: CellMove[];
}

/**
 * Elimina las celdas indicadas, aplica gravedad por columna y rellena por
 * arriba con símbolos nuevos de la cinta. Devuelve el tablero resultante y los
 * movimientos para animar.
 */
export function collapseAndRefill(
  grid: Grid,
  removed: ReadonlySet<number>,
  feed: ReelFeed,
): TumbleResult {
  const next: Grid = new Array<Cell>(CELLS).fill(null);
  const moves: CellMove[] = [];

  for (let col = 0; col < COLS; col++) {
    const survivors: Array<{ row: number; symbol: SymbolId }> = [];
    for (let row = 0; row < ROWS; row++) {
      const cell = idx(col, row);
      const symbol = grid[cell];
      if (symbol && !removed.has(cell)) survivors.push({ row, symbol });
    }

    const newCount = ROWS - survivors.length;
    const incoming = newCount > 0 ? feed.take(col, newCount) : [];

    for (let n = 0; n < newCount; n++) {
      const symbol = incoming[n]!;
      next[idx(col, n)] = symbol;
      moves.push({ col, fromRow: n - newCount, toRow: n, symbol });
    }

    survivors.forEach((survivor, i) => {
      const toRow = newCount + i;
      next[idx(col, toRow)] = survivor.symbol;
      if (toRow !== survivor.row) {
        moves.push({ col, fromRow: survivor.row, toRow, symbol: survivor.symbol });
      }
    });
  }

  return { grid: next, moves };
}

/** Vuelca un tablero como texto de 7 filas; útil en tests y depuración. */
export function gridToString(grid: Grid): string {
  const short: Record<SymbolId, string> = {
    bearRed: 'R',
    bearOrange: 'O',
    bearPurple: 'P',
    bean: 'B',
    gumball: 'G',
    heart: 'H',
    star: 'S',
    scatter: '*',
  };
  const lines: string[] = [];
  for (let row = 0; row < ROWS; row++) {
    let line = '';
    for (let col = 0; col < COLS; col++) {
      const symbol = grid[idx(col, row)];
      line += symbol ? short[symbol] : '.';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** Construye un tablero a partir de la notación usada por `gridToString`. */
export function gridFromString(text: string): Grid {
  const long: Record<string, SymbolId> = {
    R: 'bearRed',
    O: 'bearOrange',
    P: 'bearPurple',
    B: 'bean',
    G: 'gumball',
    H: 'heart',
    S: 'star',
    '*': 'scatter',
  };
  const rows = text
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length !== ROWS) throw new Error(`Se esperaban ${ROWS} filas, llegaron ${rows.length}`);
  const grid: Grid = new Array<Cell>(CELLS).fill(null);
  rows.forEach((line, row) => {
    if (line.length !== COLS) throw new Error(`La fila ${row} debe tener ${COLS} caracteres`);
    for (let col = 0; col < COLS; col++) {
      const ch = line[col]!;
      grid[idx(col, row)] = ch === '.' ? null : (long[ch] ?? null);
    }
  });
  return grid;
}
