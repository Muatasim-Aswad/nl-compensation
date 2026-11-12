import { afterEach, expect, test } from "vite-plus/test";
import { startHttpServer } from "./server.js";
import { sendJson } from "./response.js";
import { validateHttpContract } from "./contracts.js";

const services: Awaited<ReturnType<typeof startHttpServer>>[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
});

test("rate limiting happens before the handler acquires work", async () => {
  let calls = 0;
  const service = await startHttpServer({
    port: 0,
    limits: { requestsPerMinute: 2 },
    handler: async (_, response) => {
      calls += 1;
      sendJson(response, 200, { apiVersion: "v1", ok: true }, "discovery");
    },
  });
  services.push(service);
  const url = `http://127.0.0.1:${service.port}/api/v1`;
  expect((await fetch(url)).status).toBe(200);
  expect((await fetch(url)).status).toBe(200);
  const limited = await fetch(url);
  expect(limited.status).toBe(429);
  expect(calls).toBe(2);
});

test("concurrent work is bounded before reading another body", async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = await startHttpServer({
    port: 0,
    limits: { maxConcurrent: 1 },
    handler: async (_, response) => {
      entered();
      await hold;
      sendJson(response, 200, { apiVersion: "v1", ok: true }, "discovery");
    },
  });
  services.push(service);
  const url = `http://127.0.0.1:${service.port}/api/v1`;
  const first = fetch(url);
  try {
    await started;
    expect((await fetch(url)).status).toBe(503);
  } finally {
    release();
  }
  expect((await first).status).toBe(200);
});

test("shutdown bounds a handler that does not finish", async () => {
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const service = await startHttpServer({
    port: 0,
    limits: { shutdownTimeoutMs: 30 },
    handler: async () => {
      entered();
      await new Promise(() => undefined);
    },
  });
  const request = fetch(`http://127.0.0.1:${service.port}/api/v1`).catch(() => undefined);
  await started;
  const before = performance.now();
  await service.close();
  expect(performance.now() - before).toBeLessThan(1000);
  await request;
});

test("outgoing schemas reject an invalid application result", () => {
  expect(() =>
    validateHttpContract(
      "profileWrite",
      { ok: true, profile: { schemaVersion: "unexpected" } },
      true,
    ),
  ).toThrow("invalid response");
});
