export const HTTP_LIMITS = {
  maxBodyBytes: 1_048_576,
  requestTimeoutMs: 10_000,
  maxConcurrent: 16,
  requestsPerMinute: 240,
  shutdownTimeoutMs: 5_000,
} as const;
