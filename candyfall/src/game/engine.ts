import {
  GRID_SIZE,
  MIN_CLUSTER,
  MULTIPLIER_STEPS,
  freeSpinsFromScatters,
  payoutForCluster,
  randomSymbol,
} from './symbols';
import type { Cell, Cluster, GameState, MultiplierSpot, SymbolId } from './types';

let cellSeq = 0;

function uid(): string {
  cellSeq += 1;
  return `c${cellSeq}`;
}

export function createEmptySpots(): (MultiplierSpot | null)[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => null),
  );
}

export function createInitialState(): GameState {
  return {
    grid: fillGrid(true),
    spots: createEmptySpots(),
    credit: 1000,
    bet: 1,
    lastWin: 0,
    totalWin: 0,
    phase: 'idle',
    freeSpins: 0,
    inFreeSpins: false,
    autoPlay: 0,
    message: '¡Pulsa GIRAR para empezar!',
    cascadeCount: 0,
  };
}

export function fillGrid(avoidInitialWins = false): (Cell | null)[][] {
  const grid: (Cell | null)[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => null),
  );

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      let symbol = randomSymbol();
      if (avoidInitialWins) {
        let tries = 0;
        while (tries < 12) {
          grid[r][c] = makeCell(symbol, r, c);
          const clusters = findClusters(grid);
          if (clusters.length === 0) break;
          symbol = randomSymbol(true);
          tries++;
        }
      }
      grid[r][c] = makeCell(symbol, r, c, { spawn: true });
    }
  }
  return grid;
}

function makeCell(
  symbol: SymbolId,
  row: number,
  col: number,
  flags: Partial<Cell> = {},
): Cell {
  return { id: uid(), symbol, row, col, ...flags };
}

export function cloneGrid(grid: (Cell | null)[][]): (Cell | null)[][] {
  return grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function findClusters(grid: (Cell | null)[][]): Cluster[] {
  const visited = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => false),
  );
  const clusters: Cluster[] = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = grid[r][c];
      if (!cell || visited[r][c] || cell.symbol === 'scatter') continue;

      const cells: Array<{ row: number; col: number }> = [];
      const stack = [{ row: r, col: c }];
      const symbol = cell.symbol;

      while (stack.length) {
        const cur = stack.pop()!;
        if (
          cur.row < 0 ||
          cur.col < 0 ||
          cur.row >= GRID_SIZE ||
          cur.col >= GRID_SIZE ||
          visited[cur.row][cur.col]
        ) {
          continue;
        }
        const n = grid[cur.row][cur.col];
        if (!n || n.symbol !== symbol) continue;
        visited[cur.row][cur.col] = true;
        cells.push(cur);
        stack.push(
          { row: cur.row + 1, col: cur.col },
          { row: cur.row - 1, col: cur.col },
          { row: cur.row, col: cur.col + 1 },
          { row: cur.row, col: cur.col - 1 },
        );
      }

      if (cells.length >= MIN_CLUSTER) {
        clusters.push({
          symbol,
          cells,
          payout: 0,
          multiplier: 1,
        });
      }
    }
  }

  return clusters;
}

export function countScatters(grid: (Cell | null)[][]): number {
  let n = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell?.symbol === 'scatter') n++;
    }
  }
  return n;
}

export function applyClusterPayouts(
  clusters: Cluster[],
  spots: (MultiplierSpot | null)[][],
  bet: number,
): { clusters: Cluster[]; total: number } {
  let total = 0;
  const enriched = clusters.map((cluster) => {
    let mult = 1;
    for (const { row, col } of cluster.cells) {
      const spot = spots[row][col];
      if (spot) {
        mult = Math.max(mult, MULTIPLIER_STEPS[spot.level] ?? 1);
      }
    }
    // During free spins spots already elevated; also sum unique spot boosts lightly
    const base = payoutForCluster(cluster.symbol, cluster.cells.length) * bet;
    const payout = +(base * mult).toFixed(2);
    total += payout;
    return { ...cluster, payout, multiplier: mult };
  });
  return { clusters: enriched, total: +total.toFixed(2) };
}

