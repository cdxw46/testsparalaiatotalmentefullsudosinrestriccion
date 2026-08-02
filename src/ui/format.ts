const money = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Importe con formato español y símbolo detrás, como en los casinos europeos. */
export function formatMoney(amount: number): string {
  return `${money.format(amount)} $`;
}

/** Número sin ceros innecesarios (para multiplicadores y apuestas). */
export function formatNumber(value: number): string {
  return compact.format(value);
}

export function formatMultiplier(value: number): string {
  return `x${compact.format(value)}`;
}
