import {
  CALCULATION_API_VERSION,
  ContractValidationError,
  openApiDocument,
  parseCompensationCase,
  type CaseSaveRequest,
} from "@nl-compensation/core";
import type { StoragePaths } from "../../config/storage.js";
import {
  listCases,
  readCaseRecord,
  readProfileRecord,
  saveCaseRecord,
  sourceObservationIds,
  writeProfileRecord,
} from "../../infra/storage.js";
import { mutationId, readJsonBody, revisionPrecondition } from "../../platform/http/request.js";
import { routePath, securityHeaders, sendJson } from "../../platform/http/response.js";
import type { RequestHandler } from "../../platform/http/server.js";
import { sendStatic } from "../../platform/http/static.js";
import { AppError } from "../../shared/errors.js";
import { calculateRequest, listRules, requestFromUnknown, showRule } from "./service.js";

interface RouteOptions {
  readonly token: string;
  readonly paths: StoragePaths;
  readonly now: () => string;
  readonly staticDirectory: string | false;
}

function decodeId(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    throw new AppError("invalid_path", "The path contains invalid encoding.");
  }
}

export function compensationRoutes(options: RouteOptions): RequestHandler {
  return async (request, response, requestId) => {
    const pathname = routePath(request);
    const write =
      (request.method === "PUT" && pathname === "/api/v1/profile") ||
      (request.method === "POST" && pathname === "/api/v1/cases");
    if (write && request.headers["x-nl-compensation-token"] !== options.token)
      throw new AppError("invalid_session_token", "A valid session token is required.");
    const expectedRevision = write ? revisionPrecondition(request) : undefined;
    const id = write ? mutationId(request) : undefined;
    if (request.method === "GET" && pathname === "/api/v1/openapi.json") {
      securityHeaders(response);
      response.setHeader("Content-Security-Policy", "default-src 'none'");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(JSON.stringify(openApiDocument));
      return;
    }
    if (request.method === "GET" && pathname === "/api/v1")
      return sendJson(
        response,
        200,
        { apiVersion: CALCULATION_API_VERSION, ok: true },
        "discovery",
      );
    if (request.method === "GET" && pathname === "/api/v1/rules")
      return sendJson(response, 200, listRules(), "rules");
    if (request.method === "GET" && pathname.startsWith("/api/v1/rules/"))
      return sendJson(
        response,
        200,
        showRule(decodeId(pathname.slice("/api/v1/rules/".length))),
        "rule",
      );
    if (request.method === "POST" && pathname === "/api/v1/validate") {
      const input = parseCompensationCase(await readJsonBody(request, "validationRequest"));
      return sendJson(
        response,
        200,
        { apiVersion: CALCULATION_API_VERSION, ok: true, input },
        "validation",
      );
    }
    if (request.method === "POST" && pathname === "/api/v1/calculate") {
      const result = calculateRequest(await readJsonBody(request, "calculationRequest"));
      if (!result.ok)
        throw new ContractValidationError(
          result.errors.map((error) => ({ ...error, path: error.path ?? "request" })),
        );
      return sendJson(response, 200, { ...result, requestId }, "calculation");
    }
    if (request.method === "GET" && pathname === "/api/v1/profile") {
      const record = await readProfileRecord(options.paths);
      if (!record) throw new AppError("not_found", "Profile is not set.");
      response.setHeader("ETag", `"${record.revision}"`);
      return sendJson(response, 200, record.value, "profile");
    }
    if (request.method === "PUT" && pathname === "/api/v1/profile") {
      const input = await readJsonBody(request, "profile");
      const saved = await writeProfileRecord(options.paths, input, options.now(), {
        expectedRevision,
        mutationId: id,
      });
      response.setHeader("ETag", `"${saved.revision}"`);
      return sendJson(response, 200, { ok: true, profile: saved.value }, "profileWrite");
    }
    if (request.method === "GET" && pathname === "/api/v1/cases")
      return sendJson(
        response,
        200,
        { apiVersion: CALCULATION_API_VERSION, cases: await listCases(options.paths) },
        "cases",
      );
    if (request.method === "GET" && pathname.startsWith("/api/v1/cases/")) {
      const record = await readCaseRecord(
        options.paths,
        decodeId(pathname.slice("/api/v1/cases/".length)),
      );
      if (!record) throw new AppError("not_found", "Case was not found.");
      response.setHeader("ETag", `"${record.revision}"`);
      return sendJson(response, 200, record.value, "case");
    }
    if (request.method === "POST" && pathname === "/api/v1/cases") {
      const body = (await readJsonBody(request, "caseSaveRequest")) as CaseSaveRequest;
      const envelope = requestFromUnknown(body.input, { requestId, calculatedAt: options.now() });
      const calculated = calculateRequest(envelope);
      if (!calculated.ok)
        throw new ContractValidationError(
          calculated.errors.map((error) => ({ ...error, path: error.path ?? "request" })),
        );
      const saved = await saveCaseRecord(
        options.paths,
        body.caseId,
        {
          schemaVersion: "1",
          engineVersion: envelope.context.engineVersion,
          selectedRules: envelope.context.rules,
          calculatedAt: envelope.context.calculatedAt,
          sourceObservations: sourceObservationIds(envelope.input),
          input: envelope.input,
          report: calculated.report,
        },
        { expectedRevision, mutationId: id, fingerprint: JSON.stringify(body) },
      );
      response.setHeader("ETag", `"${saved.revision}"`);
      return sendJson(
        response,
        201,
        { ok: true, caseId: body.caseId, report: saved.value.report },
        "caseWrite",
      );
    }
    if (
      !pathname.startsWith("/api/") &&
      options.staticDirectory !== false &&
      (await sendStatic(request, response, options.staticDirectory, options.token))
    )
      return;
    throw new AppError("not_found", "Route was not found.");
  };
}
