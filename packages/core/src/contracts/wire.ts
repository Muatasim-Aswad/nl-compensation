import type { CompensationCaseInput } from "../model/compensation.js";
import type { CompensationReport } from "../model/report.js";
import type { RuleSelection } from "../model/rules.js";
import { parseCompensationCase } from "./input.js";
import { parseCompensationReport } from "./report.js";
import { parseRuleSelection } from "./rules.js";
import { ContractValidationError, record, string } from "./validation.js";

export const CALCULATION_API_VERSION = "v1" as const;

export interface CalculationContext {
  readonly engineVersion: string;
  readonly calculatedAt: string;
  readonly rules: RuleSelection;
}

export interface CalculationRequestEnvelope {
  readonly apiVersion: typeof CALCULATION_API_VERSION;
  readonly requestId: string;
  readonly context: CalculationContext;
  readonly input: CompensationCaseInput;
}

export interface CalculationSuccessEnvelope {
  readonly apiVersion: typeof CALCULATION_API_VERSION;
  readonly requestId: string;
  readonly ok: true;
  readonly report: CompensationReport;
}

export interface CalculationFailureEnvelope {
  readonly apiVersion: typeof CALCULATION_API_VERSION;
  readonly requestId: string;
  readonly ok: false;
  readonly errors: readonly {
    readonly code: string;
    readonly path?: string;
    readonly message: string;
  }[];
}

export type CalculationResponseEnvelope = CalculationSuccessEnvelope | CalculationFailureEnvelope;

export function parseCalculationRequest(input: unknown): CalculationRequestEnvelope {
  const value = record(input, "request");
  if (value.apiVersion !== CALCULATION_API_VERSION) {
    throw new ContractValidationError([
      { path: "request.apiVersion", code: "version", message: "expected API version v1" },
    ]);
  }
  const context = record(value.context, "request.context");

  return {
    apiVersion: CALCULATION_API_VERSION,
    requestId: string(value.requestId, "request.requestId"),
    context: {
      engineVersion: string(context.engineVersion, "request.context.engineVersion"),
      calculatedAt: string(context.calculatedAt, "request.context.calculatedAt"),
      rules: parseRuleSelection(context.rules, "request.context.rules"),
    },
    input: parseCompensationCase(value.input, "request.input"),
  };
}

export function parseCalculationResponse(input: unknown): CalculationResponseEnvelope {
  const value = record(input, "response");
  if (value.apiVersion !== CALCULATION_API_VERSION) {
    throw new ContractValidationError([
      { path: "response.apiVersion", code: "version", message: "expected API version v1" },
    ]);
  }
  const requestId = string(value.requestId, "response.requestId");
  if (value.ok === true) {
    return {
      apiVersion: CALCULATION_API_VERSION,
      requestId,
      ok: true,
      report: parseCompensationReport(value.report, "response.report"),
    };
  }
  if (value.ok !== false || !Array.isArray(value.errors)) {
    throw new ContractValidationError([
      { path: "response.ok", code: "type", message: "expected boolean ok and matching payload" },
    ]);
  }
  return {
    apiVersion: CALCULATION_API_VERSION,
    requestId,
    ok: false,
    errors: value.errors.map((item, index) => {
      const error = record(item, `response.errors[${index}]`);
      return {
        code: string(error.code, `response.errors[${index}].code`),
        path:
          error.path === undefined
            ? undefined
            : string(error.path, `response.errors[${index}].path`),
        message: string(error.message, `response.errors[${index}].message`),
      };
    }),
  };
}
