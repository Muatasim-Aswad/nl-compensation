import type { Money, Precision, ReportLayer } from "@nl-compensation/core";
import { eur } from "@nl-compensation/core";
import type { Fraction } from "./rational.js";
import { toSafeCents } from "./rational.js";

/** A rule outcome that is either a supported value or a typed limitation. */
export interface RuleLimitation {
  readonly code: string;
  readonly layer: ReportLayer;
  readonly message: string;
  readonly affectedOutputs: readonly string[];
}

export interface RuleAssumption {
  readonly code: string;
  readonly message: string;
  readonly affectedPaths: readonly string[];
}

export interface RuleTraceStep {
  readonly id: string;
  readonly operation: string;
  readonly inputPaths: readonly string[];
  readonly outputPath: string;
  readonly ruleId: string;
  readonly rounding: string;
}

export interface RuleOutcome<T> {
  readonly precision: Precision;
  /** Present only when `precision` is `exact` or `estimated`. */
  readonly value?: T;
  readonly ruleIds: readonly string[];
  readonly missingInputs: readonly string[];
  readonly limitations: readonly RuleLimitation[];
  readonly assumptions: readonly RuleAssumption[];
  readonly trace: readonly RuleTraceStep[];
}

export interface OutcomeParts {
  readonly ruleIds: readonly string[];
  readonly missingInputs?: readonly string[];
  readonly limitations?: readonly RuleLimitation[];
  readonly assumptions?: readonly RuleAssumption[];
  readonly trace?: readonly RuleTraceStep[];
}

export function supported<T>(
  precision: Extract<Precision, "exact" | "estimated">,
  value: T,
  parts: OutcomeParts,
): RuleOutcome<T> {
  return {
    precision,
    value,
    ruleIds: parts.ruleIds,
    missingInputs: parts.missingInputs ?? [],
    limitations: parts.limitations ?? [],
    assumptions: parts.assumptions ?? [],
    trace: parts.trace ?? [],
  };
}

/**
 * An input combination the initial release deliberately does not calculate.
 * It never falls through to an ordinary-case formula.
 */
export function unsupported<T>(limitation: RuleLimitation, parts: OutcomeParts): RuleOutcome<T> {
  return {
    precision: "unsupported",
    ruleIds: parts.ruleIds,
    missingInputs: parts.missingInputs ?? [],
    limitations: [limitation, ...(parts.limitations ?? [])],
    assumptions: parts.assumptions ?? [],
    trace: parts.trace ?? [],
  };
}

/** A supported case whose required inputs are absent. */
export function unavailable<T>(
  missingInputs: readonly string[],
  parts: OutcomeParts,
): RuleOutcome<T> {
  return {
    precision: "unavailable",
    ruleIds: parts.ruleIds,
    missingInputs: [...missingInputs, ...(parts.missingInputs ?? [])],
    limitations: parts.limitations ?? [],
    assumptions: parts.assumptions ?? [],
    trace: parts.trace ?? [],
  };
}

export const centsToMoney = (cents: bigint): Money => eur(toSafeCents(cents));

export const fractionOfCentsToMoney = (
  cents: Fraction,
  round: (value: Fraction) => bigint,
): Money => centsToMoney(round(cents));
