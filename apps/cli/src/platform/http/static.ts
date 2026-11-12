import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { AppError } from "../../shared/errors.js";
import { routePath, securityHeaders } from "./response.js";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function safeStaticPath(directory: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) return undefined;
  const segments = decoded.split("/");
  if (segments.includes("..")) return undefined;
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = path.resolve(directory, relative);
  const relation = path.relative(path.resolve(directory), candidate);
  if (relation.startsWith("..") || path.isAbsolute(relation)) return undefined;
  return candidate;
}

function htmlWithSessionToken(source: Buffer, token: string): Buffer {
  const html = source.toString("utf8");
  const escaped = token
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const tag = `<meta name="nl-compensation-token" content="${escaped}">`;
  return Buffer.from(html.includes("</head>") ? html.replace("</head>", `${tag}</head>`) : html);
}

export async function sendStatic(
  request: IncomingMessage,
  response: ServerResponse,
  directory: string,
  token: string,
): Promise<boolean> {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const pathname = routePath(request);
  const file = safeStaticPath(directory, pathname);
  if (file === undefined) {
    throw new AppError("invalid_path", "Static path is invalid.");
  }
  let body: Buffer;
  try {
    body = await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const extension = path.extname(file).toLowerCase();
  const carriesSessionToken = extension === ".html";
  if (carriesSessionToken) body = htmlWithSessionToken(body, token);
  response.statusCode = 200;
  response.setHeader("Content-Type", CONTENT_TYPES[extension] ?? "application/octet-stream");
  // The entry document carries the write-session token, so it is private and
  // must not be written to a shared or on-disk cache. Content-hashed assets
  // carry nothing private and stay immutable.
  response.setHeader(
    "Cache-Control",
    carriesSessionToken
      ? "no-store"
      : /[/\\]assets[/\\].+-[A-Za-z0-9_-]{6,}\./.test(file)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
  );
  response.setHeader("Content-Length", body.byteLength);
  securityHeaders(response);
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  response.end(request.method === "HEAD" ? undefined : body);
  return true;
}
