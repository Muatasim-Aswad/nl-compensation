import type { Money, Rational, ScaledPercentage } from "../model/scalars.js";
import { eur, rational } from "../model/scalars.js";
import type { UnknownReason, Value } from "../model/value.js";
import { exact, range, unknown } from "../model/value.js";

const ONE_MILLION = 1_000_000;

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

function safeInteger(value: bigint, operation: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${operation} exceeds the safe integer range`);
  }
  return result;
}

function divideHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError("normalization denominators must be positive");
  }
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  return sign * (quotient + (remainder * 2n >= denominator ? 1n : 0n));
}

export function normalizeRational(value: Rational): Rational {
  if (value.denominator <= 0) {
    throw new RangeError("normalization denominators must be positive");
  }
  const divisor = greatestCommonDivisor(BigInt(value.numerator), BigInt(value.denominator));
  return rational(
    safeInteger(BigInt(value.numerator) / divisor, "rational numerator"),
    safeInteger(BigInt(value.denominator) / divisor, "rational denominator"),
  );
}

export function multiplyRationals(left: Rational, right: Rational): Rational {
  return normalizeRational(
    rational(left.numerator * right.numerator, left.denominator * right.denominator),
  );
}

export function divideRationals(left: Rational, right: Rational): Rational {
  if (right.numerator === 0) {
    throw new RangeError("cannot divide by zero");
  }
  const sign = right.numerator < 0 ? -1 : 1;
  return normalizeRational(
    rational(
      left.numerator * right.denominator * sign,
      left.denominator * Math.abs(right.numerator),
    ),
  );
}

export function ratioFromPercentage(value: ScaledPercentage): Rational {
  return normalizeRational(rational(value.partsPerMillion, ONE_MILLION));
}

export function addPercentages(left: ScaledPercentage, right: ScaledPercentage): ScaledPercentage {
  return { partsPerMillion: left.partsPerMillion + right.partsPerMillion };
}

export function multiplyMoneyByRational(amount: Money, factor: Rational): Money {
  const result = divideHalfAwayFromZero(
    BigInt(amount.amountCents) * BigInt(factor.numerator),
    BigInt(factor.denominator),
  );
  return eur(safeInteger(result, "money multiplication"));
}

export function divideMoneyByRational(amount: Money, divisor: Rational): Money {
  return multiplyMoneyByRational(amount, divideRationals(rational(1, 1), divisor));
}

export function addMoney(left: Money, right: Money): Money {
  const result = left.amountCents + right.amountCents;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("money addition exceeds the safe integer range");
  }
  return eur(result);
}

export function subtractMoney(left: Money, right: Money): Money {
  return addMoney(left, eur(-right.amountCents));
}

function correlationId(operation: string, values: readonly Value<unknown>[]): string {
  const ids = values
    .filter((value): value is Extract<Value<unknown>, { kind: "range" }> => value.kind === "range")
    .map((value) => value.correlationId);
  const uniqueIds = [...new Set(ids)].sort();
  return uniqueIds.length === 1 ? uniqueIds[0]! : `${operation}(${uniqueIds.join("+")})`;
}

function unknownReason(values: readonly Value<unknown>[]): UnknownReason {
  return values.find((value) => value.kind === "unknown")?.reason ?? "not_known";
}

export function addMoneyValues(values: readonly Value<Money>[]): Value<Money> {
  if (values.length === 0) return exact(eur(0));
  if (values.some((value) => value.kind === "unknown")) return unknown(unknownReason(values));

  let minimum = eur(0);
  let maximum = eur(0);
  for (const value of values) {
    if (value.kind === "unknown") return value;
    minimum = addMoney(minimum, value.kind === "exact" ? value.value : value.min);
    maximum = addMoney(maximum, value.kind === "exact" ? value.value : value.max);
  }
  return values.every((value) => value.kind === "exact")
    ? exact(minimum)
    : range(minimum, maximum, correlationId("sum", values));
}

export function subtractMoneyValues(left: Value<Money>, right: Value<Money>): Value<Money> {
  if (left.kind === "unknown" || right.kind === "unknown") {
    return unknown(unknownReason([left, right]));
  }
  const leftMin = left.kind === "exact" ? left.value : left.min;
  const leftMax = left.kind === "exact" ? left.value : left.max;
  const rightMin = right.kind === "exact" ? right.value : right.min;
  const rightMax = right.kind === "exact" ? right.value : right.max;
  if (left.kind === "exact" && right.kind === "exact") {
    return exact(subtractMoney(left.value, right.value));
  }
  return range(
    subtractMoney(leftMin, rightMax),
    subtractMoney(leftMax, rightMin),
    correlationId("difference", [left, right]),
  );
}

export function multiplyMoneyValue(amount: Value<Money>, factor: Rational): Value<Money> {
  if (amount.kind === "unknown") return amount;
  if (amount.kind === "exact") return exact(multiplyMoneyByRational(amount.value, factor));
  const first = multiplyMoneyByRational(amount.min, factor);
  const second = multiplyMoneyByRational(amount.max, factor);
  return range(
    first.amountCents <= second.amountCents ? first : second,
    first.amountCents <= second.amountCents ? second : first,
    amount.correlationId,
  );
}

export function multiplyMoneyByRationalValue(
  amount: Value<Money>,
  factor: Value<Rational>,
): Value<Money> {
  if (amount.kind === "unknown" || factor.kind === "unknown") {
    return unknown(unknownReason([amount, factor]));
  }
  const amounts = amount.kind === "exact" ? [amount.value] : [amount.min, amount.max];
  const factors = factor.kind === "exact" ? [factor.value] : [factor.min, factor.max];
  const candidates = amounts.flatMap((candidateAmount) =>
    factors.map((candidateFactor) => multiplyMoneyByRational(candidateAmount, candidateFactor)),
  );
  const sorted = candidates.toSorted((left, right) => left.amountCents - right.amountCents);
  if (amount.kind === "exact" && factor.kind === "exact") return exact(sorted[0]!);
  return range(sorted[0]!, sorted.at(-1)!, correlationId("rational-product", [amount, factor]));
}

export function multiplyMoneyByPercentageValue(
  amount: Value<Money>,
  rate: Value<ScaledPercentage>,
): Value<Money> {
  if (amount.kind === "unknown" || rate.kind === "unknown") {
    return unknown(unknownReason([amount, rate]));
  }
  const amounts = amount.kind === "exact" ? [amount.value] : [amount.min, amount.max];
  const rates = rate.kind === "exact" ? [rate.value] : [rate.min, rate.max];
  const candidates = amounts.flatMap((candidateAmount) =>
    rates.map((candidateRate) =>
      multiplyMoneyByRational(candidateAmount, ratioFromPercentage(candidateRate)),
    ),
  );
  const sorted = candidates.toSorted((left, right) => left.amountCents - right.amountCents);
  if (amount.kind === "exact" && rate.kind === "exact") return exact(sorted[0]!);
  return range(sorted[0]!, sorted.at(-1)!, correlationId("product", [amount, rate]));
}

export function divideMoneyValue(amount: Value<Money>, divisor: Value<Rational>): Value<Money> {
  if (amount.kind === "unknown" || divisor.kind === "unknown") {
    return unknown(unknownReason([amount, divisor]));
  }
  const amounts = amount.kind === "exact" ? [amount.value] : [amount.min, amount.max];
  const divisors = divisor.kind === "exact" ? [divisor.value] : [divisor.min, divisor.max];
  if (divisors.some((value) => value.numerator <= 0)) {
    throw new RangeError("normalization divisor must be positive");
  }
  const candidates = amounts.flatMap((candidateAmount) =>
    divisors.map((candidateDivisor) => divideMoneyByRational(candidateAmount, candidateDivisor)),
  );
  const sorted = candidates.toSorted((left, right) => left.amountCents - right.amountCents);
  if (amount.kind === "exact" && divisor.kind === "exact") return exact(sorted[0]!);
  return range(sorted[0]!, sorted.at(-1)!, correlationId("quotient", [amount, divisor]));
}

export function moneyValueBounds(value: Value<Money>): readonly [number, number] | undefined {
  if (value.kind === "unknown") return undefined;
  if (value.kind === "exact") return [value.value.amountCents, value.value.amountCents];
  return [value.min.amountCents, value.max.amountCents];
}
