# Contributing

Use [Discussions](https://github.com/Muatasim-Aswad/nl-compensation/discussions) for questions and the issue form for reproducible bugs. Report security issues [privately](SECURITY.md).

Follow the [development guide](docs/development.md) for setup and run `pnpm run check` before submitting a focused pull request from a fork. Include the behavior change, relevant tests, checks run, privacy implications, and any format or compatibility implications; mark items that do not apply. Use synthetic examples only.

Keep calculations in `packages/core`, Dutch rules and provenance in `packages/rules-nl`, persistence and localhost services in `apps/cli`, and presentation in `apps/web`. Rule changes require current official sources, a new immutable revision, and boundary and published-example tests. Support only current formats; do not add compatibility readers or migrations.

Changes to `main` require passing checks and a code-owner review. The solo maintainer may deliberately use the administrator bypass for their own changes after the same checks pass, because authors cannot approve their own pull requests. Auto-merge is enabled only after deliberate maintainer review.
