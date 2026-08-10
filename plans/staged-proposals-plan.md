# Plan: Working on a Proposal (Staging + Multi-Proposal Lifecycle)

Supersedes and consolidates phase-3-plan.md §8 (Multi-Proposal Branch Management), the "Suppress duplicate proposals" note in §9, and §12 (Staged Proposals). Those sections remain in `phase-3-plan.md` as a historical record but should link here.

## Why this is the priority

Today, once a designer clicks "Create Pull Request," they're functionally locked out of the plugin until that PR merges:

1. Designer changes token A, creates a PR. The plugin commits their *entire* current Figma export to a brand-new branch and opens a PR.
2. Designer keeps working — changes token B.
3. The Changes tab diffs Figma against `main` only. It has no concept that token A is already sitting in an open PR, so it shows **both A and B** as pending.
4. If the designer hits "Create Pull Request" again, they get a **second PR** on a **second new branch**, containing both A and B — token A is now proposed twice, in two different PRs, and whichever merges second will conflict or silently clobber the other's intent.

There's no way today to:
- Continue working "on" a specific open proposal (add more changes to it before it merges).
- See which of the current local changes already belong to an open proposal vs. are genuinely new.
- Choose which changes go into *this* push vs. get held back for later.

This is the actual blocker preventing daily, continuous use of the plugin — not a nice-to-have.

## Core concept: "Working on a Proposal"

The mental model designers should have (and the language the UI should use):

> You're always either **not working on a proposal** (browsing your current changes, free to start a new one) or **working on a proposal** (an open PR you're actively adding to). While working on a proposal, your changes are diffed against *that proposal's branch*, not against `main` — so things you've already sent for review don't keep reappearing as "new."

This mirrors a working branch in git, but described without git jargon: "Start a proposal," "Add to this proposal," "Finish this proposal" (i.e., stop actively targeting it — the PR stays open on GitHub regardless).

## Value slices

Ordered smallest-safe-shippable first. Each slice is independently useful; later slices build on earlier ones. The goal is to descope aggressively — ship slice 1 alone if that already unblocks the "created a PR, now stuck" problem well enough, and only proceed if real usage still hurts.

### Slice 1 — See what's already proposed (read-only, no new actions)

**Designer-facing:** The Changes tab shows a small note per change: "Already in PR #4" (linked), instead of silently duplicating it into a new proposal.

**How:** When `check()` runs, also diff Figma against each open proposal branch (not just `main`) using the existing `computeDiff`. For any dot-path that appears identical between Figma and an open proposal branch, tag it as `alreadyProposed: { number, html_url }` in the diff item shown to the UI — but *don't* change what "Create Pull Request" actually submits yet (still submits everything, as today). This slice is purely informational; it's the smallest step that stops a designer being confused, without touching the submit/branch logic at all.

