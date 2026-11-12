/**
 * Exact rational arithmetic over bigint.
 *
 * Dutch fiscal and allowance formulas mix euro amounts with percentages that
 * are not representable in binary floating point (13,73%, 6,398%, 22%/12).
 * Every intermediate value therefore stays an exact fraction until one
 * explicitly chosen rounding step converts it to integer cents or euros.
 */
export interface Fraction {
  readonly n: bigint;
  readonly d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function frac(n: bigint, d: bigint = 1n): Fraction {
  if (d === 0n) {
    throw new RangeError("fraction denominator must not be zero");
  }
  const sign = d < 0n ? -1n : 1n;
  const sn = n * sign;
  const sd = d * sign;
  const g = gcd(sn, sd);
  return g === 0n ? { n: 0n, d: 1n } : { n: sn / g, d: sd / g };
}

export const ZERO: Fraction = { n: 0n, d: 1n };

export const fromInt = (value: number | bigint): Fraction => frac(BigInt(value));

export const add = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.d + b.n * a.d, a.d * b.d);

export const sub = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.d - b.n * a.d, a.d * b.d);

export const mul = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.n, a.d * b.d);

export const div = (a: Fraction, b: Fraction): Fraction => {
  if (b.n === 0n) {
    throw new RangeError("cannot divide by the zero fraction");
  }
  return frac(a.n * b.d, a.d * b.n);
};

export function compare(a: Fraction, b: Fraction): number {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left === right ? 0 : left < right ? -1 : 1;
}

export const isNegative = (value: Fraction): boolean => value.n < 0n;

export const max = (a: Fraction, b: Fraction): Fraction => (compare(a, b) >= 0 ? a : b);

export const min = (a: Fraction, b: Fraction): Fraction => (compare(a, b) <= 0 ? a : b);

export const clampAtZero = (value: Fraction): Fraction => (isNegative(value) ? ZERO : value);

/**
 * One whole percent is 10,000 parts per million, matching the core
 * `ScaledPercentage` contract.
 */
export const PERCENT_SCALE = 1_000_000n;

export const percentageOf = (value: Fraction, partsPerMillion: number): Fraction =>
  mul(value, frac(BigInt(partsPerMillion), PERCENT_SCALE));

/** Largest integer not greater than the fraction. */
export function floorToInteger(value: Fraction): bigint {
  const q = value.n / value.d;
  return value.n < 0n && q * value.d !== value.n ? q - 1n : q;
}

/** Nearest integer, ties away from zero. */
export function roundHalfAwayFromZero(value: Fraction): bigint {
  const doubled = value.n < 0n ? value.n * -2n : value.n * 2n;
  const magnitude = (doubled + value.d) / (2n * value.d);
  return value.n < 0n ? -magnitude : magnitude;
}

/** Truncates toward zero. */
export function truncateToInteger(value: Fraction): bigint {
  return value.n / value.d;
}

export const CENTS_PER_EURO = 100n;

export const eurosToCents = (euros: number | bigint): bigint => BigInt(euros) * CENTS_PER_EURO;

/** Converts a fraction of cents to a safe-integer cent amount. */
export function toSafeCents(cents: bigint): number {
  const value = Number(cents);
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`cent amount ${cents.toString()} exceeds the safe integer range`);
  }
  return value;
}
