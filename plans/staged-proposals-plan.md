# Plan: Working on a Pull Request (Staging + Multi-Proposal Lifecycle)

Supersedes and consolidates phase-3-plan.md §8 (Multi-Proposal Branch Management), the "Suppress duplicate proposals" note in §9, and §12 (Staged Proposals). Those sections remain in `phase-3-plan.md` as a historical record but should link here.

⚠️ **Gated by [`pre-staging-data-integrity-plan.md`](./pre-staging-data-integrity-plan.md)** — that plan's Bug 4 (proposals replace the entire Git file instead of merging) shares its core mechanism with this plan's Slice 4 `applyStagedDiffs`. Fix the data-integrity bugs first; the "submit everything" path here is really just "stage everything" once that groundwork exists, so building it twice would be wasted effort.

## Why this is the priority

Today, once a designer clicks "Create Pull Request," they're functionally locked out of the plugin until that PR merges:

1. Designer changes token A, creates a PR. The plugin commits their *entire* current Figma export to a brand-new branch and opens a PR.
2. Designer keeps working — changes token B.
3. The Changes tab diffs Figma against `main` only. It has no concept that token A is already sitting in an open PR, so it shows **both A and B** as pending.
4. If the designer hits "Create Pull Request" again, they get a **second PR** on a **second new branch**, containing both A and B — token A is now proposed twice, in two different PRs, and whichever merges second will conflict or silently clobber the other's intent.

There's no way today to:
- Continue working "on" a specific open PR (add more changes to it before it merges).
- See which of the current local changes already belong to an open PR vs. are genuinely new.
- Choose which changes go into *this* push vs. get held back for later.

This is the actual blocker preventing daily, continuous use of the plugin — not a nice-to-have.

## Core concept: "Working on a Pull Request"

Terminology decision: use **"Pull Request" / "PR"** as the primary UI term, not "proposal" — so designers and devs are talking about the same object when they hand off. Where the term "PR" might be unfamiliar or ambiguous to a designer, add a small `(i)` hover tooltip next to it explaining: *"A pull request is a proposal to update the tokens in the repo — an engineer reviews and merges it."* Keep "proposal" as the informal/conceptual word in explanatory copy where useful, but the literal UI label is "PR" / "Pull Request."

The mental model designers should have:

> You're always either **on main** (browsing your current changes, free to start a new PR) or **on a PR** (an open pull request you're actively adding to). While on a PR, your changes are diffed against *that PR's branch*, not against `main` — so things you've already sent for review don't keep reappearing as "new."