export function upgradeSpots(
  spots: (MultiplierSpot | null)[][],
  clusters: Cluster[],
): (MultiplierSpot | null)[][] {
  const next = spots.map((row) => row.map((s) => (s ? { ...s } : null)));
  for (const cluster of clusters) {
    for (const { row, col } of cluster.cells) {
      const cur = next[row][col];
      if (!cur) {
        next[row][col] = { level: 1 }; // start at 2x
      } else {
        next[row][col] = {
          level: Math.min(cur.level + 1, MULTIPLIER_STEPS.length - 1),
        };
      }
    }
  }
  return next;
}

export function removeClusters(
  grid: (Cell | null)[][],
  clusters: Cluster[],
): (Cell | null)[][] {
  const mark = new Set(clusters.flatMap((c) => c.cells.map((x) => `${x.row},${x.col}`)));
  return grid.map((row, r) =>
    row.map((cell, c) => {
      if (!cell) return null;
      if (mark.has(`${r},${c}`)) return null;
      return { ...cell, win: false, removing: false };
    }),
  );
}

export function markWinningCells(
  grid: (Cell | null)[][],
  clusters: Cluster[],
): (Cell | null)[][] {
  const mark = new Set(clusters.flatMap((c) => c.cells.map((x) => `${x.row},${x.col}`)));
  return grid.map((row, r) =>
    row.map((cell, c) => {
      if (!cell) return null;
      if (mark.has(`${r},${c}`)) return { ...cell, win: true, removing: true };
      return { ...cell, win: false, removing: false };
    }),
  );
}

/** Gravity: cells fall down into empty spaces */
export function applyGravity(grid: (Cell | null)[][]): {
  grid: (Cell | null)[][];
  moved: boolean;
} {
  const next: (Cell | null)[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => null),
  );
  let moved = false;

  for (let c = 0; c < GRID_SIZE; c++) {
    const stack: Cell[] = [];
    for (let r = GRID_SIZE - 1; r >= 0; r--) {
      const cell = grid[r][c];
      if (cell) stack.push(cell);
    }
    let write = GRID_SIZE - 1;
    for (const cell of stack) {
      if (cell.row !== write) moved = true;
      next[write][c] = {
        ...cell,
        row: write,
        col: c,
        falling: cell.row !== write,
        spawn: false,
        removing: false,
        win: false,
      };
      write--;
    }
  }

  return { grid: next, moved };
}

export function refillGrid(grid: (Cell | null)[][]): (Cell | null)[][] {
  const next = cloneGrid(grid);
  for (let c = 0; c < GRID_SIZE; c++) {
    for (let r = 0; r < GRID_SIZE; r++) {
      if (!next[r][c]) {
        next[r][c] = makeCell(randomSymbol(), r, c, { spawn: true, falling: true });
      }
    }
  }
  return next;
}

export function resetSpots(): (MultiplierSpot | null)[][] {
  return createEmptySpots();
}

export function spinCost(bet: number): number {
  return bet;
}

export function buyFeatureCost(bet: number, superMode = false): number {
  return bet * (superMode ? 500 : 100);
}

export function awardFreeSpins(scatterCount: number): number {
  return freeSpinsFromScatters(scatterCount);
}

export const BET_STEPS = [0.2, 0.4, 0.6, 0.8, 1, 2, 4, 6, 8, 10, 20, 40, 60, 80, 100];

export function nextBet(current: number, dir: 1 | -1): number {
  const idx = BET_STEPS.findIndex((b) => b >= current);
  const i = idx === -1 ? BET_STEPS.length - 1 : idx;
  const exact = BET_STEPS.indexOf(current);
  const base = exact === -1 ? i : exact;
  return BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, base + dir))];
}

export function formatMoney(n: number): string {
  const negative = n < 0;
  const abs = Math.abs(n);
  const [intPart, decPart] = abs.toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${decPart}`;
}
