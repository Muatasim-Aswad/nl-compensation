import { ContractValidationError, type ValidationIssue } from "@nl-compensation/core";

export type ErrorCode =
  | "validation_error"
  | "invalid_json"
  | "invalid_path"
  | "invalid_session_token"
  | "untrusted_host"
  | "untrusted_origin"
  | "method_not_allowed"
  | "not_found"
  | "conflict"
  | "precondition_required"
  | "payload_too_large"
  | "rate_limited"
  | "busy"
  | "storage_error"
  | "internal_error"
  | "usage_error"
  | "tracker_error";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: { readonly currentRevision?: string | null },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

export interface PublicError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly status: number;
  readonly details?: AppError["details"];
  readonly issues?: readonly ValidationIssue[];
}

const statuses: Record<ErrorCode, number> = {
  validation_error: 422,
  invalid_json: 400,
  invalid_path: 400,
  invalid_session_token: 403,
  untrusted_host: 400,
  untrusted_origin: 403,
  method_not_allowed: 405,
  not_found: 404,
  conflict: 409,
  precondition_required: 428,
  payload_too_large: 413,
  rate_limited: 429,
  busy: 503,
  storage_error: 500,
  internal_error: 500,
  usage_error: 400,
  tracker_error: 502,
};

export function publicError(error: unknown): PublicError {
  if (error instanceof ContractValidationError) {
    return {
      code: "validation_error",
      message: "Check the supplied values.",
      status: 422,
      issues: error.issues,
    };
  }
  if (error instanceof SyntaxError) {
    return { code: "invalid_json", message: "The request must contain valid JSON.", status: 400 };
  }
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      status: statuses[error.code],
      details: error.details,
    };
  }
  return { code: "internal_error", message: "The operation could not be completed.", status: 500 };
}

export function systemErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}
