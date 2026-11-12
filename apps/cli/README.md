# `nl-compensation` CLI and local API

All machine-facing output is JSON unless `calculate --format markdown` is requested. Successful commands exit `0`; usage or contract validation exits `2`; missing, corrupt, or inaccessible private data exits `3`; unsupported engine/rule selections exit `4`.

```text
nl-compensation calculate --input <file|-> [--format json|markdown]
  [--request-id <id>] [--calculated-at <ISO timestamp>]
nl-compensation validate --input <file|->
nl-compensation rules list
nl-compensation rules show <rule-id>
nl-compensation profile show
nl-compensation profile set --input <file|->
nl-compensation case list
nl-compensation case show <case-id>
nl-compensation case save --input <file|-> [--id <case-id>]
nl-compensation tracker attach --job-id <id> --case-id <id>
  [--tracker-url <loopback-url>] [--apply]
nl-compensation serve [--port <0..65535>] [--token <32+ characters>]
```

`calculate` and `case save` accept either a version-1 compensation case or a complete version-1 calculation request envelope. A bare case selects the immutable `nl-2026-b3` bundle; an envelope must name the exact supported rule IDs and content hashes. Supplying `--calculated-at` makes a bare-case command fully reproducible. Calculation and validation never write private state.

Private records use the XDG SQLite database and revision checks described in the [architecture](../../docs/architecture.md#state-and-privacy). `profile set` and `case save` are the explicit local persistence commands. They validate before a database transaction; the database uses mode `0600` inside a mode `0700` directory.

`tracker attach` previews a compact, metadata-preserving Job Tracker merge by default. `--apply` still requires an interactive confirmation and a fresh `updated_at` check. It never posts an event or full private case.

The service binds only to `127.0.0.1` (port `3466` by default; `--port 0` asks the OS for an ephemeral port), serves the bundled browser UI, and writes its URL and unguessable session token to stderr. The API root is `/api/v1`. Profile and case writes require that token in `X-NL-Compensation-Token` and the [revision precondition](../../docs/development.md#versioned-http-contract); validation and calculation POSTs remain side-effect free. Host and Origin headers must match the loopback service origin, wildcard CORS is never sent, and API/private responses use `Cache-Control: no-store`. The entry document embeds the session token, so it is `no-store` too; only content-hashed assets are cacheable.

API request logs contain only correlation IDs, status/error codes, and durations. The startup token is printed once for the caller; it is not included in request logs. CLI I/O and unexpected runtime failures exit `3`; stale-write conflicts exit `2`.
