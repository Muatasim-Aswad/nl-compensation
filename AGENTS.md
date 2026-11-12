# NL Compensation — Agent Guide

This repository is a standalone product. Do not import application code or personal data from sibling repositories.

## Source-of-truth rules

- `packages/core` owns public, side-effect-free calculation contracts.
- `packages/rules-nl` owns immutable rule definitions and provenance.
- `apps/cli` owns explicit private persistence and optional localhost services.
- `apps/web` owns presentation and browser-local drafts; canonical profile/case writes go through the CLI-owned API.
- Job Tracker receives only the documented compact compensation summary and never becomes the source of truth for a compensation case.

All committed examples and fixtures must be synthetic. Keep XDG-style local data, environment files, generated output, dependencies, coverage, and task caches untracked.

[Architecture](docs/architecture.md) owns boundaries and layout; [development](docs/development.md) owns setup and checks. Run `pnpm run check` before handoff.

Support only current storage, API, and rule formats. Do not add compatibility readers, migrations, or superseded rule resolvers.