**Risk:** Low. No change to data written to GitHub. Just an extra read (list + fetch each open proposal branch's file) and a lookup during diff rendering.

### Slice 2 — Start / stop working on a proposal (diff base switch)

**Designer-facing:** An open proposal in "Recent Proposals" gets a "Work on this" action. Once selected, the Changes tab header shows "Working on: PR #4" with an "X" to stop. While active, the diff is computed against *that proposal's branch* instead of `main` — so only genuinely new changes (made since that branch was last pushed) show as pending.

**How:**
- New local state: `activeProposal: { number, headRef } | null` (session-scoped — not persisted to `clientStorage` unless slice 5 decides otherwise).
- `check()`'s diff base becomes `activeProposal ? activeProposal.headRef : settings.branch`.
- "Create Pull Request" button relabels to "Update Proposal" when a proposal is active, and calls `updateFile` against the existing branch (see Slice 3) instead of `createBranch` + `createPullRequest`.

**Risk:** Medium. Touches `useProposals`'s core diff/submit logic. Needs care that switching *off* an active proposal correctly reverts the diff base back to `main`.

### Slice 3 — Push more changes to an existing proposal

**Designer-facing:** While working on a proposal, hitting the submit button pushes the new changes onto that PR's branch — no new PR is created, the existing one just gets an extra commit.

**How:** `updateFile(config, message, content, sha, branchName)` already supports targeting any branch — this is mostly wiring, not new API surface. Needs the *current* file SHA on that branch (not `main`'s), so `getFile` must be called with the proposal's branch as the ref.

**Risk:** Low-medium, mechanically simple given existing `GitHubService` methods, but depends on Slice 2's state existing first.

### Slice 4 — Staleness warning (main has moved on)

**Designer-facing:** If `main` has commits the active proposal branch doesn't have (e.g. another proposal merged, or a dev pushed token changes directly), show a banner: "This proposal is behind main — a teammate may have changed tokens you don't have. [Get latest]" No auto-resolution attempted.

**How:** Compare the proposal branch's base commit against `main`'s current tip. GitHub's compare API (`GET /repos/{owner}/{repo}/compare/{base}...{head}`) gives an ahead/behind count directly — cleaner than re-deriving it from `getLatestCommitSha` calls. Surface `behind_by > 0` as the trigger.

**Conflict / eject-to-dev philosophy (applies here and to Slice 3 push failures):** Designers shouldn't be asked to resolve a git conflict. If a push to an existing branch fails, or main has diverged in a way the plugin can't safely reconcile (e.g. the same token changed on both sides), the UI should:
- Localise the error to that one proposal — don't break the rest of the tab.
- Say plainly: "This proposal needs an engineer to untangle — [Copy details for Slack]" (structured summary: token paths, branch name, PR URL, error).
- Offer "Abandon this proposal" as a self-service escape hatch (close PR + delete branch via GitHub API), so the designer isn't stuck waiting on an engineer to unblock their *next* proposal, even if this one needs help.

**Risk:** Medium — needs the new compare-API call, and careful copy so it reads as informative, not alarming.

### Slice 5 — Staging (VS Code-style +/− on the diff tree)

**Designer-facing:** Within "Working on: PR #4" (or even before starting a proposal, for the very first push), each row and group in the diff tree gets a hover-revealed `+` (stage) / `−` (unstage) rather than a checkbox, styled like VS Code's Source Control panel. There are two sections: unstaged (still just sitting in Figma) and staged (going into the next push). Submitting only pushes the staged set; the rest stay pending for later.

**How — this is the part that changes the data flow, not just the UI:**
- `DiffItem` currently only stores *display strings* (`figmaVal`/`gitVal`), not the raw DTCG token object. Staging requires reconstructing real `$value`/`$type`/`$modes` objects to build a "staged content" JSON — so a new function is needed, working off the already-parsed token trees (`parseDtcg` output), not off `DiffItem`:
  ```ts
  function applyStagedDiffs(
    baseJson: string,        // the branch's current content (main or the active proposal branch)
    figmaJson: string,       // full current Figma export
    stagedDotPaths: Set<string>
  ): string
  ```
  This takes `baseJson`, and for each staged dot-path, copies that token's *current Figma* value onto the base tree (add/modify), or removes it (delete) — leaving every non-staged path exactly as `baseJson` had it. Everything not staged is simply absent from the diff between what gets submitted and what the branch already has.
- Stage state (`Set<string>` of dot-paths) is session-scoped local component state, similar to `openGroups` in `DiffList` — not persisted, since it should reset whenever Figma's actual variable state is re-checked.
- Group-level stage/unstage stages/unstages every descendant leaf; a group needs a tri-state indicator (none / some / all staged) — same shape as VS Code's partial-stage dot.

**Risk:** Highest of all slices — new core function (`applyStagedDiffs`) needs thorough test coverage (added/modified/deleted, nested paths, mode overrides) before it touches anything submitted to GitHub. This is the slice most worth having a second look at (tests-first, maybe a dry-run/preview before wiring to actual submit).

### Slice 6 (optional, likely descoped for now) — Auto-rebase

**Designer-facing:** From the staleness banner in Slice 4, a "Get latest" button that pulls main's new content into the proposal branch automatically, when there's no actual conflict.

**How:** GitHub API `POST /repos/{owner}/{repo}/merges` (merge main into the branch) or a fast-forward update-ref, only attempted when the compare API reports no conflicting paths. Given the eject-to-dev philosophy already covers the conflict case, this slice is pure convenience — reasonable to skip entirely and let every staleness case surface the banner + manual "get latest via GitHub" link.

## Suggested order to build

1 → 2 → 3 → 4, ship and use for a while, THEN decide if 5 (staging) is still needed given 2+3 already stop the "duplicate reappearing" problem for most cases. Slice 6 only if 4's manual banner proves annoying in practice.

## Open questions to resolve before starting Slice 2

- Should `activeProposal` persist across plugin reopens (`clientStorage`), or reset each session? Leaning session-scoped for now — ties into the broader Phase 3 "sticky tab memory" work, which already deals with `clientStorage` semantics.
- What happens to `activeProposal` if that PR gets merged or closed on GitHub while the designer is "on" it? Needs a check-in on every `check()` — if the tracked PR is no longer open, clear `activeProposal` and tell the designer, rather than silently pushing to a merged branch.
- Terminology bake-off: "Working on: PR #4" vs. "Proposal #4" vs. something more Figma-native. Worth a quick look at how Figma's own multiplayer/branching UI phrases similar state, if any precedent exists.
