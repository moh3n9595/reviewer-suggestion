---
title: CODEOWNERS compatibility
---

# CODEOWNERS compatibility

## CODEOWNERS, reviewer suggestions, and required approvals

These are three different mechanisms, and this package deliberately occupies only one of them:

- **CODEOWNERS** declares who owns paths. Your platform can use it to auto-request owners and, with branch protection, to require their approval.
- **Reviewer suggestion** (this package) ranks candidates using ownership as one signal among five — alongside commit history, recency, access, and current review load — and explains every choice with evidence. It reads CODEOWNERS; it never edits it.
- **Required approvals** are enforced by branch protection and approval rules on your platform. This package parses GitLab section approval counts as metadata boundaries only and does **not** enforce branch protection or required approvals.

They compose: keep CODEOWNERS and required approvals as your enforcement layer, and use suggestions to pick the _best_ eligible reviewer rather than any owner — especially where a path has many owners, an overloaded expert, or no owner at all.

## File locations

| Provider | Lookup order                                          |
| -------- | ----------------------------------------------------- |
| GitHub   | `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS` |
| GitLab   | `CODEOWNERS`, `docs/CODEOWNERS`, `.gitlab/CODEOWNERS` |

The file is read at the captured target/base revision, matching what the platform itself would apply to the change.

## Supported semantics

Supported on both platforms: anchored paths, basename rules, directory rules, `*`, `**`, `?`, last-match precedence, and ownerless clearing. GitLab additionally supports character classes, sections, optional sections, section defaults, direct role owners (`@@developer`, `@@maintainer`, `@@owner`), and section-local exclusions.

Platform differences are honored rather than averaged: GitLab treats owner mentions after an inline `#` as owners, while GitHub ignores inline comments; GitHub-invalid negations and character-class patterns are skipped. Paths remain case-sensitive.

## Owner resolution

Team and group ownership resolves to eligible individual users — active, non-bot members with write access or higher. GitLab group resolution honors shared-group access and group ancestry. Inaccessible resolution (for example, a token without team visibility) is reported as an optional signal warning, not a failure. Email owner entries need a resolvable email identity; see [authentication and permissions](permissions.md).
