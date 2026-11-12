export interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: { readonly currentRevision?: string | null };
  };
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly currentRevision?: string | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function responseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    /* Use a safe fallback for non-JSON failures. */
  }
  return new ApiError(
    body.error?.code ?? "request_failed",
    body.error?.message ?? response.statusText,
    response.status,
    body.error?.details?.currentRevision,
  );
}

export function writeToken(): string | undefined {
  return document
    .querySelector<HTMLMetaElement>('meta[name="nl-compensation-token"]')
    ?.content.trim();
}
