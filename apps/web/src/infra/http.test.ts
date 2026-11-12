import { expect, test } from "vite-plus/test";
import { responseError } from "./http.js";

test("reads the current structured HTTP error", async () => {
  const response = new Response(
    JSON.stringify({
      error: {
        status: 409,
        code: "conflict",
        message: "Reload saved data.",
        request_id: "synthetic-error",
        details: { currentRevision: "synthetic-revision" },
      },
    }),
    { status: 409 },
  );
  expect(await responseError(response)).toMatchObject({
    code: "conflict",
    message: "Reload saved data.",
    currentRevision: "synthetic-revision",
  });
});

test("does not interpret an obsolete error response shape", async () => {
  const response = new Response(JSON.stringify({ message: "Unsupported response wording" }), {
    status: 503,
    statusText: "Service Unavailable",
  });
  expect(await responseError(response)).toMatchObject({
    code: "request_failed",
    message: "Service Unavailable",
  });
});
