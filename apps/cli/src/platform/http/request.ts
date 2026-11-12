import type { IncomingMessage } from "node:http";
import { HTTP_LIMITS } from "../../config/http.js";
import { AppError } from "../../shared/errors.js";
import { validateHttpContract, type ContractName } from "./contracts.js";

export async function readJsonBody(
  request: IncomingMessage,
  contract: ContractName,
): Promise<unknown> {
  const length = Number(request.headers["content-length"] ?? 0);
  if (length > HTTP_LIMITS.maxBodyBytes)
    throw new AppError("payload_too_large", "The request exceeds 1 MiB.");
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new AppError("invalid_json", "Use the application/json content type.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  const body = (async () => {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > HTTP_LIMITS.maxBodyBytes)
        throw new AppError("payload_too_large", "The request exceeds 1 MiB.");
      chunks.push(buffer);
    }
    const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    validateHttpContract(contract, raw);
    return raw;
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      body,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new AppError("busy", "The request body took too long to arrive."));
          request.destroy();
        }, HTTP_LIMITS.requestTimeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function revisionPrecondition(request: IncomingMessage): string | null {
  if (request.headers["if-none-match"] === "*" && request.headers["if-match"] === undefined)
    return null;
  const value = request.headers["if-match"];
  if (
    typeof value === "string" &&
    /^"[^"\\s]{1,128}"$/.test(value) &&
    request.headers["if-none-match"] === undefined
  )
    return value.slice(1, -1);
  throw new AppError(
    "precondition_required",
    "Read the current ETag and send If-Match, or use If-None-Match: * to create.",
  );
}

export function mutationId(request: IncomingMessage): string | undefined {
  const key = request.headers["idempotency-key"];
  if (key === undefined) return undefined;
  if (typeof key === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(key)) return key;
  throw new AppError(
    "usage_error",
    "Idempotency-Key must contain 1–128 letters, digits, dots, underscores, or hyphens.",
  );
}
