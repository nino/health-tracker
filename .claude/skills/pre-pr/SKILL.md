---
name: pre-pr
description: Review your own change before publishing it. Run this before opening a pull request (or marking a draft ready) in this repo, so the diff is checked and its findings fixed before anyone else reads it.
---

# Pre-PR review

Before you open a PR, review the change as a reviewer would and fix what you
find. A PR should reach Nino with the obvious problems already gone.

## 1. Get the diff

From the repo root, against the branch the PR will target (normally `main`):

```sh
git fetch origin main
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
```

Include uncommitted work if you have not committed yet (`git diff HEAD`).
Read the whole diff, not just the files you remember touching.

## 2. Run the checks

From `app/` (absolute path; see CLAUDE.md for why):

```sh
bun run test && bun run typecheck && bun run lint && bun run format:check
```

All four must pass. Fix failures before reviewing further, since fixes change
the diff.

## 3. Review the diff

Use a reviewer that did not write the code:

- If the `code-review` skill is available, run it on the diff.
- Otherwise start a subagent with fresh context. Give it the diff, CLAUDE.md,
  and the list below, and ask it for concrete defects with file and line.

Then read the diff yourself against this list:

- **Correctness.** Edge cases, empty inputs, off-by-one, null and
  off-platform paths (the native module wrappers are null off-platform),
  DST and timezone handling in date code, migrations on existing data.
- **Scope.** Every hunk belongs to the task. No stray debug code, commented
  out code, or unrelated reformatting.
- **Tests.** New domain logic in `src/lib/`, `src/store/`, `src/catalog/` or
  `src/backends/` has unit tests. Test files do not import `react-native` or
  `expo`.
- **Repo rules from CLAUDE.md.** Notably:
  - no edits to `app/ios` or `app/android` (prebuild output);
  - dependency policy (RN, Expo-curated, TanStack, otherwise hand-rolled);
  - adding a symptom type stays a one-line catalog change;
  - no health-store queries at launch; recency and history read the local
    store;
  - HealthKit value semantics checked against the SDK header, not memory;
  - query code follows the `react-query-tkdodo` skill.
- **Simplicity.** Code that could be removed or reuse an existing helper.
  The `simplify` skill helps here if it is available.
- **Visible changes.** If the UI changes, the PR needs screenshots (see the
  Workflow section of CLAUDE.md).

## 4. Fix, then re-check

Fix every finding you agree with. For a finding you reject, know why, so you
can say so if a reviewer raises it again. Re-run the checks in step 2 after
the fixes.

## 5. Open the PR

Mention in the PR description anything the review found that you chose not to
fix, and anything that only Nino can verify (on-device HealthKit behavior,
real authorization sheets).
