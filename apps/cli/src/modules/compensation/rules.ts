import { ENGINE_VERSION } from "@nl-compensation/core";
import {
  CALCULATION_API_VERSION,
  parseCalculationRequest,
  parseCompensationCase,
  type CalculationRequestEnvelope,
  type CompensationCaseInput,
  type RuleSelection,
} from "@nl-compensation/core";
import {
  BUNDLE_2026,
  BUNDLE_2026_ID,
  findRuleById,
  ruleSelectionFor,
} from "@nl-compensation/rules-nl";
import { AppError } from "../../shared/errors.js";

export { ENGINE_VERSION } from "@nl-compensation/core";

export const DEFAULT_RULE_BUNDLE = BUNDLE_2026_ID;

export function sameRules(left: RuleSelection, right: RuleSelection): boolean {
  return (
    left.bundleId === right.bundleId &&
    left.bundleContentHash === right.bundleContentHash &&
    JSON.stringify(left.ruleIds) === JSON.stringify(right.ruleIds) &&
    JSON.stringify(left.ruleContentHashes) === JSON.stringify(right.ruleContentHashes)
  );
}

export function selectedRules(): RuleSelection {
  return ruleSelectionFor(BUNDLE_2026);
}

export function createCalculationRequest(
  input: CompensationCaseInput,
  options: { readonly requestId: string; readonly calculatedAt: string },
): CalculationRequestEnvelope {
  return {
    apiVersion: CALCULATION_API_VERSION,
    requestId: options.requestId,
    context: {
      engineVersion: ENGINE_VERSION,
      calculatedAt: options.calculatedAt,
      rules: selectedRules(),
    },
    input,
  };
}

export function requestFromUnknown(
  raw: unknown,
  options: { readonly requestId: string; readonly calculatedAt: string },
): CalculationRequestEnvelope {
  if (
    typeof raw === "object" &&
    raw !== null &&
    "apiVersion" in raw &&
    "context" in raw &&
    "input" in raw
  ) {
    return parseCalculationRequest(raw);
  }
  return createCalculationRequest(parseCompensationCase(raw), options);
}

export function listRules(): unknown {
  return {
    apiVersion: CALCULATION_API_VERSION,
    selected: selectedRules(),
    rules: selectedRules().ruleIds.map((id) => {
      const rule = findRuleById(id)!;
      return {
        id: rule.id,
        contentHash: rule.contentHash,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        verifiedAt: rule.verifiedAt,
      };
    }),
  };
}

export function showRule(id: string): unknown {
  const rule = findRuleById(id);
  if (rule === undefined) throw new AppError("not_found", "Unknown rule ID.");
  return rule;
}
