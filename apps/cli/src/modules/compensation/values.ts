import {
  eur,
  unknown,
  type Fact,
  type Money,
  type Rational,
  type Value,
} from "@nl-compensation/core";

export const noMoney = () => unknown("not_provided") as Value<Money>;

export function exactFact<T>(fact: Fact<T> | undefined): T | undefined {
  return fact?.value.kind === "exact" ? fact.value.value : undefined;
}

export function exactMoney(value: Value<Money>): Money | undefined {
  return value.kind === "exact" ? value.value : undefined;
}

export function isExplicitZeroMoney(fact: Fact<Money> | undefined): boolean {
  return fact === undefined || (fact.value.kind === "exact" && fact.value.value.amountCents === 0);
}

export function rationalNumber(value: Rational | undefined): number | undefined {
  if (value === undefined || value.denominator === 0) return undefined;
  return value.numerator / value.denominator;
}

export function annualFactMoney(
  fact: Fact<Money> | undefined,
  period: "monthly" | "four_weekly" | "hourly" | "annual" | undefined,
): Money | undefined {
  const money = exactFact(fact);
  if (money === undefined) return undefined;
  if (period === "monthly") return eur(money.amountCents * 12);
  if (period === "four_weekly") return eur(money.amountCents * 13);
  if (period === "annual" || period === undefined) return money;
  return undefined;
}

export function exactBoolean(fact: Fact<boolean> | undefined): boolean | undefined {
  return exactFact(fact);
}

export function moneyTimes(money: Money, factor: number): Money {
  return eur(Math.round(money.amountCents * factor));
}
