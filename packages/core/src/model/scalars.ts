export interface Money {
  readonly amountCents: number;
  readonly currency: "EUR";
}

export interface Rational {
  readonly numerator: number;
  readonly denominator: number;
}

export interface ScaledPercentage {
  /** One whole percent equals 10,000 parts per million. */
  readonly partsPerMillion: number;
}

export type RoundingMode = "half_away_from_zero" | "floor" | "ceiling" | "truncate";

export interface RoundingPolicy {
  readonly unit: "cent" | "euro";
  readonly mode: RoundingMode;
}

export const eur = (amountCents: number): Money => ({ amountCents, currency: "EUR" });

export const rational = (numerator: number, denominator: number): Rational => ({
  numerator,
  denominator,
});

export const percent = (partsPerMillion: number): ScaledPercentage => ({
  partsPerMillion,
});

export function roundRationalMoney(
  amount: Money,
  multiplier: Rational,
  policy: RoundingPolicy,
): Money {
  const unitCents = policy.unit === "euro" ? 100 : 1;
  const unroundedUnits =
    (amount.amountCents * multiplier.numerator) / multiplier.denominator / unitCents;
  let roundedUnits: number;

  switch (policy.mode) {
    case "half_away_from_zero":
      roundedUnits =
        unroundedUnits < 0 ? -Math.round(Math.abs(unroundedUnits)) : Math.round(unroundedUnits);
      break;
    case "floor":
      roundedUnits = Math.floor(unroundedUnits);
      break;
    case "ceiling":
      roundedUnits = Math.ceil(unroundedUnits);
      break;
    case "truncate":
      roundedUnits = Math.trunc(unroundedUnits);
      break;
  }

  return eur(roundedUnits * unitCents);
}
