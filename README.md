# NL Compensation

NL Compensation is a local-first Dutch employment-package calculator. It normalizes offers into comparable cash measures, then keeps fiscal estimates, household outcomes, and non-cash benefits visibly separate. Its browser, CLI, and HTTP clients use the same versioned calculation contract and immutable 2026 Dutch rules.

The tool supports offer decisions; it does not replace advice from the Belastingdienst, Dienst Toeslagen, a payroll specialist, or a financial adviser. For the supported ordinary-employee case it applies the binding 2026 monthly or four-week white wage table, but it is not a complete payroll system.

## Install

Use the Node range and pnpm version declared in [`package.json`](package.json), then run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run build:all
pnpm pack --out ./nl-compensation.tgz
npm install --global ./nl-compensation.tgz
nl-compensation --help
```

The package contains one executable and the built web assets. It does not need the source checkout after installation. For development, run the full bounded gate with `pnpm run check`.

## Concepts

- Guaranteed Annual Cash (GAC) is annual base pay plus holiday allowance not already included and other unconditionally payable gross cash. It excludes variable pay, reimbursements, employer pension, equity, tax refunds, and government allowances.
- GAC at 40 hours makes offers with different weekly hours comparable.
- Final annual income tax remains an estimate. Regular-period withholding uses the binding 2026 monthly or four-week white wage table for the supported below-AOW domestic-employee scope.
- The payroll view distinguishes a normal period's net salary, its estimated bank deposit, annual net salary paid through payroll, annual net after the estimated tax settlement, and the 12-month average. Holiday allowance and a 13th month appear as separate special-payment periods instead of being spread into the normal month.
- Household outcomes show first-calendar-year and steady-state effects separately when enough inputs exist.
- Non-cash benefits remain separate instead of being forced into one cash total.
- Exact, range, and unknown values retain their evidence, origin, lock state, assumptions, limitations, missing inputs, and derivation trace.

## CLI examples

Calculate a case without writing local state:

```sh
nl-compensation calculate --input case.json --format json \
  --calculated-at 2026-08-16T12:00:00Z
nl-compensation calculate --input case.json --format markdown
```

Validate, inspect rules, and explicitly save private state:

```sh
nl-compensation validate --input case.json
nl-compensation rules list
nl-compensation rules show nl-income-tax-2026-r2
nl-compensation profile set --input defaults.json
nl-compensation case save --id offer-a --input case.json
nl-compensation case show offer-a
```

`calculate` and `validate` accept `--input -` for stdin. JSON commands write one document to stdout. Failures write a JSON error to stderr and use stable exit codes: `0` success, `2` usage/validation or declined confirmation, `3` I/O or missing local data, and `4` an unsupported calculation request. A request can be a bare schema-version-1 case or a complete `v1` calculation envelope. Supply `--calculated-at` and `--request-id` when reproducible output bytes matter.

## Browser and local API

```sh
nl-compensation serve
# defaults to http://127.0.0.1:3466
```

The server hosts the packaged browser application and `/api/v1`. It binds only to `127.0.0.1`, rejects non-loopback Host headers and cross-origin requests, uses strict browser security headers, and serves content-hashed assets as immutable. The entry document carries the write-session token, so it is served `no-store` like every private/API response.

Profile and case writes require the unguessable session token printed when the server starts. The hosted UI receives that token for its own same-origin write buttons; API clients send it as `X-NL-Compensation-Token`. The browser automatically keeps a private draft for this origin; Settings can disable draft retention and remove the stored draft. **Save as default** and **Save case** explicitly write private records to the local SQLite database. API writes also require a revision precondition; see [the HTTP contract](docs/development.md#versioned-http-contract). Do not expose this localhost service through a proxy or public tunnel.

See [docs/development.md](docs/development.md) for the endpoint and testing contract.

## Privacy and backup

Private values are never committed. Saved profiles and cases use one local SQLite database:

```text
${XDG_DATA_HOME:-~/.local/share}/nl-compensation/compensation.sqlite3
```

The database contains profiles, cases, reports, current revisions/retry identities, and the profile's last 100 audit entries. Audit entries contain time and revision, without past private values. SQLite transactions commit related changes together; constraints and revision preconditions protect against invalid and stale writes. The database is owner-only inside an owner-only directory. Calculation rules remain bundled in the application, separate from private storage.

Only the current SQLite schema is accepted; previous file formats are not read or converted. `profile show` and `case show` inspect saved records. `case save` calculates from a case input or calculation envelope.

For a filesystem backup, stop all NL Compensation CLI/server writers and copy the whole database directory, including any `-wal` and `-shm` files. Restore the complete directory with owner-only permissions and inspect it using `profile show` or `case show`. Retain or delete backups separately. Removing the database directory while the app is stopped removes all saved records.

Browser drafts are separate from SQLite. **Settings → Remove browser draft** removes this origin's draft and disables autosave; current form values remain in memory until the tab closes. Clear this origin's site data to remove its UI preferences as well.

Job Tracker is optional and receives only five reserved summary fields. Preview the complete metadata merge first:

```sh
nl-compensation tracker attach \
  --job-id JOB_ID --case-id offer-a \
  --tracker-url http://127.0.0.1:3456
