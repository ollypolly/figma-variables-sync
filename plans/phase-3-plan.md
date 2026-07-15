# Phase 3 Plan: Production-Ready MVP & UX Enhancements

This document outlines the plan for getting the Figma Variables Sync plugin to a shippable MVP, then layering on UX enhancements.

---

## 🚨 MVP Blockers (must fix before first real user)

> **Note:** The diagnosis and fix approaches below are best guesses from a code audit — not verified against real behaviour. Validate each one against the actual Figma export fixture before implementing. Some may be wrong, some may not matter for the real-world token files we're targeting, and the right fix may look different once we see the data.

### Bug: Figma variable naming collisions produce invalid DTCG (DATA LOSS — root cause corrected)
> **Correction:** the original diagnosis below (in `findTokens`) was wrong. Verified against the [W3C DTCG spec](https://www.designtokens.org/TR/drafts/format/) §6.1: *"A group is identified as a JSON object that does NOT contain a `$value` property... If an object contains both `$value` and child tokens/groups, this creates an invalid structure... Tools MUST report this as an error."* A node cannot legally be both a token and a group. The Goodlord fixture's `Primary` (with `$value` AND children `Hover`/`Disabled`) is **invalid DTCG**, not a valid pattern `findTokens` fails to parse.

**Actual root cause**: `exportToDtcg.ts` (line 72) builds tree paths by splitting Figma variable *names* on `/`. When a Figma variable is literally named `Primary` and sibling variables are named `Primary/Hover`, `Primary/Disabled`, `setPath.ts` collides them — depending on processing order, it either nests the `Primary` token inside itself (silently swallowing it as `$value` on a group) or overwrites the whole `Hover`/`Disabled` group with just the `Primary` token. This confirms the "setPath collision" risk already flagged below. Tested against the Goodlord fixture: **16 of 154 tokens affected across 7 colliding paths** (`Semantic.Colours.Brand.Primary`, `Status.Error`, `Status.Info`, `Status.Success`, `Status.Warning`, `Status.Neutral`, `Border.Default`).

The spec's sanctioned way to express "a token with variants" is the reserved `$root` key (§6.2) — e.g. `color/accent/$root` holds the base value, `color/accent/light`/`dark` are siblings, and `color/accent` itself stays a pure group. Adopting this would require the Figma variable to be *named* `Primary/Default` (or similar) rather than bare `Primary`, since Figma variable names — not the exporter — are the actual source of the ambiguous path.

**Decision: fail both ways, but handle each differently**, because the two sides have different fix paths:

- **Export-side (Figma → JSON)**: hard-fail, block the proposal. Self-serviceable — the designer sees exactly which Figma variables collide and can rename them right there, in the tool they're already using.
- **Import-side (Git JSON → Figma)**: the designer can't self-serve this — they don't edit Git directly, and the bad shape could be hand-authored, left by another tool, or a leftover from before the export fix. Traced every call site: `findTokens` → `parseDtcg` → `importFromDtcg`/`diff.ts`, fed by (a) this session's own `exportToDtcg` output, and (b) whatever JSON currently sits at the user's configured `filePath`/`branch` on GitHub — **not provenance-checked**, so the invalid shape can reach `findTokens` even after the exporter is fixed. Rather than hard-failing the whole parse (blocks *all* updates over one bad subtree) or silently dropping data (today's bug), **quarantine just the offending paths**: import everything else, surface a visible warning naming the broken paths.

**New shared component: "Contact an Engineer" notice.** Section 8 below already specs this concept for proposal conflicts (clear message, "Copy details" to clipboard, escape hatch) but it's never been built — confirmed nothing exists in `src/` today (`StatusBanner` is the only banner primitive, and it's just a pass/fail string, no structured detail payload or actions). Generalise it now into a reusable component rather than a proposal-specific one-off, since the principle is broader than proposals: **any situation too complex for a designer to self-serve shows this same message.** Two current consumers: this import-side quarantine warning, and the proposal-conflict flow in §8.

- [ ] Build a generic `ContactEngineerNotice` component: message + structured details (e.g. affected token paths, file/branch, error text) + "Copy details" button (clipboard) + context-specific escape-hatch action (e.g. "Delete proposal" for §8, none needed for a quarantine warning)
- [ ] In `exportToDtcg.ts`/`setPath.ts`, detect the collision while building the tree (a path that would need to be both a token and a parent of other tokens)
- [ ] On export detection, abort and surface a clear error listing the colliding Figma variable names and a suggested fix (e.g. rename `Primary` → `Primary/Default`)
- [ ] In `findTokens.ts`, detect (not silent-drop) when a node has both `$value` and non-`$` children; skip/quarantine that subtree rather than throwing for the whole parse
- [ ] Surface quarantined paths via `ContactEngineerNotice` on the Updates tab, with the affected paths in the copyable details
- [ ] Add test cases using the Goodlord fixture: export is rejected with a useful message (not silently corrupted); import succeeds for the 138 clean tokens and quarantines the 16 affected ones with a visible warning
- [ ] Fix the real Goodlord Figma file: rename the 7 colliding variables so the plugin can export successfully

### Bug: Metadata not round-tripped (DATA LOSS — confirmed)
Cross-referenced our export against three other exporters (Variables Pro, Export/Import Variables, and a Mylong export) in `example/goodlord-tokens-from-other-exporters/`. The Figma Plugin API exposes metadata that our plugin silently drops on both import and export:

**Must fix (standard DTCG + high value):**
- **`$description`** — Rich design guidance on tokens, e.g. *"The Goodlord teal. Use for primary button backgrounds, active tab indicators..."*. Standard DTCG field. Figma API: `variable.description`. Currently dropped by both the importer (never reads `$description` from JSON) and exporter (never reads `variable.description`). The Goodlord Semantic collection has detailed descriptions on nearly every token.

**Should fix (Figma-specific but prevents data loss on round-trip):**
- **`scopes`** — Which properties a variable can bind to (e.g. `["CORNER_RADIUS"]` for radius, `["GAP", "WIDTH_HEIGHT"]` for spacing, `["FRAME_FILL", "SHAPE_FILL", "STROKE_COLOR"]` for colours). Our importer hardcodes `WIDTH_HEIGHT` for all dimension types, losing the real scope. Figma API: `variable.scopes`. Would export as `$extensions.figma.scopes`.
- **`codeSyntax`** — Developer code snippets (e.g. `{"WEB": "var(--radius-xs)"}`). Figma API: `variable.codeSyntax`. Would export as `$extensions.figma.codeSyntax`.
- **`hiddenFromPublishing`** — Visibility flag. Figma API: `variable.hiddenFromPublishing`. Would export as `$extensions.figma.hiddenFromPublishing`.

**Implementation:**
- [ ] Add `$description` to `ParsedToken` type and `findTokens` parser
- [ ] Import: set `variable.description` from `$description` when present
- [ ] Export: read `variable.description` and emit `$description` when non-empty
- [ ] Add `$extensions.figma.scopes` to export, read on import to set `variable.scopes` correctly (instead of hardcoding `WIDTH_HEIGHT`)
- [ ] Add `$extensions.figma.codeSyntax` to export/import
- [ ] Add `$extensions.figma.hiddenFromPublishing` to export/import
- [ ] Preserve unknown `$`-prefixed keys and `$extensions` sub-keys during round-trip (don't strip what we don't recognise)

### Bug: Importer doesn't delete variables removed from Git (DATA LOSS — orphaned variables)
When the Updates flow imports tokens from Git, `importFromDtcg` creates/updates variables but never removes ones that no longer exist in the token file. If a designer adds a primitive in Figma, proposes it, and then the PR is reverted in Git, accepting updates will NOT delete the orphaned variable — it stays in Figma forever. The only `remove()` call in the importer (line 104) is for type-mismatch replacement, not for "this variable shouldn't exist anymore."

This needs test-driven development against the real Goodlord fixture to verify the behaviour before fixing — assumptions from code reading alone have been wrong before.

- [ ] Write a test: import a token file, then import a smaller file with a token removed → verify the variable is deleted
- [ ] Write a test: import a token file, then import with an entire collection removed → verify the collection's variables are deleted
- [ ] Decide UX: should deleted variables be removed silently, or should the Updates tab show "X variables will be removed" for confirmation?
- [ ] Implement cleanup pass in `importFromDtcg`: after creating/updating, diff existing variables against imported tokens and remove orphans
- [ ] Edge case: what if the removed variable is still bound to components on the canvas? Figma may error or leave broken bindings

### Bug: Proposals replace entire Git file instead of merging (DATA LOSS)
Git is the source of truth. The proposal flow (`useProposals.ts:67-72`) replaces the entire Git file with the Figma export. Anything the plugin didn't import into Figma — tokens dropped by the nested token-group bug, metadata (`$description`, `$extensions`), tokens from other tools/manual edits — gets silently deleted from the source of truth when a proposal PR is merged.

This is the compound effect of the other bugs: import drops data → export doesn't include it → proposal PR deletes it from Git. Even with the other bugs fixed, a full replacement is risky if Git ever contains tokens the plugin doesn't manage.

**Fix approach**: Proposals should merge changes into the existing Git file rather than replacing it. Read the current Git file, apply only the Figma-side changes (added/modified/deleted tokens from `computeDiff`), and preserve everything else. Needs test-driven validation.

- [ ] Write a test: Git file has extra keys/tokens not in Figma → proposal preserves them
- [ ] Write a test: Git file has `$description` on tokens → proposal preserves them
- [ ] Write a test: designer deletes a variable in Figma → proposal removes only that token from Git file
- [ ] Implement merge-based proposal: use `computeDiff` output to surgically update the Git JSON rather than wholesale replacing

### Feature: Update / delete existing proposal
Currently every "Create Proposal" generates a new branch + PR. No way to amend or close from the plugin. For MVP, support one active proposal at a time.

- [ ] Detect if an open `figma/proposal-*` PR already exists (already have `listPullRequests`)
- [ ] If open proposal exists: show "Update" and "Delete" actions
- [ ] If no open proposal: show "Create Proposal" as today
- [ ] Implement update flow (push to existing branch) — exact API sequence TBD
- [ ] Implement delete flow (close PR, clean up branch) — exact API sequence TBD
- [ ] Decide behaviour when creating a new proposal while one is open

### Hardening: Error handling & resilience
Raw Octokit errors may surface to designers as meaningless strings. Promises may hang if the main thread doesn't respond. Needs investigation to confirm which of these actually bite in practice.

- [ ] Audit which GitHub API errors actually reach the user and improve the worst ones
- [ ] Investigate whether message-passing hangs are a real risk or theoretical — add timeouts if so
- [ ] Add try/catch to main-thread handlers that could silently hang the UI
- [ ] Guard against submitting a proposal with zero diffs
- [ ] Prevent double-submission

### Hardening: Settings validation
- [ ] Extend `isConfigured` to check `filePath` and `branch` are non-empty
- [ ] Improve "Test Connection" to catch more setup errors (branch missing, file path wrong, insufficient PAT scopes) — scope TBD based on what users actually hit

### Edge case: Silent data corruption
These were flagged by code audit — verify each is a real problem before fixing:

- [ ] Color parsing: does it actually fall back to black for real-world inputs? Check against fixture
- [ ] Unresolved aliases: does the raw reference string cause a runtime error or just a bad value?
- [ ] Variables with undefined values: can this actually happen with real Figma data?
- [ ] Single-mode Figma plan: warn before creating a proposal that would strip mode overrides from a multi-mode Git file

---

## 🎯 Goal (UX Enhancements — post-MVP)
Improve the everyday usability of the plugin for designers by making the **Proposals** tab the default view, adding **Sticky Tab Memory** to persist state across sessions, and introducing **Background Sync Check Notifications** with warning alerts to proactively prevent Git merge conflicts.

---

## 🏗️ Architecture

Phase 3 introduces shared sync state and persistent storage access:

```
┌────────────────────────────────────────────────────────┐
│                      Figma Plugin                      │
│                                                        │
│  ┌───────────────────────┐      ┌───────────────────┐  │
│  │ Plugin Sandbox (Main) │      │ React UI (Iframe) │  │
│  │                       │      │                   │  │
│  │ - Load/Save Active Tab│◄────►│ - Sync Context    │  │
│  │ - clientStorage       │      │ - Badge Trigger   │  │
│  └───────────────────────┘      └───────────────────┘  │
└────────────────────────────────────────────────────────┘
```

1.  **Context-Aware Defaults**: Default the landing page to the **Proposals** view.
2.  **State Persistence**: Store the last active tab in `figma.clientStorage` via message handlers on `UI_CHANNEL` / `PLUGIN_CHANNEL`.
3.  **Proactive Sync Check & Auto-Apply**: On plugin load, execute a silent background fetch-and-diff. If incoming updates are found on Git that are missing locally in Figma:
    *   If there are **no unproposed local changes**, automatically apply the updates to Figma variables immediately.
    *   If there **are unproposed local changes**, do not auto-apply. Display tab notification badges, show a warning banner, and prompt the designer for confirmation before applying.

---

## 🛠️ Components to Build

### 1. Active Tab Storage Interface (`src/plugin/plugin.network.ts` & `src/ui/app.tsx`)
Add request handlers to save and retrieve the user's active tab choice:
*   **Main Thread**: Add handlers for `loadActiveTab` and `saveActiveTab` using `figma.clientStorage.getAsync("active_tab")` and `figma.clientStorage.setAsync("active_tab", tab)`.
*   **UI Thread**: Retrieve the stored tab on mount and dynamically update the active tab state of the Radix Tabs component.

### 2. Unification of Sync State (`src/ui/contexts/SyncContext.tsx` or `GitHubProvider`)
Abstract diff logic out of page/tab views into a central provider to prevent duplicate remote queries:
*   **Sync State**: Tracks `loading`, `incomingDiff` (remote vs. local), `outgoingDiff` (local vs. remote), and `lastChecked`.
*   **Trigger**: Fetches and performs diff comparison immediately when credentials are loaded.

### 3. Notifications & Banner UI (`src/ui/components/primitives/`)
*   **Tabs Header Badge**: Add CSS styles to render a small red notification indicator on the **Updates** tab trigger if `incomingDiff.length > 0`.
*   **Proposals Page Alert Banner**: If remote updates exist, display a warning banner in `Proposals.tsx` advising the designer to pull incoming updates first before making a proposal, preventing merge conflicts.

### 4. Integration Testing Strategy (`src/ui/integration-tests/`)
Before building the visual layers, we will establish integration tests for the core Phase 3 mechanisms:
*   **Storage Channel Integration**: Test that the `loadActiveTab` and `saveActiveTab` handlers correctly communicate across the `UI_CHANNEL`/`PLUGIN_CHANNEL` boundary and write to/read from a mocked `figma.clientStorage`.
*   **Sync Provider Integration**: Test the `SyncProvider` context by mocking network responses (Octokit returning modified DTCG JSON) and local variables data, asserting that:
    *   The correct diff lists (`incomingDiff` and `outgoingDiff`) are generated and populated in the context.
    *   No duplicate API requests are triggered when multiple components consume the context.
    *   Alert flags (`remoteUpdatesExist`) are correctly toggled.

### 5. Multi-File Token Support
Currently the plugin syncs a single `filePath` to one JSON file. In practice, DTCG token repos often split tokens across multiple files — by category (`colors.json`, `typography.json`, `spacing.json`), by theme/mode (`light.json`, `dark.json`), by brand, or by Figma collection. Need to research:
*   What does a typical Figma variables export look like when mapped to files? (collections × modes → files?)
*   What does the average DTCG token spec setup look like in the wild? (single file vs. directory tree)
*   How do popular tools (Style Dictionary, Tokens Studio) expect tokens to be organized?
*   What changes are needed in the plugin to support syncing a directory of token files rather than a single file path?

### 6. Token-to-Component Binding Awareness
Currently the plugin syncs variable **values** but not variable **bindings** — which variable is applied to which property on which component. Capturing this mapping (e.g. "Button background uses `brand/primary`") would let designers see the downstream impact of a token change. Needs research into whether the Figma Plugin API exposes bound-variable-to-node relationships in a way we can export.

**Key insight from QA**: With a semantic token layer, dev wires up component code once to semantic tokens (e.g. `background-color: var(--tokens-button-background-color)`), and semantic tokens alias to primitives (e.g. `button-background-color` → `brand/primary`). Designers then control two things without dev involvement: (1) the alias mapping — which primitive a semantic token points to, and (2) the primitive value itself — e.g. changing `brand/primary` from blue to red. This two-layer indirection is the core value proposition: **design autonomy through semantic tokens**. The plugin already syncs primitive values and alias references; extending it to track component-to-semantic-token bindings would close the loop entirely.

### 7. Stale Data After Merge
The GitHub contents API can take ~10 seconds to reflect a merged PR. After merging a proposal, the plugin may briefly show stale diffs. Consider adding a "last checked" timestamp, a short polling retry after submit, or a toast explaining the delay.

### 8. Multi-Proposal Branch Management
Currently, each "Create Proposal" generates a new branch (`figma/proposal-<timestamp>`) and PR, but there's no way to revisit, update, or coordinate between outstanding proposals. Several open questions:

*   **Proposal picker**: Should the Proposals tab list open PRs with a way to switch between them? A designer might want to amend an existing proposal rather than create a duplicate. The plugin already calls `listPullRequests` — this data could populate a dropdown/list that, when selected, shows the diff for that branch vs main and allows pushing additional changes onto it (via `updateFile` to the existing branch).
*   **Rebasing when main moves**: When main is updated (e.g. another proposal is merged, or a dev pushes token changes), outstanding proposal branches fall behind. Options:
    *   **Auto-rebase**: On proposal select, detect if the branch is behind main and offer a one-click rebase (GitHub API: update branch). Simple for non-conflicting changes.
    *   **Manual prompt**: Show a warning banner ("This proposal is X commits behind main") and link to GitHub for manual resolution.
    *   **Re-export and force-push**: Since the plugin always holds the current Figma state, the simplest approach may be to re-export and overwrite the branch file — effectively a force-push of the designer's current intent. This sidesteps merge mechanics entirely but loses any manual edits made on the branch.
*   **Conflict handling — "contact an engineer" philosophy**: Designers shouldn't need to understand git conflicts. When a conflict or unexpected error occurs on a proposal, use the shared `ContactEngineerNotice` component (spec'd under the naming-collision bug in MVP Blockers — same component, second consumer):
    *   Localise the error to that specific proposal (don't break the rest of the UI).
    *   Show a clear message: "This proposal has a conflict that needs an engineer to resolve."
    *   "Copy details" button copies a structured summary to the clipboard — affected token paths, branch name, PR URL, error details — so the designer can paste it to an engineer in Slack/Teams.
    *   "Delete proposal" button as the self-service escape hatch (close the PR + delete the branch via GitHub API).
    *   The 90/10 principle: smooth sailing almost always, and a clear handoff when it isn't.
*   **Closing/abandoning proposals**: Allow designers to close a PR from within the plugin (GitHub API: `PATCH /repos/{owner}/{repo}/pulls/{pull_number}` with `state: "closed"`), cleaning up stale branches. This doubles as the conflict escape hatch above.

### 9. Intelligent Diff Filtering
Two UX pain points around echo/duplicate diffs:
*   **Suppress echo diffs on Updates tab**: After proposing a change, the Updates tab shows the Git version as an "incoming update" that would revert the local edit. Need to detect open proposals from the current file and filter or label these diffs so the designer isn't confused.
*   **Suppress duplicate proposals**: If a change has already been proposed (open PR exists for that token path), the Proposals tab shouldn't show it as a new outgoing change. Could cross-reference open PR branch contents against the current diff list. Closely related to the proposal picker in §8 — if the designer can select an existing proposal, the diff should reflect what's changed since that branch, not since main.

---

## 📈 Implementation Order

1.  **Test Infrastructure & Mocks**: Set up the initial UI integration testing harness, mocking `figma.clientStorage` and background network fetch-and-diff cycles.
2.  **Storage Handlers**: Implement and test the message-passing storage logic via `figma.clientStorage` for `active_tab` values.
3.  **Shared State Refactoring**: Wrap the app in the global sync status context and write integration tests verifying diff calculation and single-fetch guarantees.
4.  **Default Landing & Sticky Tab**: Wire up and test tab restoration logic on initialization.
5.  **Badging, Warning Banners & Auto-Apply**: Build the visual notifications for the tabs header and Proposals tab, implement the auto-apply logic on open (silently applying if there are no unproposed local changes, otherwise asking first), backed by integration tests verifying warning visibility and auto-apply conditions.
6.  **Release**: Version bump, GitHub tag/release, and Figma Community publish (see release process below).

---

## 🚀 Release Process (post-Phase 3)

1. **Bump version** in `package.json` (currently `0.1.0`)
2. **Build production bundle**: `npm run build` — produces `build/main.js` and `build/ui.js` (paths declared in `manifest.json`)
3. **Verify locally**: open Figma Desktop → Plugins → Development → "Variables Sync" → run full QA checklist (`test-kit/QA.md`)
4. **Merge to main** and tag: `git tag v0.x.0 && git push --tags`, create release via `gh release create`
5. **Publish to Figma Community**:
   - In Figma Desktop: Plugins → Development → "Variables Sync" → `…` menu → "Publish new release" (or "Publish" if first time)
   - Fill in release notes, screenshots, and description
   - Figma reviews the submission (usually a few hours to a couple of days)
   - Plugin ID: `1222852692367737510` (registered in `manifest.json`)
6. **Post-publish**: verify the plugin appears on the Figma Community page and can be installed by other users
