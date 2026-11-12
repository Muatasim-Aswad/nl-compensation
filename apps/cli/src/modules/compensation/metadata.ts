import { type CompensationReport } from "@nl-compensation/core";
import { type RuleOutcome } from "@nl-compensation/rules-nl";

export function addOutcomeMetadata<T>(
  target: {
    assumptions: CompensationReport["assumptions"][number][];
    limitations: CompensationReport["limitations"][number][];
    trace: CompensationReport["derivationTrace"][number][];
  },
  outcome: RuleOutcome<T>,
): void {
  target.assumptions.push(...outcome.assumptions);
  target.limitations.push(...outcome.limitations);
  target.trace.push(...outcome.trace);
}

export function appendUnique<T>(target: T[], values: readonly T[]): void {
  const seen = new Set(target.map((item) => JSON.stringify(item)));
  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(value);
  }
}
