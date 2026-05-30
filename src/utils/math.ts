import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function parseAmount(input: string | number): Decimal {
  const d = new Decimal(input);
  if (!d.isFinite() || d.isNegative()) {
    throw new Error('Amount must be a positive number');
  }
  return d.toDecimalPlaces(2);
}

export function formatRC(amount: Decimal | number): string {
  const d = amount instanceof Decimal ? amount : new Decimal(amount);
  return `${d.toFixed(2)} RC`;
}

export function assertPositive(amount: Decimal): void {
  if (!amount.gt(0)) {
    throw new Error('Amount must be greater than zero');
  }
}

export function toDbString(amount: Decimal): string {
  return amount.toFixed(2);
}

export function fromDbString(value: string): Decimal {
  return new Decimal(value);
}
