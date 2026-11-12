import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { storagePaths, type StorageEnvironment, type StoragePaths } from "../config/storage.js";
import { compensationRoutes } from "../modules/compensation/http.js";
import {
  startHttpServer,
  type HttpServerOptions,
  type RequestLog,
} from "../platform/http/server.js";
import { AppError } from "../shared/errors.js";

export interface ServiceOptions {
  readonly port?: number;
  readonly token?: string;
  readonly environment?: StorageEnvironment;
  readonly paths?: StoragePaths;
  readonly now?: () => string;
  readonly staticDirectory?: string | false;
  readonly limits?: HttpServerOptions["limits"];
  readonly log?: (entry: RequestLog) => void;
}

export type RunningService = Awaited<ReturnType<typeof startService>>;

export async function startService(options: ServiceOptions = {}) {
  const token = options.token ?? randomBytes(32).toString("base64url");
  if (token.length < 32)
    throw new AppError("usage_error", "Session token must be at least 32 characters.");
  const handler = compensationRoutes({
    token,
    paths: options.paths ?? storagePaths(options.environment),
    now: options.now ?? (() => new Date().toISOString()),
    staticDirectory:
      options.staticDirectory ?? fileURLToPath(new URL("../../web/dist", import.meta.url)),
  });
  const running = await startHttpServer({
    port: options.port ?? 3466,
    handler,
    limits: options.limits,
    log: options.log,
  });
  return { ...running, url: `http://127.0.0.1:${running.port}`, token };
}