UI shape: a single row at the top of the Changes tab — a **"Pull Request:"** dropdown (options: "Main" + each open PR) and a **"New Request"** button next to it. There's no separate "select" action, no "working on" banner, no explicit stop/start step — the dropdown's current value *is* the state. Selecting a PR from it re-diffs against that branch; "New Request" just resets the dropdown back to "Main" (going back to browsing, ready to start a fresh PR from whatever's diffed against main). This mirrors a working branch in git without any git jargon leaking through, and without a state model any more complex than "what does the dropdown say right now."

## Value slices

Ordered smallest-safe-shippable first. Each slice is independently useful; later slices build on earlier ones.

### Slice 1 — Work on an existing PR (select, diff against it, suppress duplicates)

A read-only "already proposed" indicator on its own isn't enough to be worth shipping alone — a designer would still see it, then hit "Create Pull Request" and get a duplicate anyway, since nothing about *submitting* changed. The smallest slice that's actually useful bundles the indicator with the ability to act on it: select the PR and diff against it directly.

**Designer-facing:** A "Pull Request:" dropdown at the top of the Changes tab, with "Main" plus every open PR as options (never merged/closed — draft PRs are still selectable, only closed/merged ones are excluded), and a "New Request" button next to it. Selecting a PR from the dropdown re-diffs against that branch, with its title/link shown underneath — so only genuinely new changes (made since that branch was last pushed) show as pending, and nothing gets silently duplicated into a second PR. Hitting "New Request" resets the dropdown to "Main," going back to browsing whatever's currently different from main, ready to start a fresh PR.

**How:**
- New state: `activeProposal: { number, headRef, title, html_url } | null` — `null` means the dropdown is on "Main." See "Persistence" below — this should survive closing/reopening the plugin, not reset every session.
- `check()`'s diff base becomes `activeProposal ? activeProposal.headRef : settings.branch`.
- The dropdown is populated from the existing `listPullRequests` call, filtered to `state === "open"`.
- "Create Pull Request" button relabels to "Update PR #4" when a PR is active, and calls `updateFile` against the existing branch (Slice 2) instead of `createBranch` + `createPullRequest`. "New Request" just sets `activeProposal` back to `null` — it doesn't touch GitHub at all, the PR stays open regardless.

**Risk:** Medium. Touches `useProposals`'s core diff/submit logic, and the smallest useful version is bigger than originally scoped — accept that up front rather than trying to ship an indicator-only version first.

### Slice 2 — Push more changes to an existing PR

**Designer-facing:** While working on a PR, hitting the submit button pushes the new changes onto that PR's branch — no new PR is created, the existing one just gets an extra commit.

**How:** `updateFile(config, message, content, sha, branchName)` already supports targeting any branch — this is mostly wiring, not new API surface. Needs the *current* file SHA on that branch (not `main`'s), so `getFile` must be called with the PR's branch as the ref.

**Risk:** Low-medium, mechanically simple given existing `GitHubService` methods, but depends on Slice 1's state existing first.

### Slice 3 — PR status check-in, staleness warning, and retiring the Updates tab

Two related problems, solved together:

**3a. Is the selected PR still valid?** If it's merged or closed on GitHub while it's selected in the dropdown, the plugin shouldn't silently keep pushing to a dead branch. Needs a periodic/on-`check()` status check against that PR number — if it's no longer open, reset the dropdown to "Main," tell the designer ("PR #4 was merged — you're back on main"), and fall back to diffing against `main`.

**3b. Is `main` ahead of the PR branch?** If `main` has commits the active PR branch doesn't (another proposal merged, or a dev pushed token changes directly), show a banner: "This PR is behind main — a teammate may have changed tokens you don't have. [View on GitHub]" No auto-resolution attempted (auto-rebase was considered and dropped — see below).

**How:** GitHub's compare API (`GET /repos/{owner}/{repo}/compare/{base}...{head}`) gives ahead/behind counts and PR state in one place — cleaner than separate `getLatestCommitSha` calls. Surface `behind_by > 0` as the staleness trigger; surface a closed/merged PR via `listPullRequests`' existing state field.

**Conflict / eject-to-dev philosophy (applies here and to Slice 2 push failures):** Designers shouldn't be asked to resolve a git conflict. If a push to an existing branch fails, or main has diverged in a way the plugin can't safely reconcile (e.g. the same token changed on both sides), the UI should:
- Localise the error to that one PR — don't break the rest of the tab.
- Say plainly: "This PR needs an engineer to untangle — [Copy details for Slack]" (structured summary: token paths, branch name, PR URL, error).
- Offer "Abandon this PR" as a self-service escape hatch (close PR + delete branch via GitHub API), so the designer isn't stuck waiting on an engineer to unblock their *next* PR, even if this one needs help.

**Auto-rebase: dropped.** A one-click "pull main into this branch" button was considered (Slice 6 in an earlier draft of this plan) and cut. Once a designer is always either on main or on a PR that's being kept in sync via this staleness check, a separate auto-rebase mechanism isn't pulling its weight — the manual "View on GitHub" link is enough, and it keeps the conflict-handling surface area smaller.

**Updates tab: retired as part of this slice.** With this model, a designer is always in one of two states — "on main" (nothing pending, in sync) or "on a PR" (kept in sync via the 3a/3b checks above). There's no longer a scenario where a standalone "incoming updates" tab is the right surface: staleness relative to *main* is shown as a banner while working on a PR (3b), and there's no other case where Figma would be "behind" without the designer being on a stale PR. This also resolves phase-3-plan.md §9 ("Rethink Updates as a State, Not a Tab") by removing the tab entirely rather than reshaping it.

**Risk:** Medium — needs the new compare-API call and the PR-status check-in wired into `check()`, careful copy so staleness reads as informative not alarming, and removing the Updates tab touches `ui.tsx`'s tab list and whatever of `useUpdates`/`UpdatesTab` isn't reused elsewhere.

### Slice 4 — Staging (VS Code-style +/− on the diff tree)

**Designer-facing:** Whether the "Pull Request:" dropdown (Slice 1) is on a specific PR or on "Main," each row and group in the diff tree gets a hover-revealed `+` (stage) / `−` (unstage) rather than a checkbox, styled like VS Code's Source Control panel. There are two sections: unstaged (still just sitting in Figma) and staged (going into the next push). Submitting only pushes the staged set; the rest stay pending for later.

**How — this is the part that changes the data flow, not just the UI:**
- `DiffItem` currently only stores *display strings* (`figmaVal`/`gitVal`), not the raw DTCG token object. Staging requires reconstructing real `$value`/`$type`/`$modes` objects to build a "staged content" JSON — so a new function is needed, working off the already-parsed token trees (`parseDtcg` output), not off `DiffItem`:
  ```ts
  function applyStagedDiffs(
    baseJson: string,        // the branch's current content (main or the active PR branch)
    figmaJson: string,       // full current Figma export
    stagedDotPaths: Set<string>
  ): string
  ```
  This takes `baseJson`, and for each staged dot-path, copies that token's *current Figma* value onto the base tree (add/modify), or removes it (delete) — leaving every non-staged path exactly as `baseJson` had it. Everything not staged is simply absent from the diff between what gets submitted and what the branch already has.
- Stage state (`Set<string>` of dot-paths) is session-scoped local component state, similar to `openGroups` in `DiffList` — not persisted, since it should reset whenever Figma's actual variable state is re-checked.
- Group-level stage/unstage stages/unstages every descendant leaf; a group needs a tri-state indicator (none / some / all staged) — same shape as VS Code's partial-stage dot.

**Risk:** Highest of all slices — new core function (`applyStagedDiffs`) needs thorough test coverage (added/modified/deleted, nested paths, mode overrides) before it touches anything submitted to GitHub. This is the slice most worth having a second look at (tests-first, maybe a dry-run/preview before wiring to actual submit).

## Suggested order to build

1 → 2 → 3, ship and use for a while, THEN decide if 4 (staging) is still needed given 1+2 already stop the "duplicate reappearing" problem for most cases.

## Persistence

`activeProposal` should persist across closing/reopening the plugin, not reset every session — a designer picking up work the next day shouldn't have to re-select which PR they're on. This codebase doesn't use a state-management library (no zustand/redux) — state today is plain Preact hooks (`useState` + the custom `useAsync`, see `usePluginSettings.ts`/`useGitHub.ts`), and persistence goes through `figma.clientStorage` via message handlers, the same mechanism the (not-yet-built) "sticky tab memory" work in `phase-3-plan.md` §1–2 already plans to use. `activeProposal` should follow that exact pattern: a `LOAD_ACTIVE_PROPOSAL`/`SAVE_ACTIVE_PROPOSAL` handler pair alongside `loadActiveTab`/`saveActiveTab`, not a new store or library.

Combined with Slice 3's PR-status check-in: on load, if a persisted `activeProposal` turns out to be merged/closed, clear it and fall back to main automatically — persistence and staleness-checking work together so a designer never ends up silently stuck on a dead PR.

## Terminology (resolved)

"Pull Request:" dropdown + "New Request" button — no separate "working on" label or banner needed; the dropdown's selected value is the state. The PR's title/link is shown underneath the dropdown when a PR is selected, wherever else this state needs surfacing (e.g. staleness banners in Slice 3).
