# Release operations

Development uses pnpm; publishing uses the npm registry and npm's provenance
support through semantic-release. The first release is 1.0.0. Source manifests
remain at `0.0.0-development`; release tags and npm metadata are authoritative.

## One-time activation

1. Connect this public repository in Codecov; permit OIDC uploads. Run CI and
   confirm `codecov/project` reports 100%. The local per-file coverage gate is
   independent of Codecov.
2. Add the repository in CodeFactor, wait for analysis, resolve findings until
   grade A, and confirm its `CodeFactor` check succeeds.
3. Create the GitHub `npm` environment, restricted to the `main` branch. Configure
   branch protection to require `Release readiness`, `codecov/project`, and
   `CodeFactor`; use squash merges with Conventional Commit titles.
4. For the initial publish only, create a short-lived granular npm token with
   permission to create/publish this package and bypass 2FA for CI. Store it as
   the environment secret `NPM_BOOTSTRAP_TOKEN`. Never put the token in files.
5. Set repository variable `RELEASE_ENABLED=true`, then dispatch `release.yml`.
   Release checks independently verify the current main commit before publishing.
6. In npm package settings, configure the trusted publisher for GitHub user
   `moh3n9595`, repository `reviewer-suggestion`, workflow `release.yml`, environment
   `npm`, with **direct npm publish allowed**.
7. Remove the bootstrap secret and revoke the token. Subsequent releases use
   GitHub OIDC. Restrict traditional token publishing in npm package settings.
8. Confirm npm's provenance display points to the expected repository/workflow.
   Install the released version in a clean project and run `npm audit signatures`.

Account-owner interaction may be required for npm 2FA and service installation.
Never claim publication, coverage reporting, or a CodeFactor grade before the
respective service confirms it.

## Normal releases

Successful CI pushes on `main` trigger the release workflow. `fix` means patch,
`feat` minor, and breaking changes major. Docs/chore-only changes do not publish.
Jobs serialize publication; they install from the frozen pnpm lockfile, verify the
code, version/build/check the package, publish, and create GitHub release notes.

The Action bundle is tracked at the version's source commit. After publication
and provenance verification, its major tag (for example `v1`) moves to that commit.
Version tags such as `v1.0.0` remain immutable. Workflows use pinned Action SHAs.

## Failure recovery

Inspect the failing workflow and registry metadata before retrying. npm versions
cannot be overwritten. If publishing succeeded but release notes or the major tag
failed, repair only that metadata; do not attempt to republish the version.

semantic-release may have created a version tag before a failed publish. If the
version was **never published**, investigate and remove only that failed tag before
retrying. Do not delete successful release tags or unpublish working versions.

If a released version is defective, publish a corrective patch. Use npm deprecation
only when maintainers determine that consumers should avoid a broken version.
