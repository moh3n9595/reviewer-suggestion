---
title: Enterprise adoption
---

# Enterprise adoption

This document consolidates the facts a security or compliance review needs. Each claim below is enforced by code or CI, not just policy.

## Data flow

All processing happens in the caller's process, on the caller's infrastructure.

- Outbound requests go **only** to the configured HTTPS API root — `api.github.com`, `gitlab.com`, or the custom host you configure. There is no telemetry, no analytics endpoint, no update check, and no AI service.
- The transport refuses non-HTTPS API roots, refuses redirects, rejects API paths that escape the configured root, and rejects API URLs containing embedded credentials.
- Tokens are held in request headers for the configured origin and are never logged; built-in log events and error messages contain counts and stable diagnostic codes, not tokens, raw API bodies, or email mappings.
- The package has **zero runtime dependencies** — the npm dependency tree is the package itself. Custom `fetch` implementations and loggers are trusted caller code.
- Suggestions are read-only. Assignment is a separate, explicit operation that is never triggered implicitly.

## Supply chain

- **Trusted publishing:** releases are published from GitHub Actions through npm's OIDC trusted-publisher flow — there is no long-lived registry token to steal. Each published version carries a provenance attestation linking it to its source commit and build workflow; inspect the **Built and signed on GitHub Actions** panel on npm and verify locally with `npm audit signatures`. See [npm provenance](https://docs.npmjs.com/generating-provenance-statements/).
- **SBOM:** each GitHub release attaches an SPDX SBOM (`sbom.spdx.json`) describing the published package. With zero runtime dependencies it contains exactly one package entry — a property your scanner can verify rather than trust.
- **Immutable references:** `v1.2.3` release tags are immutable; the moving `v1` Action tag advances only after npm provenance and GitHub Release synchronization checks pass. When policy requires immutability, pin the Action to a release commit SHA: `uses: moh3n9595/reviewer-suggestion@<commit-sha> # v1.2.3`.
- This repository's own workflows pin every third-party action by commit SHA, require reviewed PRs on `main`, and restrict publishing to a protected environment.

## Running behind a proxy or private CA

The library, CLI, and Action use Node's built-in `fetch`, which does **not** honor `HTTP_PROXY`/`HTTPS_PROXY` environment variables by default:

- On Node 24+, set `NODE_USE_ENV_PROXY=1` to enable proxy environment variables for the built-in fetch (the GitHub Action runs on Node 24).
- Library callers on any supported version can inject a proxy-capable `fetch` (for example one built on undici's `ProxyAgent`) through the provider's `fetch` option.
- For self-hosted GitHub Enterprise Server or GitLab instances with a private CA, point `NODE_EXTRA_CA_CERTS` at your CA bundle. Custom hosts must present trusted TLS certificates; the transport does not offer an insecure-skip-verify option.

## Air-gapped and mirrored installation

- The npm package installs from any registry mirror, or from a packed tarball (`npm pack reviewer-suggestion`) promoted through your artifact pipeline. Zero runtime dependencies means the mirror needs exactly one package.
- The GitHub Action's runnable bundle is committed in this repository (`action-dist/`) and attached to every release, so mirroring the repository into your GitHub Enterprise instance is sufficient — no build step, no registry access at runtime.

## Supported platforms

| Component | Requirement                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------- |
| Node.js   | 22.14 or newer; CI tests 22.14 and current 24 on Linux, macOS, and Windows                     |
| GitHub    | GitHub.com and GitHub Enterprise Server via `apiUrl` (`…/api/v3`), REST API version 2022-11-28 |
| GitLab    | GitLab.com and Self-Managed via `apiUrl` (`…/api/v4`)                                          |

API capabilities vary by host version and token visibility; the package reports missing optional signals as warnings rather than guessing, and does not claim support for every historical Enterprise/Self-Managed release.

## Determinism and auditability

Ranking is deterministic: identical inputs produce identical output, ties break on normalized username and ID, and a single captured clock (`now`) makes any past run reproducible. Every selection includes its per-signal score breakdown and file-level evidence. The `--json` CLI output and the Action's `result` output are complete decision records suitable for retention.

## Position on AI

The no-AI design is a commitment, not a gap: no model calls, no embeddings service, no data leaving your infrastructure, and no non-reproducible scores. Any future semantic capability would be an optional, clearly separated adapter — never a change to the deterministic core.

## Reporting vulnerabilities

See [SECURITY.md](https://github.com/moh3n9595/reviewer-suggestion/blob/main/SECURITY.md). Security fixes target the latest stable major release.
