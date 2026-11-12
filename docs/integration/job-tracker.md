# Job Tracker integration

Job Tracker is an optional localhost export target. NL Compensation remains the source of truth for the full private case and sends only these reserved metadata keys:

```text
compensation_case_id
compensation_gac_eur
compensation_gac_40h_eur
compensation_cash_completeness
compensation_ruleset
```

The two EUR fields are numbers when the corresponding GAC is exact and `null` for a range or unavailable value. `compensation_cash_completeness` is the normalization layer's precision label. `compensation_ruleset` joins the immutable bundle ID and content hash with `@`; it is provenance, not a claim that every output is exact.

## Preview and apply

```sh
nl-compensation tracker attach \
  --job-id JOB_ID \
  --case-id LOCAL_CASE_ID \
  --tracker-url http://127.0.0.1:3456
```

This performs one `GET /api/jobs/{job_id}` and prints a dry-run containing the observed `updated_at`, compact summary, and complete merged metadata bag. No write occurs. The URL is restricted to plain HTTP on a loopback hostname.

To apply the preview:

```sh
nl-compensation tracker attach \
  --job-id JOB_ID \
  --case-id LOCAL_CASE_ID \
  --tracker-url http://127.0.0.1:3456 \
  --apply
```

The command requires an interactive `y`. After confirmation it reads the job again, requires unchanged `updated_at` and metadata, then sends `PATCH /api/jobs/{job_id}` with the complete merged `meta` bag because Job Tracker replaces rather than merges that field. Drift, an unavailable server, non-JSON responses, and API-shape mismatches abort without a write. Retry by generating a fresh preview; do not bypass the check.

The adapter never calls `/api/events` and specifically never posts a note, because a note would alter Job Tracker's attention clock. Automated coverage uses a loopback fake API and asserts that no event route is touched.
