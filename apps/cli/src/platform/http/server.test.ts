import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { storagePaths } from "../../config/storage.js";
import { runCli } from "../../entrypoints/cli.js";
import { startService, type RunningService } from "../../entrypoints/server.js";
import { calculateRequest, createCalculationRequest } from "../../modules/compensation/service.js";

import { syntheticCase } from "../../test/fixtures.js";

const roots: string[] = [];
const services: RunningService[] = [];
const TOKEN = "synthetic-test-token-that-is-at-least-32-bytes";

async function statusWithHost(port: number, host: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port, path: "/api/v1", headers: { Host: host } },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.once("error", reject);
    request.end();
  });
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function isolatedService(): Promise<RunningService> {
  const root = await mkdtemp(path.join(tmpdir(), "nl-compensation-server-"));
  roots.push(root);
  const service = await startService({
    port: 0,
    token: TOKEN,
    now: () => "2026-08-16T12:00:00.000Z",
    paths: storagePaths({
      HOME: path.join(root, "home"),
      XDG_DATA_HOME: path.join(root, "data"),
    }),
    staticDirectory: false,
  });
  services.push(service);
  return service;
}

describe("loopback service", () => {
  test("uses an ephemeral loopback port and rejects untrusted hosts, origins, and missing write tokens", async () => {
    const service = await isolatedService();
    expect(service.server.address()).toMatchObject({ address: "127.0.0.1", port: service.port });
    const originResponse = await fetch(`${service.url}/api/v1`, {
      headers: { Origin: "https://attacker.invalid" },
    });
    expect(originResponse.status).toBe(403);
    expect(originResponse.headers.get("access-control-allow-origin")).toBeNull();

    expect(await statusWithHost(service.port, "attacker.invalid")).toBe(400);

    const noToken = await fetch(`${service.url}/api/v1/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syntheticCase()),
    });
    expect(noToken.status).toBe(403);
  });

  test("HTTP and CLI adapters return identical structured calculation results", async () => {
    const service = await isolatedService();
    const request = createCalculationRequest(syntheticCase(), {
      calculatedAt: "2026-08-16T12:00:00.000Z",
      requestId: "browser",
    });
    const response = await fetch(`${service.url}/api/v1/calculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NL-Compensation-Token": TOKEN,
        "If-None-Match": "*",
      },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const fromHttp = (await response.json()) as Record<string, unknown>;
    const fromDirect = calculateRequest(request) as unknown as Record<string, unknown>;
    const output: string[] = [];
    const status = await runCli(["calculate", "--input", "-"], {
      io: {
        out: (text) => output.push(text),
        error: () => undefined,
        readStdin: async () => JSON.stringify(request),
      },
    });
    expect(status).toBe(0);
    const fromCli = JSON.parse(output.join("")) as Record<string, unknown>;
    const canonical = (value: Record<string, unknown>) => {
      const { requestId: _requestId, ...stable } = value;
      return JSON.stringify(stable);
    };
    expect(canonical(fromHttp)).toBe(canonical(fromDirect));
    expect(canonical(fromCli)).toBe(canonical(fromDirect));
  });

  test("serves only resolved web assets with strict cache and browser security policy", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nl-compensation-static-"));
    roots.push(root);
    const staticDirectory = path.join(root, "web");
    await mkdir(path.join(staticDirectory, "assets"), { recursive: true });
    await writeFile(
      path.join(staticDirectory, "index.html"),
      '<!doctype html><html><head></head><body><script src="/assets/app-AbCdEf12.js"></script></body></html>',
    );
    await writeFile(path.join(staticDirectory, "assets", "app-AbCdEf12.js"), "export {};\n");
    const service = await startService({
      port: 0,
      token: TOKEN,
      staticDirectory,
      paths: storagePaths({
        HOME: path.join(root, "home"),
        XDG_DATA_HOME: path.join(root, "data"),
      }),
    });
    services.push(service);

    const index = await fetch(service.url);
    expect(index.status).toBe(200);
    expect(index.headers.get("cache-control")).toBe("no-store");
    expect(index.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(await index.text()).toContain(`content="${TOKEN}"`);

    const asset = await fetch(`${service.url}/assets/app-AbCdEf12.js`);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(asset.headers.get("content-type")).toBe("text/javascript; charset=utf-8");

    const traversal = await fetch(`${service.url}/..%2fsecret`);
    expect(traversal.status).toBe(400);
  });

  test("authorized profile writes stay inside the temporary XDG roots", async () => {
    const service = await isolatedService();
    const response = await fetch(`${service.url}/api/v1/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-NL-Compensation-Token": TOKEN,
        "If-None-Match": "*",
      },
      body: JSON.stringify(syntheticCase()),
    });
    expect(response.status).toBe(200);
    const read = await fetch(`${service.url}/api/v1/profile`);
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect((await read.json()) as unknown).toMatchObject({ caseId: "synthetic-cli-case" });
  });
});

describe("HTTP contracts and safe errors", () => {
  test("publishes OpenAPI and correlates routing and validation errors without raw values", async () => {
    const service = await isolatedService();
    const specification = await fetch(`${service.url}/api/v1/openapi.json`);
    expect(specification.status).toBe(200);
    const document = (await specification.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths).toHaveProperty("/api/v1/profile");
    const response = await fetch(`${service.url}/api/v1/validate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "synthetic-correlation" },
      body: JSON.stringify({ secret: "synthetic-private-value" }),
    });
    expect(response.status).toBe(422);
    expect(response.headers.get("x-request-id")).toBe("synthetic-correlation");
    const body = await response.text();
    expect(body).not.toContain("synthetic-private-value");
    expect(JSON.parse(body)).toMatchObject({
      error: {
        status: 422,
        code: "validation_error",
        request_id: "synthetic-correlation",
        issues: expect.any(Array),
      },
    });
    const missing = await fetch(`${service.url}/api/v1/unknown`);
    expect(await missing.json()).toMatchObject({
      error: { status: 404, code: "not_found", request_id: missing.headers.get("x-request-id") },
    });
  });

  test("requires revision preconditions and leaves state unchanged on a stale write", async () => {
    const service = await isolatedService();
    const headers = { "content-type": "application/json", "x-nl-compensation-token": TOKEN };
    const url = `${service.url}/api/v1/profile`;
    expect(
      (await fetch(url, { method: "PUT", headers, body: JSON.stringify(syntheticCase()) })).status,
    ).toBe(428);
    const first = await fetch(url, {
      method: "PUT",
      headers: { ...headers, "if-none-match": "*" },
      body: JSON.stringify(syntheticCase("first")),
    });
    expect(first.status).toBe(200);
    const revision = first.headers.get("etag")!;
    const updated = await fetch(url, {
      method: "PUT",
      headers: { ...headers, "if-match": revision },
      body: JSON.stringify(syntheticCase("second")),
    });
    expect(updated.status).toBe(200);
    const stale = await fetch(url, {
      method: "PUT",
      headers: { ...headers, "if-match": revision },
      body: JSON.stringify(syntheticCase("stale")),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { details: { currentRevision: updated.headers.get("etag")!.slice(1, -1) } },
    });
    expect(await (await fetch(url)).json()).toMatchObject({ caseId: "second" });
  });

  test("corrupt storage produces a safe 500 and logs one redacted correlated event", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nl-compensation-safe-error-"));
    roots.push(root);
    const paths = storagePaths({ HOME: root });
    await mkdir(path.dirname(paths.database), { recursive: true });
    await writeFile(paths.database, '{"synthetic-private-secret":', "utf8");
    const entries: unknown[] = [];
    const service = await startService({
      port: 0,
      token: TOKEN,
      paths,
      staticDirectory: false,
      log: (entry) => entries.push(entry),
    });
    services.push(service);
    const response = await fetch(`${service.url}/api/v1/profile`);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain(root);
    expect(text).not.toContain("synthetic-private-secret");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      status: 500,
      request_id: response.headers.get("x-request-id"),
      code: "storage_error",
    });
    expect(JSON.stringify(entries)).not.toContain(root);
  });

  test("retries a case mutation without changing its saved calculation timestamp", async () => {
    const service = await isolatedService();
    const headers = {
      "content-type": "application/json",
      "x-nl-compensation-token": TOKEN,
      "if-none-match": "*",
      "idempotency-key": "synthetic-retry",
    };
    const body = JSON.stringify({ caseId: "retry-case", input: syntheticCase("retry-case") });
    const first = await fetch(`${service.url}/api/v1/cases`, { method: "POST", headers, body });
    const retry = await fetch(`${service.url}/api/v1/cases`, { method: "POST", headers, body });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.headers.get("etag")).toBe(first.headers.get("etag"));
    expect(await retry.json()).toEqual(await first.json());
  });
});
