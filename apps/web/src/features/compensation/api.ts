import { ENGINE_VERSION } from "@nl-compensation/core";
import {
  CALCULATION_API_VERSION,
  parseCalculationResponse,
  type CalculationRequestEnvelope,
  type CompensationCaseInput,
  type CompensationReport,
} from "@nl-compensation/core";
import { BUNDLE_2026, ruleSelectionFor } from "@nl-compensation/rules-nl";
import { ApiError, responseError, writeToken } from "../../infra/http.js";
import { copy } from "./copy.js";

export function calculationRequest(
  input: CompensationCaseInput,
  calculatedAt: string,
  requestId: string,
): CalculationRequestEnvelope {
  return {
    apiVersion: CALCULATION_API_VERSION,
    requestId,
    context: { engineVersion: ENGINE_VERSION, calculatedAt, rules: ruleSelectionFor(BUNDLE_2026) },
    input,
  };
}

export async function calculateCase(
  input: CompensationCaseInput,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<CompensationReport> {
  const request = calculationRequest(input, new Date().toISOString(), crypto.randomUUID());
  const response = await fetcher("/api/v1/calculate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) throw await responseError(response);
  const envelope = parseCalculationResponse(await response.json());
  if (!envelope.ok) throw new ApiError("validation_error", copy.api.unsupportedRequest, 422);
  return envelope.report;
}

export async function readRevision(
  path: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await fetcher(path, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw await responseError(response);
  const revision = response.headers.get("etag");
  if (!revision) throw new ApiError("invalid_response", copy.api.missingRevision, 500);
  return revision;
}

async function save(
  path: string,
  method: "POST" | "PUT",
  input: CompensationCaseInput,
  revision: string | null,
  fetcher: typeof fetch,
  mutationId: string,
): Promise<string> {
  const token = writeToken();
  if (!token) throw new ApiError("invalid_session_token", copy.api.writeSessionUnavailable, 403);
  const response = await fetcher(path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-nl-compensation-token": token,
      ...(revision === null ? { "if-none-match": "*" } : { "if-match": revision }),
      "idempotency-key": mutationId,
    },
    body: JSON.stringify(method === "POST" ? { caseId: input.caseId, input } : input),
  });
  if (!response.ok) throw await responseError(response);
  const next = response.headers.get("etag");
  if (!next) throw new ApiError("invalid_response", copy.api.missingSavedRevision, 500);
  return next;
}

export const saveDefault = (
  input: CompensationCaseInput,
  revision: string | null,
  fetcher: typeof fetch = fetch,
  mutationId: string = crypto.randomUUID(),
) => save("/api/v1/profile", "PUT", input, revision, fetcher, mutationId);

export const saveCase = (
  input: CompensationCaseInput,
  revision: string | null,
  fetcher: typeof fetch = fetch,
  mutationId: string = crypto.randomUUID(),
) => {
  if (!input.caseId) throw new ApiError("validation_error", copy.api.caseIdRequired, 422);
  return save("/api/v1/cases", "POST", input, revision, fetcher, mutationId);
};
