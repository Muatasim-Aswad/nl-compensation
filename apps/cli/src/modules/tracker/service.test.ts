import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { storagePaths } from "../../config/storage.js";
import { runCli } from "../../entrypoints/cli.js";
import { saveCase, sourceObservationIds, type StoredCase } from "../../infra/storage.js";
import { syntheticCase } from "../../test/fixtures.js";
import { calculateRequest, createCalculationRequest } from "../compensation/service.js";

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }),
  );
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function storedFixture(): StoredCase {
  const input = syntheticCase("tracker-case");
  const request = createCalculationRequest(input, {
    requestId: "tracker-test",
    calculatedAt: "2026-08-16T12:00:00.000Z",
  });
  const result = calculateRequest(request);
  if (!result.ok) throw new Error("synthetic tracker fixture did not calculate");
  return {
    schemaVersion: "1",
    engineVersion: request.context.engineVersion,
    selectedRules: request.context.rules,
    calculatedAt: request.context.calculatedAt,
    sourceObservations: sourceObservationIds(input),
    input,
    report: result.report,
  };
}

async function fakeTracker(options: { readonly driftOnSecondRead?: boolean } = {}): Promise<{
  readonly url: string;
  readonly requests: { method: string; path: string; body?: unknown }[];
}> {
  const requests: { method: string; path: string; body?: unknown }[] = [];
  let reads = 0;
  let metadata: Record<string, unknown> = { owner: "synthetic-user", keep: true };
  let updatedAt = "2026-08-16T12:00:00Z";
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const source = Buffer.concat(chunks).toString("utf8");
    const entry = {
      method: request.method ?? "",
      path: request.url ?? "",
      ...(source ? { body: JSON.parse(source) as unknown } : {}),
    };
    requests.push(entry);
    if (request.method === "GET" && request.url === "/api/jobs/job-synthetic") {
      reads += 1;
      if (options.driftOnSecondRead && reads === 2) updatedAt = "2026-08-16T12:01:00Z";
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ id: "job-synthetic", updated_at: updatedAt, meta: metadata }));
      return;
    }
    if (request.method === "PATCH" && request.url === "/api/jobs/job-synthetic") {
      metadata = (entry.body as { meta: Record<string, unknown> }).meta;
      updatedAt = "2026-08-16T12:02:00Z";
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ id: "job-synthetic", updated_at: updatedAt, meta: metadata }));
      return;
    }
    response.statusCode = 404;
    response.end('{"detail":"not found"}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  servers.push(server);
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake tracker did not bind");
  return { url: `http://127.0.0.1:${address.port}`, requests };
}

async function isolatedRuntime() {
  const root = await mkdtemp(path.join(tmpdir(), "nl-compensation-tracker-"));
  roots.push(root);
  const environment = {
    HOME: path.join(root, "home"),
    XDG_DATA_HOME: path.join(root, "data"),
  };
  await saveCase(storagePaths(environment), "tracker-case", storedFixture());
  return environment;
}

describe("Job Tracker compact adapter", () => {
  test("is a metadata-preserving dry-run by default and never posts a note", async () => {
    const environment = await isolatedRuntime();
    const tracker = await fakeTracker();
    const output: string[] = [];
    const status = await runCli(
      [
        "tracker",
        "attach",
        "--job-id",
        "job-synthetic",
        "--case-id",
        "tracker-case",
        "--tracker-url",
        tracker.url,
      ],
      {
        environment,
        io: {
          out: (text) => output.push(text),
          error: () => undefined,
          readStdin: async () => "",
        },
      },
    );
    expect(status).toBe(0);
    expect(JSON.parse(output.join("")) as unknown).toMatchObject({
      mode: "dry-run",
      mergedMeta: {
        owner: "synthetic-user",
        keep: true,
        compensation_case_id: "tracker-case",
        compensation_gac_eur: 59616,
        compensation_gac_40h_eur: 59616,
        compensation_cash_completeness: "exact",
      },
    });
    expect(tracker.requests).toHaveLength(1);
    expect(tracker.requests.some((request) => request.path.includes("events"))).toBe(false);
  });

  test("requires confirmation, re-reads fresh state, and patches only the merged metadata bag", async () => {
    const environment = await isolatedRuntime();
    const tracker = await fakeTracker();
    const output: string[] = [];
    const status = await runCli(
      [
        "tracker",
        "attach",
        "--job-id",
        "job-synthetic",
        "--case-id",
        "tracker-case",
        "--tracker-url",
        tracker.url,
        "--apply",
      ],
      {
        environment,
        io: {
          out: (text) => output.push(text),
          error: () => undefined,
          readStdin: async () => "",
          confirm: async () => true,
        },
      },
    );
    expect(status).toBe(0);
    expect(JSON.parse(output.join("")) as unknown).toMatchObject({ mode: "applied" });
    expect(tracker.requests.map((request) => request.method)).toEqual(["GET", "GET", "PATCH"]);
    expect(tracker.requests[2]?.body).toMatchObject({
      meta: { owner: "synthetic-user", keep: true, compensation_case_id: "tracker-case" },
    });
  });

  test("aborts an apply when updated_at drifts after confirmation", async () => {
    const environment = await isolatedRuntime();
    const tracker = await fakeTracker({ driftOnSecondRead: true });
    const errors: string[] = [];
    const status = await runCli(
      [
        "tracker",
        "attach",
        "--job-id",
        "job-synthetic",
        "--case-id",
        "tracker-case",
        "--tracker-url",
        tracker.url,
        "--apply",
      ],
      {
        environment,
        io: {
          out: () => undefined,
          error: (text) => errors.push(text),
          readStdin: async () => "",
          confirm: async () => true,
        },
      },
    );
    expect(status).toBe(2);
    expect(errors.join("")).toContain("changed after preview");
    expect(tracker.requests.map((request) => request.method)).toEqual(["GET", "GET"]);
  });
});
