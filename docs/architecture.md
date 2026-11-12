# Architecture

NL Compensation is a standalone, local-first TypeScript workspace. [Domain terminology](domain-model.md) defines its calculation layers; [development](development.md) owns setup, checks, and the HTTP contract. Sibling repositories supply neither application code nor personal defaults.

## Ownership and dependencies

```text
packages/core  <--  packages/rules-nl
      ^                    ^
      |                    |
      +------ apps/cli -----+
      +------ apps/web -----+
```

- `packages/core` owns public types, runtime validation, normalization, report contracts, and pure calculation interfaces. It cannot import browser, filesystem, network, environment, clock, profile, or Job Tracker code.
- `packages/rules-nl` owns immutable Dutch rules, formulas, manifests, provenance, and golden examples. Its only workspace dependency is core's public API.
- `apps/cli` owns calculation orchestration, explicit XDG persistence, the loopback service, static hosting, and the optional Job Tracker adapter. CLI and HTTP call the same transport-independent calculation service.
- `apps/web` owns presentation, editable browser drafts, and explicit requests to save private records through the local API. It uses public calculation contracts and never implements a second formula engine.

Workspace dependencies must be declared and acyclic. Import packages through their exported paths. Synthetic fixtures are available only through `@nl-compensation/core/testing` and test-owned files. The architecture check enforces package direction, application layers, declared dependencies, and exclusion of test helpers from production imports.

## Application layout

```text
apps/cli/src/
  entrypoints/            CLI bootstrap and server composition
  modules/compensation/   Calculation service, fiscal/household layers, ranges,
                          CLI and HTTP adapters, Markdown presentation
  modules/tracker/        Compact-summary integration and CLI adapter
  infra/                  SQLite storage and Job Tracker HTTP client
  platform/cli/           Argument, I/O, and exit-code mechanisms
  platform/http/          HTTP lifecycle, validation, security, bodies, assets
  config/                 Validated storage paths and resource limits
  shared/                 Transport-independent application errors
  test/                   Synthetic fixtures and cross-feature audits

apps/web/src/
  app/                    Bootstrap, shell, global preferences, base styles
  features/compensation/  Draft model, calculation/save hooks, API adapters,
                          formatting, copy, focused form/report components
  infra/                  Browser storage, HTTP errors, session-token access
  shared/                 UI primitives and contextual-help contracts
```

Composition roots select runtime dependencies and own lifecycles. Feature services receive inputs explicitly. Infrastructure does not import features or entrypoints. Generic transport code does not import business features. Frontend shared code has no feature or browser-integration dependency; feature code does not import the application shell.

Tailwind v4 theme tokens and base rules live in `apps/web/src/app/styles.css`; components use utilities and `shared/ui.ts` primitives. Application-owned text lives in typed copy records beside its shell, feature, or shared owner. Native `Intl` formatting uses an explicit locale; protocol numbers and domain values stay unformatted.

## Deterministic calculations

A calculation receives `CompensationCaseInput` and `CalculationContext`: engine version, caller-supplied timestamp, and exact rule selection. No ambient clock, files, environment, network, randomness, or mutable settings may affect its result. The root package version generates the shared engine-version constant.

Case and report schemas are versioned independently as `1`; the CLI-compatible calculation envelope is `v1`. Runtime parsers reject incompatible versions, currencies, units, malformed ranges, and incomplete unit contexts. Integer euro cents are authoritative; formatted currency is presentation only.

The normalization engine derives employer-package values without fiscal rules. Selected Dutch rules then derive fiscal/payroll and household estimates. Reports retain separate normalization, fiscal/payroll, household, and non-cash layers, including precision, missing inputs, assumptions, limitations, and derivation steps. Range views evaluate complete scenarios and do not search for interior extrema.

Each rule records its identity, legal/effective periods, verification date, canonical hash, and dated official sources. Bundles retain the chosen IDs and hashes. New parameters or sources require a new revision. Only the current bundle and its rule definitions are loaded; saved reports retain provenance without a compatibility resolver.

## State and privacy

The browser draft is a convenience copy of editable facts. Autosave is enabled by default, versioned, and confined to the current browser origin; it never writes a profile or saved case. Settings can disable autosave and remove its stored draft while keeping the current form in memory. Drafts contain private facts and are not backed up by the CLI. A response belongs to its exact input; stale requests are aborted and their reports are hidden during recalculation.

Profiles and saved cases are authoritative private records owned by the CLI. Explicit writes validate first and use SQLite transactions to compare revisions and commit profile/case/report changes. The database lives under XDG data storage with owner-only permissions. SQLite coordinates CLI/server writers; prepared statements bind values, and database constraints enforce identities, JSON shape markers, and report ownership. Public case/report schemas remain `1`.

Profiles, cases, reports, and profile audit history have dedicated tables. Complex versioned inputs and report data are JSON columns, with relational identity, revision, and provenance metadata. A fresh database initializes the current schema; incompatible databases are rejected, with no migration or file-format reader. Connections are scoped to each storage operation and always closed. WAL mode, a bounded busy timeout, and full synchronous commits coordinate concurrent access.

Profile data and the last 100 audit entries commit together. Audit entries contain time and revision, without previous profile values. A repeated latest mutation ID with identical content returns the prior revision; changed content conflicts. HTTP writes require an explicit revision precondition. CLI writes compare the revision observed at the start of that write, so simultaneous writers cannot silently replace one another. Fault-injection and cross-process tests verify rollback and conflict behavior.

Private storage, browser drafts, and backups have the retention/deletion procedure in [README](../README.md#privacy-and-backup). Job Tracker receives only the documented five-field summary and never owns a full case.

## HTTP runtime and errors

The service supports loopback exposure only. It checks Host and Origin before body parsing, authenticates writes before invoking storage, limits body bytes and concurrent/rate-limited work, sets request timeouts, and bounds shutdown. Configuration defaults live in `apps/cli/src/config/http.ts`.

Public TypeScript DTOs in `packages/core/src/contracts/service.ts` generate runtime JSON Schemas and OpenAPI during setup/checks. The same generated schemas validate HTTP requests and responses; domain parsers additionally enforce semantic invariants. Generated output is untracked. The calculation success envelope preserves CLI parity; HTTP failures use one error shape across validation, routing, application, and unexpected failures.

`AppError` carries safe application codes and messages. Runtime boundaries map errors to HTTP statuses or CLI exits. Unexpected failures use safe fallback messages. Each HTTP request has one correlation ID in its response header, error body, and structured log entry; logs exclude bodies, tokens, private facts, paths, and raw exception text. The CLI prints the write token once as explicit startup output, outside request logs.
