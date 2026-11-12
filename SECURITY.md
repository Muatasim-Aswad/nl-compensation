# Security

Security fixes target `main` until the first release, then the latest release, on a best-effort basis.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/Muatasim-Aswad/nl-compensation/security/advisories/new). Include a minimal synthetic reproduction, affected revision, expected behavior, and impact. Keep credentials, real compensation cases, household details, and private database files out of reports and public issues.

The HTTP service is for localhost only. It binds to `127.0.0.1`, checks Host and Origin, and requires a session token and revision precondition for writes. Do not expose it through a proxy, public tunnel, or shared network. Remote access would require a separate authentication, authorization, and transport-security design.

Profiles, cases, and reports remain in local SQLite; browser drafts remain in browser storage. Only explicit Job Tracker export sends the documented compact summary to another localhost service. [Privacy and deletion](README.md#privacy-and-backup) and the [HTTP contract](docs/development.md#versioned-http-contract) describe these boundaries.
