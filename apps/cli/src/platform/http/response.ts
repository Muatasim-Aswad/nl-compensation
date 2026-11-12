import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError, publicError } from "../../shared/errors.js";
import { validateHttpContract, type ContractName } from "./contracts.js";

function hostName(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  if (header.startsWith("[")) return header.slice(0, header.indexOf("]") + 1).toLowerCase();
  return header.split(":", 1)[0]?.toLowerCase();
}

export function trustedHost(request: IncomingMessage): boolean {
  return ["127.0.0.1", "localhost", "[::1]"].includes(hostName(request.headers.host) ?? "");
}

export function trustedOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" && url.host.toLowerCase() === request.headers.host?.toLowerCase()
    );
  } catch {
    return false;
  }
}

export function securityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
}

export function routePath(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  } catch {
    throw new AppError("invalid_path", "Request path is invalid.");
  }
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  contract: ContractName,
): void {
  validateHttpContract(contract, body, true);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  securityHeaders(response);
  response.setHeader("Content-Security-Policy", "default-src 'none'");
  response.end(`${JSON.stringify(body)}\n`);
}

export function sendError(response: ServerResponse, error: unknown, requestId: string): number {
  const { status, ...safe } = publicError(error);
  if (!response.headersSent && !response.destroyed) {
    if (status === 429 || status === 503) response.setHeader("Retry-After", "1");
    sendJson(response, status, { error: { status, request_id: requestId, ...safe } }, "error");
  }
  return status;
}
