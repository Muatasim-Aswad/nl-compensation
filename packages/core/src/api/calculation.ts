import type { CalculationContext, CalculationRequestEnvelope } from "../contracts/wire.js";
import { parseCalculationRequest } from "../contracts/wire.js";
import type { CompensationCaseInput } from "../model/compensation.js";
import type { CompensationReport } from "../model/report.js";

/**
 * Implementations must be referentially transparent: all rules, versions, and
 * timestamps are supplied in `context`; the function may not read ambient state.
 */
export type CalculateCompensation = (
  input: CompensationCaseInput,
  context: CalculationContext,
) => CompensationReport;

export function calculateFromEnvelope(
  rawRequest: unknown,
  calculate: CalculateCompensation,
): CompensationReport {
  const request: CalculationRequestEnvelope = parseCalculationRequest(rawRequest);
  return calculate(request.input, request.context);
}
