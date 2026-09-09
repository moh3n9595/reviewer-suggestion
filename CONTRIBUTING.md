# Contributing

Use the Node version pinned in `.nvmrc` and pnpm version pinned in `package.json`:

```sh
nvm install && nvm use
corepack enable
pnpm install
pnpm run verify
```

`pnpm test:watch` runs tests during development. `pnpm format` fixes formatting;
`pnpm lint:fix` fixes supported lint issues. Husky runs lint-staged before commits
and commitlint on commit messages. CI enforces the same rules even if hooks are
skipped. Tests use fixtures and never require production tokens.

Use Conventional Commits (`fix:`, `feat:`, `docs:`, etc.). A breaking change uses
`!` or a `BREAKING CHANGE:` footer. PR titles must also follow this convention;
use squash merges. Releases are driven by commits that land on `main`.

Run `pnpm build:action` and commit changes in `action-dist/` whenever runtime code
changes. CI rebuilds this bundle and checks for drift. Library `dist/` files are
built in CI and excluded from Git. Keep public API examples and TSDoc current.

Coverage must remain 100% per authored runtime source file. Exercise failure
behavior and invariants; do not exclude business logic to meet the target.
Generated bundles, declarations, test fixtures, and configuration are not runtime
coverage targets.

Keep changes focused. Explain the problem, resulting behavior, and validation in
your PR. Never include real API tokens, private commit emails, or proprietary
repository fixtures. For vulnerabilities, follow [SECURITY.md](SECURITY.md).
