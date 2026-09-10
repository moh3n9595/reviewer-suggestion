---
title: Authentication and permissions
---

# Authentication and permissions

Suggestions are read-only; assignment is a separate, explicit write. Grant credentials for the operation you actually run — most CI installations only ever need read access.

Credentials are supplied through environment variables (CLI) or inputs (Action), are kept in transport headers, are sent only to the configured HTTPS API origin, and never appear in logs or diagnostics.

## What each operation reads and writes

| Operation | GitHub                                                                                                                                       | GitLab                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `suggest` | Repository metadata, contents, and pull requests read; authorization to list collaborators; organization/team visibility for team CODEOWNERS | `read_api`; visible project members, commits, and files; group visibility for group owners |
| `assign`  | Everything above, plus pull-request write for review requests                                                                                | `api`, plus permission to update merge-request reviewers                                   |

## GitHub credentials

Three token types work; supply any of them as the `token`:

| Credential                        | When to use it                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **GitHub App installation token** | Organization policy prohibits personal tokens, or you need org-owned, auditable, short-lived credentials |
| **Fine-grained PAT**              | Individual use with least-privilege repository selection                                                 |
| **Classic PAT / `GITHUB_TOKEN`**  | Quick trials; the workflow token where its scope suffices                                                |

### GitHub App (recommended for organizations)

Installation tokens are short-lived, org-owned, and scoped to explicitly selected repositories — the credential shape most enterprise policies require. Create an organization App with these repository permissions:

| Permission             | `suggest`      | `assign`       |
| ---------------------- | -------------- | -------------- |
| Contents               | Read           | Read           |
| Pull requests          | Read           | Read and write |
| Metadata               | Read (implied) | Read (implied) |
| Organization → Members | Read¹          | Read¹          |

¹ Only needed when CODEOWNERS references organization teams; without it, team owner resolution degrades to a reported warning rather than a failure.

In GitHub Actions, mint the token at runtime instead of storing one:

```yaml
steps:
  # Pin third-party actions to a commit SHA in your environment.
  - uses: actions/create-github-app-token@v2
    id: app-token
    with:
      app-id: ${{ vars.REVIEWER_APP_ID }}
      private-key: ${{ secrets.REVIEWER_APP_PRIVATE_KEY }}
  - uses: moh3n9595/reviewer-suggestion@v1
    with:
      token: ${{ steps.app-token.outputs.token }}
      assign: 'false'
```

Outside Actions, mint an installation token with your existing App tooling and pass it as `GITHUB_TOKEN` (CLI) or `options.token` (library). Provider creation performs no network requests, so short-lived tokens work naturally.

### Fine-grained PAT

Grant the same permission set as the App table above, restricted to the repositories involved. GitHub's per-endpoint permission reference is authoritative: [fine-grained token endpoint permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens).

### The workflow `GITHUB_TOKEN`

The default Actions token is sufficient only where it can enumerate eligible collaborators and access all requested signals; organization/team CODEOWNERS resolution usually requires an App installation token or PAT instead. Fork `pull_request` workflows receive read-only tokens and no repository secrets. See [GitHub's collaborator endpoint permissions](https://docs.github.com/en/rest/collaborators/collaborators).

## GitLab credentials

Personal, project, or group access tokens work when their user and scopes expose the required endpoints: `read_api` for suggestions, `api` for assignment. Prefer a **project access token** with the Developer role or above for CI — project-owned, scoped, and rotatable. GitLab CI job tokens (`CI_JOB_TOKEN`) are **not** a general replacement for these API permissions.

Self-managed hosts use the same tokens with `apiUrl` pointing at the instance's `/api/v4` root.

## Identity resolution

Commit emails are often private. GitHub-linked authors are preferred; otherwise known member emails and explicit `aliases` are used. Display names are never identity evidence, and ambiguous email matches are ignored rather than guessed. On GitLab, member emails are rarely visible to non-admin tokens, so explicit aliases are often necessary for historical expertise; email CODEOWNERS entries likewise need a resolvable email identity. See the [recipes guide](recipes.md) for a worked incomplete-identity setup.
