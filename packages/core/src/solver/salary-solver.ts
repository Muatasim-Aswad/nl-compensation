import type { PayExpression, PayPeriod, WeeklyHours } from "../model/compensation.js";
import type { EvidenceStatus, FactOrigin } from "../model/provenance.js";
import type { Money } from "../model/scalars.js";
import type { Value } from "../model/value.js";
import { unknown } from "../model/value.js";
import {
  annualizePayExpressionAtHours,
  annualRoundingToleranceCents,
  deriveSalaryRepresentations,
  scaleAnnualBetweenHours,
  type DerivedSalaryRepresentation,
} from "../normalization/pay.js";
import { moneyValueBounds } from "../normalization/value-math.js";

export const SALARY_SOURCE_PRECEDENCE: Readonly<Record<FactOrigin, number>> = {
  contract: 700,
  offer: 600,
  recruiter: 500,
  user: 400,
  listing: 300,
  government_rule: 200,
  derived: 100,
};

const EVIDENCE_PRECEDENCE: Readonly<Record<EvidenceStatus, number>> = {
  explicit: 30,
  inferred: 20,
  assumed: 10,
};

export interface SalaryConstraintDiagnostic {
  readonly code: "locked_salary_conflict" | "salary_source_disagreement" | "salary_unavailable";
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly expressionIndexes: readonly number[];
  readonly differenceCents?: number;
  readonly toleranceCents?: number;
}

export interface SalaryConstraintCandidate {
  readonly expressionIndex: number;
  readonly period: PayPeriod;
  readonly annualAmount: Value<Money>;
  readonly locked: boolean;
  readonly source: FactOrigin;
  readonly annualRoundingToleranceCents: number;
}

export interface SalarySolution {
  readonly annualBase: Value<Money>;
  readonly employerFullTimeAnnualBase: Value<Money>;
  readonly selectedExpressionIndex?: number;
  readonly candidates: readonly SalaryConstraintCandidate[];
  readonly representations: readonly DerivedSalaryRepresentation[];
  readonly employerFullTimeRepresentations: readonly DerivedSalaryRepresentation[];
  readonly diagnostics: readonly SalaryConstraintDiagnostic[];
}

function candidateScore(expression: PayExpression): number {
  return (
    SALARY_SOURCE_PRECEDENCE[expression.amount.origin] +
    EVIDENCE_PRECEDENCE[expression.amount.evidenceStatus] +
    (expression.amount.validationState === "valid" ? 2 : 0)
  );
}

function disagreement(
  left: SalaryConstraintCandidate,
  right: SalaryConstraintCandidate,
): { differenceCents: number; toleranceCents: number } | undefined {
  const leftBounds = moneyValueBounds(left.annualAmount);
  const rightBounds = moneyValueBounds(right.annualAmount);
  if (leftBounds === undefined || rightBounds === undefined) return undefined;
  const toleranceCents = left.annualRoundingToleranceCents + right.annualRoundingToleranceCents;
  const separation = Math.max(0, leftBounds[0] - rightBounds[1], rightBounds[0] - leftBounds[1]);
  return separation > toleranceCents ? { differenceCents: separation, toleranceCents } : undefined;
}

/**
 * Locked expressions are hard constraints. Unlocked conflicts are retained as
 * diagnostics while the highest-precedence source supplies the working value.
 * Tolerance is the combined half-cent annualization error for each quoted unit.
 */
export function solveSalaryExpressions(
  expressions: readonly PayExpression[],
  actualWeeklyHours: import("../model/provenance.js").Fact<WeeklyHours>,
  employerFullTimeWeeklyHours: import("../model/provenance.js").Fact<WeeklyHours> = actualWeeklyHours,
): SalarySolution {
  const candidates = expressions.map<SalaryConstraintCandidate>((expression, expressionIndex) => ({
    expressionIndex,
    period: expression.period,
    annualAmount: annualizePayExpressionAtHours(expression, actualWeeklyHours),
    locked: expression.amount.locked,
    source: expression.amount.origin,
    annualRoundingToleranceCents: annualRoundingToleranceCents(expression),
  }));
  const usable = candidates.filter((candidate) => candidate.annualAmount.kind !== "unknown");
  const locked = usable.filter((candidate) => candidate.locked);
  const pool = locked.length > 0 ? locked : usable;
  const selected = [...pool].sort((left, right) => {
    const scoreDifference =
      candidateScore(expressions[right.expressionIndex]!) -
      candidateScore(expressions[left.expressionIndex]!);
    return scoreDifference === 0 ? left.expressionIndex - right.expressionIndex : scoreDifference;
  })[0];

  if (selected === undefined) {
    const diagnostic: SalaryConstraintDiagnostic = {
      code: "salary_unavailable",
      severity: "error",
      message: "No supplied salary expression can be annualized.",
      expressionIndexes: expressions.map((_, index) => index),
    };
    return {
      annualBase: unknown("not_provided"),
      employerFullTimeAnnualBase: unknown("not_provided"),
      candidates,
      representations: [],
      employerFullTimeRepresentations: [],
      diagnostics: [diagnostic],
    };
  }

  const diagnostics: SalaryConstraintDiagnostic[] = [];
  for (const candidate of usable) {
    if (candidate.expressionIndex === selected.expressionIndex) continue;
    const conflict = disagreement(selected, candidate);
    if (conflict === undefined) continue;
    const hardConflict = selected.locked && candidate.locked;
    diagnostics.push({
      code: hardConflict ? "locked_salary_conflict" : "salary_source_disagreement",
      severity: hardConflict ? "error" : "warning",
      message: hardConflict
        ? `Locked salary expressions ${selected.expressionIndex} and ${candidate.expressionIndex} disagree beyond their annual rounding tolerance.`
        : `Salary expression ${candidate.expressionIndex} disagrees with higher-precedence expression ${selected.expressionIndex}.`,
      expressionIndexes: [selected.expressionIndex, candidate.expressionIndex],
      ...conflict,
    });
  }

  const hasLockedConflict = diagnostics.some(
    (diagnostic) => diagnostic.code === "locked_salary_conflict",
  );
  const annualBase = hasLockedConflict ? unknown("not_known") : selected.annualAmount;
  const employerFullTimeAnnualBase = scaleAnnualBetweenHours(
    annualBase,
    actualWeeklyHours,
    employerFullTimeWeeklyHours,
  );
  return {
    annualBase,
    employerFullTimeAnnualBase,
    selectedExpressionIndex: selected.expressionIndex,
    candidates,
    representations:
      annualBase.kind === "unknown"
        ? []
        : deriveSalaryRepresentations(annualBase, actualWeeklyHours),
    employerFullTimeRepresentations:
      employerFullTimeAnnualBase.kind === "unknown"
        ? []
        : deriveSalaryRepresentations(employerFullTimeAnnualBase, employerFullTimeWeeklyHours),
    diagnostics,
  };
}
