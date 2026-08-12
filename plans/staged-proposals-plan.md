# Plan: Working on a Pull Request (Staging + Multi-Proposal Lifecycle)

Supersedes and consolidates the multi-proposal branch management, duplicate-proposal suppression, Updates tab retirement, and staged-changes ideas that used to live in `future-ideas-plan.md` (now moved here — see that doc's "Superseded" section).

✅ **Unblocked** — the data-integrity plan this was gated on (naming collisions, metadata round-trip, orphan cleanup, and Bug 4's merge-based proposals via `applyStagedDiffs`) has shipped (PR #11). This plan's Slice 4 can reuse `applyStagedDiffs` directly rather than building the same merge mechanism twice.

🚧 **Slices 1+2 implemented** — open in PR #12, not yet merged. Built as one PR since Slice 1's own "How" already called for Slice 2's mechanism directly. Also added, beyond what either slice originally scoped: a two-speed poll (fast, Figma-only re-diff every few seconds; slower GitHub-backed refresh every 30s) so the diff list stays live while the tab's open, and an optimistic local clear of the diff list right after a successful submit instead of an immediate re-fetch — GitHub's Contents API can serve a stale read for a while right after a write to the same ref, so re-fetching immediately would show wrong data with high confidence. Next: Slice 3.

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

**Designer-facing:** A "Pull Request:" dropdown at the top of the Changes tab, with "Main" plus every open PR as options (never merged/closed — draft PRs are still selectable, only closed/merged ones are excluded), and a "New Request" button next to it. Selecting a PR from the dropdown re-diffs against that branch, with a small icon-and-label link ("View PR") next to "New Request" opening it on GitHub — so only genuinely new changes (made since that branch was last pushed) show as pending, and nothing gets silently duplicated into a second PR. Hitting "New Request" resets the dropdown to "Main," going back to browsing whatever's currently different from main, ready to start a fresh PR.

**How:**
- New state: `activeProposal: { number, head_ref, title, html_url } | null` — `null` means the dropdown is on "Main." See "Persistence" below — this should survive closing/reopening the plugin, not reset every session.
- `check()`'s diff base becomes `activeProposal ? activeProposal.headRef : settings.branch`.
- The dropdown is populated from the existing `listPullRequests` call, filtered to `state === "open"`.
- "Create Pull Request" button relabels to "Update PR #4" when a PR is active, and calls `updateFile` against the existing branch (Slice 2) instead of `createBranch` + `createPullRequest`. "New Request" just sets `activeProposal` back to `null` — it doesn't touch GitHub at all, the PR stays open regardless.
- "New Request" is also what resets staleness while browsing Main (see Slice 3): `createBranch` already branches from whatever `main` currently is via `getLatestCommitSha`, so starting a fresh PR always diffs against current main for free — no separate "pull main" action needed at that moment.

**Risk:** Medium. Touches `useProposals`'s core diff/submit logic, and the smallest useful version is bigger than originally scoped — accept that up front rather than trying to ship an indicator-only version first.

### Slice 2 — Push more changes to an existing PR

**Designer-facing:** While working on a PR, hitting the submit button pushes the new changes onto that PR's branch — no new PR is created, the existing one just gets an extra commit.

**How:** `updateFile(config, message, content, sha, branchName)` already supports targeting any branch — this is mostly wiring, not new API surface. Needs the *current* file SHA on that branch (not `main`'s), so `getFile` must be called with the PR's branch as the ref.

**Risk:** Low-medium, mechanically simple given existing `GitHubService` methods, but depends on Slice 1's state existing first.

### Slice 3 — PR status check-in, staleness warning (on a PR *or* on Main), and retiring the Updates tab

Four related problems, solved together — this also absorbs the old "background sync check + auto-apply" goal, generalized beyond just PRs:

**3a. Is the selected PR still valid?** If it's merged or closed on GitHub while it's selected in the dropdown, the plugin shouldn't silently keep pushing to a dead branch. Needs a periodic/on-`check()` status check against that PR number — if it's no longer open, reset the dropdown to "Main," tell the designer ("PR #4 was merged — you're back on main"), and fall back to diffing against `main`. Slice 1's slow (30s) GitHub-backed poll already exists and already re-fetches `listPullRequests` each tick — this can likely ride on that loop rather than needing a new interval of its own.

**3b. Is `main` ahead of the PR branch?** If `main` has commits the active PR branch doesn't (another proposal merged, or a dev pushed token changes directly), show a banner: "This PR is behind main — a teammate may have changed tokens you don't have. [View on GitHub]" No auto-resolution attempted (auto-rebase was considered and dropped — see below).

**3c. Is `main` ahead of what the designer last saw, while they're just browsing Main (no active PR)?** This is the same staleness problem as 3b, just without a PR branch in the picture — e.g. a dev pushes a token change directly to `main` while a designer has the plugin open. Since `check()`'s diff base when `activeProposal` is `null` is `settings.branch` (i.e. `main` itself), this is naturally caught on the next `check()`/Refresh: the diff simply picks up main's latest content, no separate mechanism needed. The only decision left is whether to auto-apply that when there's no local Figma drift for the affected paths (silent, safe) versus always surfacing it as a change to review (matches Slice 4 staging once it exists — a git-side change appears as an "incoming" item alongside anything a designer is proposing). Lean toward auto-apply when safe, since that's what the original "background sync check" idea wanted and there's no reason to make a designer manually accept a change they have no conflicting local edit against.

**3d. Designer changes which branch the plugin points at, in Settings.** Same underlying question as 3c — is it safe to overwrite Figma's local variables with what's now on `settings.branch` — just a different trigger: a deliberate Settings save instead of main quietly advancing while stationary. Reuses 3c's exact auto-apply-when-no-local-drift logic and needs no new mechanism of its own; the goal across 3c and 3d together is the same one the designer described it as: keep Figma's variables in line with wherever the plugin is pointed, with as little manual "remember to click Import" as possible.

**How:** GitHub's compare API (`GET /repos/{owner}/{repo}/compare/{base}...{head}`) gives ahead/behind counts and PR state in one place — cleaner than separate `getLatestCommitSha` calls. Surface `behind_by > 0` as the staleness trigger for 3b; surface a closed/merged PR via `listPullRequests`' existing state field for 3a. Neither 3c nor 3d need the compare API — 3c falls out of `check()`'s existing diff-against-`main` behavior when no PR is selected, and 3d is the same check re-run once against the newly-saved `settings.branch`.

**Conflict / eject-to-dev philosophy (applies here and to Slice 2 push failures):** Designers shouldn't be asked to resolve a git conflict. If a push to an existing branch fails, or main has diverged in a way the plugin can't safely reconcile (e.g. the same token changed on both sides), the UI should:
- Localise the error to that one PR — don't break the rest of the tab.
- Say plainly: "This PR needs an engineer to untangle — [Copy details for Slack]" (structured summary: token paths, branch name, PR URL, error).
- Offer "Abandon this PR" as a self-service escape hatch (close PR + delete branch via GitHub API), so the designer isn't stuck waiting on an engineer to unblock their *next* PR, even if this one needs help.

**Auto-rebase: dropped.** A one-click "pull main into this branch" button was considered (Slice 6 in an earlier draft of this plan) and cut. Once a designer is always either on main or on a PR that's being kept in sync via this staleness check, a separate auto-rebase mechanism isn't pulling its weight — the manual "View on GitHub" link is enough, and it keeps the conflict-handling surface area smaller.

**Updates tab: retired as part of this slice.** With this model, a designer is always in one of two states — "on main" (kept in sync via 3c/3d, auto-applying safe git-side changes) or "on a PR" (kept in sync via 3a/3b). There's no longer a scenario where a standalone "incoming updates" tab is the right surface — removing the tab entirely rather than reshaping it, and folding the old background-sync-check idea into 3c/3d instead of a dedicated notification system.

**3c/3d auto-apply mechanics — not as free as it sounds:** the safety check itself is close to free (a path counts as "no local drift" exactly when it's absent from the current `diffs` array — `computeDiff` already gives us that), but the write-back isn't built yet. Specifically:
- No blocking/hard-stop is needed on branch switch — unlike git, nothing here is ever silently lost. A local experiment (a value that already differs from whatever's checked out) simply never qualifies as "no drift," so it keeps showing as a pending change against whatever's newly selected instead of being blocked or overwritten. Confirmed this holds even for a path that doesn't exist on the destination branch at all — `computeDiff` already surfaces that as an ordinary "added" item, no special case needed.
- Needs a git→Figma write-back scoped to only the safe (non-drifting) paths — the mirror of `applyStagedDiffs` (which only exists for the Figma→git direction today). Check whether `importFromDtcg` (currently used by the Updates tab) already handles a partial tree cleanly, or assumes it's given the whole file, before assuming it's reusable as-is.
- Deletions need more caution than updates: if a token was removed on the branch and Figma still has it with no drift, "auto-apply" means deleting a Figma variable — which can break bindings elsewhere in the file. Worth a deliberate decision rather than treating identically to an add/modify.
- Whether the write-back is fully silent or lightly surfaced ("Updated 3 variables from main") is a real UX call, not a given — a designer could otherwise be confused by a value changing with no visible cause.

**Risk:** Medium — needs the new compare-API call and the PR-status check-in wired into `check()`, careful copy so staleness reads as informative not alarming, the new git→Figma partial write-back above, and removing the Updates tab touches `ui.tsx`'s tab list and whatever of `useUpdates`/`UpdatesTab` isn't reused elsewhere.

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

`activeProposal` should persist across closing/reopening the plugin, not reset every session — a designer picking up work the next day shouldn't have to re-select which PR they're on. This codebase doesn't use a state-management library (no zustand/redux) — state today is plain Preact hooks (`useState` + the custom `useAsync`, see `usePluginSettings.ts`/`useGitHub.ts`), and persistence goes through `figma.clientStorage` via paired message handlers (see `SAVE_SETTINGS`/`LOAD_SETTINGS` in `src/handlers/{to,from}FigmaHandlers.ts` for the existing pattern this should mirror). `activeProposal` should follow that exact shape: a `LOAD_ACTIVE_PROPOSAL`/`SAVE_ACTIVE_PROPOSAL` handler pair, not a new store or library.

Combined with Slice 3's PR-status check-in: on load, if a persisted `activeProposal` turns out to be merged/closed, clear it and fall back to main automatically — persistence and staleness-checking work together so a designer never ends up silently stuck on a dead PR.

## Terminology (resolved)

"Pull Request:" dropdown + "New Request" button — no separate "working on" label or banner needed; the dropdown's selected value is the state. A small icon-and-label link next to the dropdown opens the PR on GitHub when one is selected; wherever else this state needs surfacing (e.g. staleness banners in Slice 3), follow the same pattern rather than a full title/description block.
