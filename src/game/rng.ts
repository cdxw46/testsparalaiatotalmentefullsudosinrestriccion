/**
 * Generador xoshiro128** con semilla, para que las simulaciones y los tests
 * sean reproducibles. El juego real se siembra con `crypto.getRandomValues`.
 */
export class Rng {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  constructor(seed?: number) {
    this.seed(seed ?? Rng.entropySeed());
  }

  static entropySeed(): number {
    const g = globalThis as { crypto?: Crypto };
    if (g.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      g.crypto.getRandomValues(buf);
      return buf[0]! >>> 0;
    }
    return (Math.random() * 0x100000000) >>> 0;
  }

  seed(seed: number): void {
    // splitmix32 para expandir una semilla de 32 bits a los cuatro estados.
    let x = seed >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = (Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0) >>> 0;
      z = (Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0) >>> 0;
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
    for (let i = 0; i < 16; i++) this.nextUint32();
  }

  nextUint32(): number {
    const t = Math.imul(this.s1, 5);
    const result = (((t << 7) | (t >>> 25)) >>> 0) * 9;
    const r = result >>> 0;
    const t2 = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t2) >>> 0;
    this.s3 = ((this.s3 << 11) | (this.s3 >>> 21)) >>> 0;
    return r;
  }

  /** Flotante en [0, 1). */
  next(): number {
    return this.nextUint32() / 0x100000000;
  }

  /** Entero en [0, max). */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Entero en [min, max] inclusive. */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }
}

/** Selector alias para muestrear símbolos con pesos en tiempo constante. */
export class WeightedPicker<T> {
  private readonly items: T[];
  private readonly prob: Float64Array;
  private readonly alias: Int32Array;

  constructor(weights: ReadonlyArray<readonly [T, number]>) {
    const entries = weights.filter(([, w]) => w > 0);
    if (!entries.length) throw new Error('WeightedPicker necesita al menos un peso positivo');
    const n = entries.length;
    this.items = entries.map(([item]) => item);
    const total = entries.reduce((acc, [, w]) => acc + w, 0);
    const scaled = entries.map(([, w]) => (w * n) / total);
    this.prob = new Float64Array(n);
    this.alias = new Int32Array(n);

    const small: number[] = [];
    const large: number[] = [];
    for (let i = 0; i < n; i++) (scaled[i]! < 1 ? small : large).push(i);

    while (small.length && large.length) {
      const s = small.pop()!;
      const l = large.pop()!;
      this.prob[s] = scaled[s]!;
      this.alias[s] = l;
      scaled[l] = scaled[l]! + scaled[s]! - 1;
      (scaled[l]! < 1 ? small : large).push(l);
    }
    for (const i of large) this.prob[i] = 1;
    for (const i of small) this.prob[i] = 1;
  }

  pick(rng: Rng): T {
    const i = rng.int(this.items.length);
    return rng.next() < this.prob[i]! ? this.items[i]! : this.items[this.alias[i]!]!;
  }
}
