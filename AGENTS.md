# FinTrack
# Development Priority

Prioritize **implementation and feature completion** over extensive testing.

The primary goal is to build the complete FinTrack application according to the project specification. When implementing a feature:

1. Implement the feature completely and integrate it with the existing architecture.
2. Perform only **basic sanity checks** necessary to confirm that the implementation is not obviously broken.
3. Run lightweight checks such as:

   * Build/compile checks
   * Type checking
   * Linting when appropriate
   * Basic API/request verification
   * Checking obvious runtime errors
4. **Do not spend excessive time writing tests.**
5. Do not create comprehensive unit-test suites, exhaustive integration tests, extensive end-to-end tests, or large amounts of test infrastructure unless explicitly requested.
6. Do not repeatedly rewrite or retest working code without a concrete reason.
7. If a test fails, fix the underlying implementation when the problem is clear, then continue with the feature.
8. Avoid spending multiple iterations trying to achieve perfect test coverage.
9. Prefer moving on to the next feature once the current implementation passes reasonable sanity checks.
10. **Testing and comprehensive QA will be performed separately after the main implementation is complete.**

## Important

Do not interpret "production-quality" as requiring exhaustive automated testing during the initial implementation phase.

For this phase, prioritize:

**Architecture → Implementation → Integration → Basic sanity check → Next feature**

rather than:

**Architecture → Implementation → Extensive tests → More tests → Edge-case tests → Test refactoring → Next feature**

The application should still be implemented carefully and correctly. The instruction is specifically to avoid excessive testing during development, not to ignore obvious bugs or knowingly leave broken functionality.

## Migrations

Do **not** run `python manage.py migrate` automatically. Generate migrations with `makemigrations` when models change, but only run `migrate` when the user explicitly asks.

## Design

UI colors/theme: follow `docs/theme.md` (Deep Emerald primary, Mint accent, Slate neutrals). Apply starting in Phase 5 frontend work.

- This repo is a fresh, empty git init on branch `master` — no commits, no source files, no README, no package manifests. There are no build/test/lint commands to run; do not invent any.
- It is nested inside a second, also-empty git repo at `C:\Users\leomo\Desktop`. That nesting breaks git operations in the parent: `git add`/status over `FinTrack/` fails with `'FinTrack/' does not have a commit checked out` (observed in OpenCode snapshot logs). Commit or remove the nested repo before expecting parent-repo git commands to work.
