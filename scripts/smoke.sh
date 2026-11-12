#!/usr/bin/env bash
set -euo pipefail

smoke_root=$(mktemp -d)
service_pid=""
tracker_pid=""

cleanup() {
  if [[ -n "$service_pid" ]]; then kill "$service_pid" 2>/dev/null || true; fi
  if [[ -n "$tracker_pid" ]]; then kill "$tracker_pid" 2>/dev/null || true; fi
  wait "$service_pid" 2>/dev/null || true
  wait "$tracker_pid" 2>/dev/null || true
  rm -rf -- "$smoke_root"
}
trap cleanup EXIT

export XDG_DATA_HOME="$smoke_root/data"
mkdir -p "$smoke_root/package" "$smoke_root/install"

pnpm pack --pack-destination "$smoke_root/package" >/dev/null
package_archive="$smoke_root/package/nl-compensation-0.1.0.tgz"
npm install --cache "$smoke_root/npm-cache" --prefix "$smoke_root/install" --no-audit --no-fund "$package_archive" >/dev/null
executable="$smoke_root/install/node_modules/.bin/nl-compensation"
fixture="scripts/fixtures/synthetic-case.json"

"$executable" calculate --input - --calculated-at 2026-08-16T12:00:00.000Z \
  <"$fixture" >"$smoke_root/calculation.json"
"$executable" case save --input "$fixture" --id synthetic-smoke-case --calculated-at 2026-08-16T12:00:00.000Z >"$smoke_root/case-save.json"
"$executable" rules list >"$smoke_root/rules.json"

smoke_port=${NL_COMPENSATION_SMOKE_PORT:-3466}
smoke_token="synthetic-smoke-token-that-is-longer-than-32-characters"
"$executable" serve --port "$smoke_port" --token "$smoke_token" >"$smoke_root/service.out" 2>"$smoke_root/service.err" &
service_pid=$!

for _ in $(seq 1 100); do
  if curl --fail --silent "http://127.0.0.1:$smoke_port/api/v1" >"$smoke_root/api.json"; then break; fi
  if ! kill -0 "$service_pid" 2>/dev/null; then
    sed -n '1,40p' "$smoke_root/service.err" >&2
    exit 1
  fi
  sleep 0.05
done
curl --fail --silent "http://127.0.0.1:$smoke_port/" >"$smoke_root/index.html"
curl --fail --silent \
  -X PUT \
  -H "Content-Type: application/json" \
  -H "X-NL-Compensation-Token: $smoke_token" \
  -H "If-None-Match: *" \
  --data-binary "@$fixture" \
  "http://127.0.0.1:$smoke_port/api/v1/profile" >"$smoke_root/profile.json"

tracker_address="$smoke_root/tracker-address"
node scripts/fake-tracker.mjs "$tracker_address" &
tracker_pid=$!
for _ in $(seq 1 100); do
  if [[ -s "$tracker_address" ]]; then break; fi
  if ! kill -0 "$tracker_pid" 2>/dev/null; then exit 1; fi
  sleep 0.05
done
"$executable" tracker attach \
  --job-id synthetic-smoke-job \
  --case-id synthetic-smoke-case \
  --tracker-url "$(tr -d '\n' <"$tracker_address")" >"$smoke_root/tracker.json"

node scripts/validate-sources.mjs
node - "$smoke_root" <<'NODE'
const { readFileSync, statSync } = require("node:fs");
const root = process.argv[2];
const readJson = (name) => JSON.parse(readFileSync(`${root}/${name}`, "utf8"));
if (!readJson("calculation.json").ok) throw new Error("packaged calculation failed");
if (!readJson("case-save.json").ok) throw new Error("packaged case save failed");
if (readJson("tracker.json").mode !== "dry-run") throw new Error("tracker smoke was not dry-run");
if (!readFileSync(`${root}/index.html`, "utf8").includes("nl-compensation-token")) {
  throw new Error("packaged UI did not receive its write-session token");
}
if ((statSync(`${process.env.XDG_DATA_HOME}/nl-compensation/compensation.sqlite3`).mode & 0o077) !== 0) {
  throw new Error("temporary SQLite database is too permissive");
}
NODE

printf '%s\n' "packaged CLI, UI, API, temporary write, and fake-tracker dry-run passed"