```

The default is dry-run. A real update additionally requires `--apply` and an interactive `y` confirmation. The adapter re-reads `updated_at` immediately before PATCH, aborts on drift, preserves unrelated metadata, and never creates a note event. See [docs/integration/job-tracker.md](docs/integration/job-tracker.md).

## Limits and precision

The initial rules cover ordinary 2026 Netherlands employees who are domestic taxpayers below AOW age, ordinary zorgtoeslag and huurtoeslag households, and explicitly supplied fiscal-wage adjustments. Unsupported situations return a typed limitation and no affected value. They do not silently fall through to an ordinary formula.

`fiscal.otherAnnualIncome` is fixed at €0 in this supported scope. Additional employer cash belongs in a typed cash component; freelance, business, benefits, housing, and other mixed-income categories are not silently treated alike. For a bank-deposit estimate, provide recurring post-tax payslip deductions and net reimbursements per salary period explicitly; the browser starts both at €0. Reimbursements affect the bank transfer but remain excluded from net salary, GAC, and annual compensation.

The browser's range selector chooses complete scenarios rather than changing a finished result. **Minimum** sets every numeric input range to its lower bound, **Maximum** sets every range to its upper bound, and **Average** sets every input to the midpoint before normalization and tax calculation. **Both** runs the complete Minimum and Maximum scenarios independently and shows their two results, including special payments, annual payroll net, and settlement. Every choice uses the same exact 2026 normalization and fiscal/payroll path; the tool does not search for interior extrema. Changing this view does not alter the entered ranges or the profile/case that an explicit save writes.

Not claimed exact or supported: a regular payslip whose taxable wage or deductions vary by period; pension value without complete plan inputs; private-company equity; the 30% ruling; international tax; AOW-transition years; DGA or self-employment rules; municipal assistance; and exceptional huurtoeslag cases. Published 2026 toeslagen leaflets also contain documented cent-display inconsistencies. The engine preserves exact arithmetic and official annual/whole-euro outcomes; see [docs/rules/2026.md](docs/rules/2026.md) before interpreting cent-level parts.

## Rule updates

Rule modules are immutable. Re-check the dated primary source, record its exact source hash and verification date, mint a new `-rN` module and bundle ID, add boundary and official golden tests, and update [docs/rules/2026.md](docs/rules/2026.md). Never edit a published revision in place: saved reports retain their recorded IDs and content hashes. Only the current rule bundle is supported; superseded revisions are not loaded.

See [Contributing](CONTRIBUTING.md) for questions and pull requests, and [Security](SECURITY.md) for private vulnerability reports.
