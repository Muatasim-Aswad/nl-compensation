import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";

const [addressFile] = process.argv.slice(2);
if (!addressFile) throw new Error("usage: node scripts/fake-tracker.mjs <address-file>");

let meta = { synthetic: true };
let updatedAt = "2026-08-16T12:00:00Z";
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (pathname !== "/api/jobs/synthetic-smoke-job") {
    response.statusCode = 404;
    response.end('{"detail":"not found"}');
    return;
  }
  if (request.method === "GET") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ id: "synthetic-smoke-job", meta, updated_at: updatedAt }));
    return;
  }
  if (request.method === "PATCH") {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    meta = body.meta;
    updatedAt = "2026-08-16T12:01:00Z";
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ id: "synthetic-smoke-job", meta, updated_at: updatedAt }));
    return;
  }
  response.statusCode = 405;
  response.end();
});

server.listen(0, "127.0.0.1", async () => {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake tracker did not bind");
  await writeFile(addressFile, `http://127.0.0.1:${address.port}\n`, { mode: 0o600 });
});

const stop = () => server.close(() => process.exit(0));
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
