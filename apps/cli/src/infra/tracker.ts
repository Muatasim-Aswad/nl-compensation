import { AppError } from "../shared/errors.js";

export interface TrackerJob {
  readonly id: string;
  readonly updatedAt: string;
  readonly meta: Readonly<Record<string, unknown>>;
}

function trackerBaseUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:")
    throw new AppError("tracker_error", "Job Tracker URL must use http on loopback");
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname.toLowerCase())) {
    throw new AppError("tracker_error", "Job Tracker URL must resolve to a loopback hostname");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function parseJob(raw: unknown, expectedId: string): TrackerJob {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AppError("tracker_error", "Job Tracker response shape mismatch: expected an object");
  }
  const value = raw as Record<string, unknown>;
  if (value.id !== expectedId || typeof value.updated_at !== "string") {
    throw new AppError(
      "tracker_error",
      "Job Tracker response shape mismatch: id or updated_at is invalid",
    );
  }
  if (typeof value.meta !== "object" || value.meta === null || Array.isArray(value.meta)) {
    throw new AppError(
      "tracker_error",
      "Job Tracker response shape mismatch: meta is not an object",
    );
  }
  return {
    id: expectedId,
    updatedAt: value.updated_at,
    meta: value.meta as Record<string, unknown>,
  };
}

async function responseJson(response: Response, operation: string): Promise<unknown> {
  if (!response.ok) {
    throw new AppError("tracker_error", `Job Tracker ${operation} failed (${response.status}).`);
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new AppError("tracker_error", `Job Tracker ${operation} response was not JSON`);
  }
}

export async function readTrackerJob(
  baseUrl: string,
  jobId: string,
  fetcher: typeof fetch = fetch,
): Promise<TrackerJob> {
  const base = trackerBaseUrl(baseUrl);
  const response = await fetcher(new URL(`/api/jobs/${encodeURIComponent(jobId)}`, base), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  return parseJob(await responseJson(response, "read"), jobId);
}

export async function patchTrackerJob(
  baseUrl: string,
  jobId: string,
  meta: Readonly<Record<string, unknown>>,
  fetcher: typeof fetch = fetch,
): Promise<TrackerJob> {
  const base = trackerBaseUrl(baseUrl);
  const response = await fetcher(new URL(`/api/jobs/${encodeURIComponent(jobId)}`, base), {
    method: "PATCH",
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ meta }),
  });
  return parseJob(await responseJson(response, "update"), jobId);
}
