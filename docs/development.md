# Development

## Setup and checks

```sh
mise install
pnpm install --frozen-lockfile
mise run check
```

`mise.toml` pins the development toolchain. pnpm owns dependency resolution, workspace links, the catalog, and lockfile. Vite+ owns formatting, linting, TypeScript/test/build tasks, orchestration, and caching. `package.json` and `vite.config.ts` own command composition. Existing pnpm commands remain available without mise.

Installation generates HTTP schemas/OpenAPI and configures the committed pre-commit hook when no other hook path is configured. Existing custom hooks are preserved; `pnpm run hooks:install` explicitly selects this project's hooks. Pre-commit runs `verify:all`; CI runs the same complete `check` gate as local development. Conventional Commits are not required because no release automation consumes them.

| Command | Purpose |
| --- | --- |
| `pnpm run check` | Frozen install, generated contracts, architecture, verification, builds, sources, packaged smoke |
| `pnpm run verify:all` | Generated contracts, dependency boundaries, formatting, lint, types, source tests |
| `pnpm run build:all` | Generate contracts and build the CLI/browser assets |
| `pnpm run contracts:generate` | Regenerate HTTP schemas, OpenAPI, and the engine-version constant |
| `pnpm run smoke` | Test the installed package with disposable state |

Keep changes with their [architectural owner](architecture.md#application-layout). Extract coherent behavior and components; preserve the pure calculation boundary. Keep frontend copy in typed owner-local records and display formatting in the compensation feature. Use the configured Markdown formatter without hard-wrapping prose. Public package APIs exclude fixtures; tests import the dedicated testing subpath. New public DTO fields must update their runtime parser and relevant boundary/contract tests.

Tests discover source files, never generated `dist` tests. Domain boundary/golden tests, transport parity, browser effects, safe errors, revision conflicts/retries, rolled-back SQLite transactions, and HTTP resource limits are covered. A fresh run without task-cache reuse is `pnpm exec vp run -r --no-cache test`.

Tests and smoke must use temporary XDG roots and fake Job Tracker servers. Server tests use ephemeral ports. The packaged smoke uses its controlled port from `scripts/smoke.sh`, overridable with `NL_COMPENSATION_SMOKE_PORT`; it stops both temporary servers and removes temporary state on exit.

## Versioned HTTP contract

The API binds only to loopback. `GET /api/v1/openapi.json` serves its generated OpenAPI document. `packages/core/src/contracts/service.ts` owns HTTP DTO shapes; existing core parsers own additional semantic constraints. `scripts/generate-contracts.mjs` derives runtime request/response schemas and OpenAPI from those types. Generated files under `packages/core/src/generated/` are untracked and recreated during setup/checks. Typecheck verifies generation inputs; no independently maintained client schema is committed.

The routes are:

- `GET /api/v1`, `/api/v1/rules`, and `/api/v1/rules/{id}`
- `POST /api/v1/validate` and `/api/v1/calculate`
- `GET|PUT /api/v1/profile`
- `GET /api/v1/cases` and `/api/v1/cases/{id}`
- `POST /api/v1/cases` with `{ "caseId": "...", "input": { ... } }`

Calculation and validation do not write. The shared `v1` calculation success envelope remains compatible across CLI, browser, and HTTP; parity tests remove only `requestId` before comparing JSON bytes. Presentation owns neither formulas nor rounding. Existing explicit write acknowledgements and case-list shapes remain part of this versioned local API rather than a new universal response wrapper.

Writes require `X-NL-Compensation-Token` plus either `If-None-Match: *` for creation or `If-Match: "<revision>"` for replacement. Read the current `ETag` from `GET /profile` or `GET /cases/{id}`. Missing preconditions return `428`; stale versions return `409` with `error.details.currentRevision`. Fetch the current record and reconcile before submitting again. Successful writes return the committed ETag. `Idempotency-Key` identifies a retry of the latest mutation: identical content receives the original acknowledgement, and changed content conflicts. Browser retries retain their mutation ID until acknowledgement.

Every HTTP failure has `{ error: { status, code, message, request_id, details?, issues? } }`. `issues` appears only for validation errors. Statuses match HTTP status codes. `X-Request-ID` carries the same ID as error responses and structured request logs. A safe caller-supplied correlation ID may be reused; otherwise the service generates one. CLI errors use the same safe application codes and documented exit-code mapping.

Host/Origin and write-token checks precede parsing. API/private responses and token-bearing HTML use `Cache-Control: no-store`; hashed assets are immutable. Paths are never accepted as filesystem inputs. Configured body/rate/concurrency limits, timeouts, and bounded shutdown live in `apps/cli/src/config/http.ts`; lifecycle tests can supply smaller limits. API handlers validate outgoing DTOs before writing responses.

## Packaging and rule updates

The root package owns the installed `nl-compensation` binary. Its allowlist ships `README.md`, `apps/cli/dist`, and `apps/web/dist`. The CLI is a standalone Node bundle, including its runtime dependencies; web assets are resolved relative to the packaged layout. Smoke installs that package, exercises stdin/file calculations, writes temporary SQLite records, fetches UI/API content, and previews a merge against a fake Job Tracker.

Source validation is offline and checks provenance metadata, revision markers, hashes, and precision caveats. Updating a rule still requires human primary-source review and the procedure in [rules/2026.md](rules/2026.md). The standalone application intentionally uses native Node HTTP and existing runtime parsers; introducing a framework or replacing all parsers with another validation library would add no required boundary here.

## Calculation source updates

Government calculation data is bundled, not fetched at runtime. [rules/2026.md](rules/2026.md) owns the dated official sources and update procedure. Source validation is offline metadata/hash verification, not an automated freshness check. Private profiles/cases live in SQLite and never become a source of fiscal rules.
