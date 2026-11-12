#!/usr/bin/env bash
set -euo pipefail

pnpm install --frozen-lockfile
pnpm exec vp run verify
pnpm exec vp run build
node scripts/validate-sources.mjs
bash scripts/smoke.sh
