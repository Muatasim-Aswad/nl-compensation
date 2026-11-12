import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { HTTP_LIMITS } from "../../config/http.js";
import { AppError, publicError } from "../../shared/errors.js";
import { sendError, trustedHost, trustedOrigin } from "./response.js";

export type RequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
) => Promise<void>;
export interface RequestLog {
  readonly event: "http_request";
  readonly request_id: string;
  readonly status: number;
  readonly code?: string;
  readonly duration_ms: number;
}
export interface HttpServerOptions {
  readonly port: number;
  readonly handler: RequestHandler;
  readonly log?: (entry: RequestLog) => void;
  readonly limits?: {
    readonly maxConcurrent?: number;
    readonly requestsPerMinute?: number;
    readonly shutdownTimeoutMs?: number;
  };
}

export async function startHttpServer(
  options: HttpServerOptions,
): Promise<{ server: Server; port: number; close(): Promise<void> }> {
  const maxConcurrent = options.limits?.maxConcurrent ?? HTTP_LIMITS.maxConcurrent;
  const requestsPerMinute = options.limits?.requestsPerMinute ?? HTTP_LIMITS.requestsPerMinute;
  const shutdownTimeoutMs = options.limits?.shutdownTimeoutMs ?? HTTP_LIMITS.shutdownTimeoutMs;
  if (
    ![options.port, maxConcurrent, requestsPerMinute, shutdownTimeoutMs].every(
      Number.isSafeInteger,
    ) ||
    options.port < 0 ||
    options.port > 65_535 ||
    Math.min(maxConcurrent, requestsPerMinute, shutdownTimeoutMs) < 1
  ) {
    throw new AppError("usage_error", "HTTP port and resource limits are invalid.");
  }
  let active = 0;
  let windowStart = Date.now();
  let requests = 0;
  const inFlight = new Set<Promise<void>>();
  const server = createServer((request, response) => {
    const requestedId = request.headers["x-request-id"];
    const requestId =
      typeof requestedId === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(requestedId)
        ? requestedId
        : randomUUID();
    response.setHeader("X-Request-ID", requestId);
    const started = Date.now();
    const task = (async () => {
      let acquired = false;
      let code: string | undefined;
      try {
        if (!trustedHost(request)) throw new AppError("untrusted_host", "Host is not loopback.");
        if (!trustedOrigin(request))
          throw new AppError("untrusted_origin", "Origin does not match this service.");
        if (request.method === "OPTIONS")
          throw new AppError("method_not_allowed", "CORS preflight is not enabled.");
        if (Date.now() - windowStart >= 60_000) {
          windowStart = Date.now();
          requests = 0;
        }
        if (++requests > requestsPerMinute)
          throw new AppError("rate_limited", "Too many requests. Try again shortly.");
        if (active >= maxConcurrent)
          throw new AppError("busy", "The local service is busy. Try again shortly.");
        active += 1;
        acquired = true;
        await options.handler(request, response, requestId);
      } catch (error) {
        code = publicError(error).code;
        sendError(response, error, requestId);
      } finally {
        if (acquired) active -= 1;
        options.log?.({
          event: "http_request",
          request_id: requestId,
          status: response.statusCode,
          code,
          duration_ms: Date.now() - started,
        });
      }
    })();
    inFlight.add(task);
    void task.then(
      () => inFlight.delete(task),
      () => inFlight.delete(task),
    );
  });
  server.requestTimeout = HTTP_LIMITS.requestTimeoutMs;
  server.headersTimeout = HTTP_LIMITS.requestTimeoutMs;
  server.timeout = HTTP_LIMITS.requestTimeoutMs;
  server.keepAliveTimeout = 1_000;
  server.maxConnections = maxConcurrent * 2;
  server.listen(options.port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new AppError("internal_error", "The service could not bind its port.");
  let closing: Promise<void> | undefined;
  return {
    server,
    port: address.port,
    close() {
      closing ??= (async () => {
        const closed = new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            server.closeAllConnections();
            resolve();
          }, shutdownTimeoutMs);
          timer.unref();
        });
        try {
          await Promise.race([Promise.all([closed, Promise.allSettled(inFlight)]), deadline]);
        } finally {
          clearTimeout(timer);
        }
      })();
      return closing;
    },
  };
}
