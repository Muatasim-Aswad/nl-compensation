import type { PayExpression, PayPeriod, WeeklyHours } from "../model/compensation.js";
import type { Fact } from "../model/provenance.js";
import type { Money, Rational } from "../model/scalars.js";
import { rational } from "../model/scalars.js";
import type { Value } from "../model/value.js";
import { exact, range, unknown } from "../model/value.js";
import {
  divideMoneyValue,
  multiplyMoneyByRationalValue,
  multiplyMoneyValue,
  normalizeRational,
} from "./value-math.js";

export interface DerivedSalaryRepresentation {
  readonly period: PayPeriod;
  readonly amount: Value<Money>;
  readonly weeklyHours?: WeeklyHours;
  readonly annualRoundingToleranceCents: number;
}

export function weeklyHoursRational(hours: WeeklyHours): Rational {
  return hours.kind === "standard" ? rational(hours.hours, 1) : normalizeRational(hours.hours);
}

export function weeklyHoursValue(fact: Fact<WeeklyHours> | undefined): Value<Rational> {
  if (fact === undefined || fact.value.kind === "unknown") return unknown("not_provided");
  if (fact.value.kind === "exact") return exact(weeklyHoursRational(fact.value.value));
  return range(
    weeklyHoursRational(fact.value.min),
    weeklyHoursRational(fact.value.max),
    fact.value.correlationId,
  );
}

export function annualizationFactor(expression: PayExpression): Value<Rational> {
  switch (expression.period) {
    case "monthly":
      return exact(rational(12, 1));
    case "four_weekly":
      return exact(rational(13, 1));
    case "annual":
      return exact(rational(1, 1));
    case "hourly": {
      const hours = weeklyHoursValue(expression.weeklyHours);
      if (hours.kind === "unknown") return hours;
      if (hours.kind === "exact") {
        return exact(
          normalizeRational(rational(hours.value.numerator * 52, hours.value.denominator)),
        );
      }
      return range(
        normalizeRational(rational(hours.min.numerator * 52, hours.min.denominator)),
        normalizeRational(rational(hours.max.numerator * 52, hours.max.denominator)),
        hours.correlationId,
      );
    }
  }
}

export function annualizePayExpressionAtHours(
  expression: PayExpression,
  targetWeeklyHours: Fact<WeeklyHours>,
): Value<Money> {
  const annualAtQuotedBasis = annualizePayExpression(expression);
  if (expression.weeklyHours === undefined) return annualAtQuotedBasis;
  const quotedHours = weeklyHoursValue(expression.weeklyHours);
  const targetHours = weeklyHoursValue(targetWeeklyHours);
  return multiplyMoneyByRationalValue(
    divideMoneyValue(annualAtQuotedBasis, quotedHours),
    targetHours,
  );
}

export function annualizePayExpression(expression: PayExpression): Value<Money> {
  const factor = annualizationFactor(expression);
  if (expression.amount.value.kind === "unknown") return expression.amount.value;
  if (factor.kind === "unknown") return factor;
  if (factor.kind === "exact") return multiplyMoneyValue(expression.amount.value, factor.value);

  const low = multiplyMoneyValue(expression.amount.value, factor.min);
  const high = multiplyMoneyValue(expression.amount.value, factor.max);
  if (low.kind === "unknown" || high.kind === "unknown") return unknown("not_known");
  const lowMin = low.kind === "exact" ? low.value : low.min;
  const lowMax = low.kind === "exact" ? low.value : low.max;
  const highMin = high.kind === "exact" ? high.value : high.min;
  const highMax = high.kind === "exact" ? high.value : high.max;
  const candidates = [lowMin, lowMax, highMin, highMax].toSorted(
    (left, right) => left.amountCents - right.amountCents,
  );
  return range(candidates[0]!, candidates.at(-1)!, factor.correlationId);
}

export function annualRoundingToleranceCents(expression: PayExpression): number {
  const factor = annualizationFactor(expression);
  if (factor.kind === "unknown") return 0;
  const maximum = factor.kind === "exact" ? factor.value : factor.max;
  return Math.ceil(Math.abs(maximum.numerator / maximum.denominator) / 2);
}

function divideAnnual(annual: Value<Money>, factor: Rational): Value<Money> {
  return divideMoneyValue(annual, exact(factor));
}

export function deriveSalaryRepresentations(
  annual: Value<Money>,
  actualWeeklyHours: Fact<WeeklyHours>,
): readonly DerivedSalaryRepresentation[] {
  const representations: DerivedSalaryRepresentation[] = [
    {
      period: "annual",
      amount: annual,
      annualRoundingToleranceCents: 0,
    },
    {
      period: "monthly",
      amount: divideAnnual(annual, rational(12, 1)),
      annualRoundingToleranceCents: 6,
    },
    {
      period: "four_weekly",
      amount: divideAnnual(annual, rational(13, 1)),
      annualRoundingToleranceCents: 7,
    },
  ];

  if (actualWeeklyHours.value.kind === "exact") {
    const weeklyHours = actualWeeklyHours.value.value;
    const annualFactor = normalizeRational(
      rational(
        weeklyHoursRational(weeklyHours).numerator * 52,
        weeklyHoursRational(weeklyHours).denominator,
      ),
    );
    representations.push({
      period: "hourly",
      amount: divideAnnual(annual, annualFactor),
      weeklyHours,
      annualRoundingToleranceCents: Math.ceil(
        Math.abs(annualFactor.numerator / annualFactor.denominator) / 2,
      ),
    });
  }

  return representations;
}

export function scaleAnnualBetweenHours(
  annual: Value<Money>,
  sourceWeeklyHours: Fact<WeeklyHours>,
  targetWeeklyHours: Fact<WeeklyHours>,
): Value<Money> {
  return multiplyMoneyByRationalValue(
    divideMoneyValue(annual, weeklyHoursValue(sourceWeeklyHours)),
    weeklyHoursValue(targetWeeklyHours),
  );
}
