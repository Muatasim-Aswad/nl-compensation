import { array, enumeration, record, string } from "./validation.js";
import { parseCompensationCase } from "./input.js";
import { parseCompensationReport } from "./report.js";
import { parseRuleSelection } from "./rules.js";
import type { CompensationCaseInput } from "../model/compensation.js";
import type { CompensationReport } from "../model/report.js";
import type { RuleDefinition, RuleSelection } from "../model/rules.js";
import type { ValidationIssue } from "./validation.js";
import type { CalculationRequestEnvelope, CalculationSuccessEnvelope } from "./wire.js";

export interface StoredCase {
  readonly schemaVersion: "1";
  readonly engineVersion: string;
  readonly selectedRules: RuleSelection;
  readonly calculatedAt: string;
  readonly sourceObservations: readonly string[];
  readonly input: CompensationCaseInput;
  readonly report: CompensationReport;
}

export interface HttpErrorResponse {
  readonly error: {
    readonly status: number;
    readonly code: string;
    readonly message: string;
    readonly request_id: string;
    readonly details?: { readonly currentRevision?: string | null };
    readonly issues?: readonly ValidationIssue[];
  };
}

export interface RulesList {
  readonly apiVersion: "v1";
  readonly selected: RuleSelection;
  readonly rules: readonly {
    readonly id: string;
    readonly contentHash: string;
    readonly effectiveFrom: string;
    readonly effectiveTo?: string;
    readonly verifiedAt: string;
  }[];
}

export interface CaseSaveRequest {
  readonly caseId: string;
  readonly input: CompensationCaseInput | CalculationRequestEnvelope;
}

export interface HttpContracts {
  readonly discovery: { readonly apiVersion: "v1"; readonly ok: true };
  readonly calculationRequest: CalculationRequestEnvelope;
  readonly calculation: CalculationSuccessEnvelope;
  readonly validationRequest: CompensationCaseInput;
  readonly validation: {
    readonly apiVersion: "v1";
    readonly ok: true;
    readonly input: CompensationCaseInput;
  };
  readonly profile: CompensationCaseInput;
  readonly profileWrite: { readonly ok: true; readonly profile: CompensationCaseInput };
  readonly cases: { readonly apiVersion: "v1"; readonly cases: readonly string[] };
  readonly case: StoredCase;
  readonly caseSaveRequest: CaseSaveRequest;
  readonly caseWrite: {
    readonly ok: true;
    readonly caseId: string;
    readonly report: CompensationReport;
  };
  readonly rules: RulesList;
  readonly rule: RuleDefinition<unknown>;
  readonly error: HttpErrorResponse;
}

export function parseStoredCase(raw: unknown): StoredCase {
  const value = record(raw, "storedCase");
  return {
    schemaVersion: enumeration(value.schemaVersion, ["1"] as const, "storedCase.schemaVersion"),
    engineVersion: string(value.engineVersion, "storedCase.engineVersion"),
    selectedRules: parseRuleSelection(value.selectedRules, "storedCase.selectedRules"),
    calculatedAt: string(value.calculatedAt, "storedCase.calculatedAt"),
    sourceObservations: array(
      value.sourceObservations,
      (item, path = "storedCase.sourceObservations") => string(item, path),
      "storedCase.sourceObservations",
    ),
    input: parseCompensationCase(value.input, "storedCase.input"),
    report: parseCompensationReport(value.report, "storedCase.report"),
  };
}
