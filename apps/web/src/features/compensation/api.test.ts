import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { calculationRequest, saveCase, saveDefault } from "./api.js";
import { initialScenario, toCompensationCase } from "./scenario.js";

describe("browser API client", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      querySelector: () => ({ content: "synthetic-browser-session-token" }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("builds the frozen versioned calculation envelope", () => {
    const request = calculationRequest(
      toCompensationCase(initialScenario),
      "2026-08-16T12:00:00Z",
      "request-1",
    );
    expect(request).toMatchObject({
      apiVersion: "v1",
      requestId: "request-1",
      context: {
        engineVersion: "0.1.0",
        calculatedAt: "2026-08-16T12:00:00Z",
        rules: { bundleId: "nl-2026-b3" },
      },
    });
  });

  test.each([
    ["default", saveDefault, "/api/v1/profile", "PUT"],
    ["case", saveCase, "/api/v1/cases", "POST"],
  ])("surfaces failed %s save responses", async (_, save, path, method) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            status: 503,
            code: "busy",
            message: "Storage is unavailable",
            request_id: "synthetic-error",
          },
        }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    await expect(save(toCompensationCase(initialScenario), null, fetcher)).rejects.toThrow(
      "Storage is unavailable",
    );
    expect(fetcher).toHaveBeenCalledWith(
      path,
      expect.objectContaining({
        method,
        headers: expect.objectContaining({
          "x-nl-compensation-token": "synthetic-browser-session-token",
        }),
      }),
    );
  });
});
