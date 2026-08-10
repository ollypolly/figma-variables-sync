# Phase 3 Plan: UX Enhancements

This document outlines the detailed plan, architecture, and task list for Phase 3 of the Figma Variables Sync plugin, focusing on designer workflow optimizations, sticky tab memory, and conflict prevention.

---

## 🎯 Goal
Improve the everyday usability of the plugin for designers by adding **Sticky Tab Memory** to persist state across sessions, and introducing **Background Sync Check Notifications** with warning alerts to proactively prevent Git merge conflicts.

> ✅ **Done:** Proposals is now the default landing tab and leads the tab order (see `designer-feedback-quick-wins` branch). Recent Proposals is also now scoped to PRs this plugin created (via the `figma/proposal-` branch prefix) instead of every PR against the branch. Labels are a separate, user-configurable setting purely for external tagging (e.g. `patch`), decoupled from filtering.

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

1.  ~~**Context-Aware Defaults**: Default the landing page to the **Proposals** view.~~ ✅ Done.
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
*   **Proposals Page Alert Banner**: If remote updates exist, display a warning banner in `Proposals.tsx` advising the designer to pull incoming updates first before making a proposal, preventing merge conflicts.
*   ⚠️ Superseded by §9 below: whether Updates keeps a dedicated tab badge, or whether "updates available" surfaces only as this banner, is now an open question pending that redesign.

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
⚠️ **Superseded by [`staged-proposals-plan.md`](./staged-proposals-plan.md)** — identified as the actual usability blocker (a designer is effectively locked out of the plugin once they've created a PR, since every diff always bundles into a new proposal against `main`, causing duplication). That doc consolidates this section, the "Suppress duplicate proposals" note in §9, and §12 into a single value-sliced plan. Original content kept below for history.

<details>
<summary>Original content</summary>

Currently, each "Create Proposal" generates a new branch (`figma/proposal-<timestamp>`) and PR, but there's no way to revisit, update, or coordinate between outstanding proposals. Several open questions:

*   **Proposal picker**: Should the Proposals tab list open PRs with a way to switch between them? A designer might want to amend an existing proposal rather than create a duplicate. The plugin already calls `listPullRequests` — this data could populate a dropdown/list that, when selected, shows the diff for that branch vs main and allows pushing additional changes onto it (via `updateFile` to the existing branch).
*   **Rebasing when main moves**: When main is updated (e.g. another proposal is merged, or a dev pushes token changes), outstanding proposal branches fall behind. Options:
    *   **Auto-rebase**: On proposal select, detect if the branch is behind main and offer a one-click rebase (GitHub API: update branch). Simple for non-conflicting changes.
    *   **Manual prompt**: Show a warning banner ("This proposal is X commits behind main") and link to GitHub for manual resolution.
    *   **Re-export and force-push**: Since the plugin always holds the current Figma state, the simplest approach may be to re-export and overwrite the branch file — effectively a force-push of the designer's current intent. This sidesteps merge mechanics entirely but loses any manual edits made on the branch.
*   **Conflict handling — "contact an engineer" philosophy**: Designers shouldn't need to understand git conflicts. When a conflict or unexpected error occurs on a proposal, the plugin should:
    *   Localise the error to that specific proposal (don't break the rest of the UI).
    *   Show a clear message: "This proposal has a conflict that needs an engineer to resolve."
    *   Provide a **"Copy details"** button that copies a structured summary to the clipboard — affected token paths, branch name, PR URL, error details — so the designer can paste it to an engineer in Slack/Teams.
    *   Offer a **"Delete proposal"** button as the self-service escape hatch (close the PR + delete the branch via GitHub API).
    *   The 90/10 principle: smooth sailing almost always, and a clear handoff when it isn't.
*   **Closing/abandoning proposals**: Allow designers to close a PR from within the plugin (GitHub API: `PATCH /repos/{owner}/{repo}/pulls/{pull_number}` with `state: "closed"`), cleaning up stale branches. This doubles as the conflict escape hatch above.

</details>

### 9. Rethink "Updates" as a State, Not a Tab
Designer feedback (Aug 2026): a single designer rarely has main move ahead of their local Figma state, so "Updates" as a permanent third of the tab bar is often just confusing — worse, it can actively contradict reality. If the designer has unproposed local edits, Updates can show the Git version as an "incoming update" that would *revert* their newer local work, when in fact Figma is ahead, not behind. This absorbs and reframes what was previously a separate "Intelligent Diff Filtering" section (echo diffs from your own open proposal): the fix isn't just filtering the diff list, it's questioning whether "remote is ahead" deserves a whole tab versus a contextual banner/notification that only appears when genuinely true.
*   **Detect true staleness**: Only surface "updates available" when Git actually has changes the designer doesn't have locally — cross-reference open proposals (via the `figma-variables-sync`-labelled PRs from §2/§3 quick wins) so a designer's own pending proposal is never mistaken for an incoming update.
*   **Surface as state, not a tab**: Candidate directions — a banner/badge on the Proposals tab (where designers actually spend their time, since it's now the default landing tab) rather than a standalone Updates tab; or keep Updates but only render/enable it when `incomingDiff.length > 0`.
*   **Suppress duplicate proposals**: ⚠️ Superseded by [`staged-proposals-plan.md`](./staged-proposals-plan.md) (Slices 1–2) — if a change has already been proposed (open PR exists for that token path), the Proposals tab shouldn't show it as a new outgoing change. Could cross-reference open PR branch contents against the current diff list. Closely related to the proposal picker in §8 — if the designer can select an existing proposal, the diff should reflect what's changed since that branch, not since main.
*   This needs its own design pass before implementation — not a quick fix.

### 10. Diff List Visual Redesign (match Figma's Variables panel)
Designer feedback: the current `+`/`−`/`~` prefix convention in `DiffList` reads as confusing diff-tool notation rather than a design tool. Direction: model the list after Figma's own Variables panel (left-hand indented group tree, collapsible by collection/group) instead of a flat dot-path list, and replace the +/−/~ prefixes with colour-coded highlights (e.g. green/yellow/red for added/changed/removed) on each row. Doesn't need to be a full two-pane tree/value split like Figma's — a simplified single-column version with indentation and colour is enough. Needs its own mockup/PR; not a quick win.

### 11. Link to Actual Variable
Designer feedback: from a diff or proposal entry, it'd be valuable to jump straight to the corresponding variable in Figma. Needs a spike first — the Plugin API doesn't have an obvious equivalent of `scrollAndZoomIntoView` (used for nodes) for variables, so it's unclear whether opening/focusing a specific variable in the Variables panel is possible at all via the API. Blocked on that research.

### 12. Staged Proposals (VS Code-style Stage/Unstage)
⚠️ **Superseded by [`staged-proposals-plan.md`](./staged-proposals-plan.md) (Slice 5)** — folded into the full working-on-a-proposal plan alongside §8 and the duplicate-suppression note in §9.

<details>
<summary>Original content</summary>

Designer feedback: "stage changes / checkbox to selections" — the ability to choose which of the current local changes go into a given proposal, rather than every diff always being bundled into one PR. Direction: mimic VS Code's Source Control panel — hover-revealed `+`/`−` icons per row (and per group, to stage/unstage everything under that group at once) that move an item between an unstaged "Changes" section and a "Staged Changes" section, rather than checkboxes.

*   **Two-section tree**: Reuse the tree/grouping work from §10 (now shipped), split into two regions: unstaged diffs and staged diffs. Likely two DiffList-style trees (or one tree with a staged flag per node), with `+` to stage a row/group and `−` to unstage.
*   **Partial export problem**: `submitProposal` currently commits the plugin's full current Figma-exported JSON (`check.data.figmaContent`) as the new file content on every PR. Staging only some changes means we need a step that computes "staged content" — take the git (base) JSON and apply only the staged `DiffItem`s on top of it, leaving the rest of Figma's local drift untouched for a later proposal. Needs a new function, e.g. `applyStagedDiffs(gitJson, diffs, stagedDotPaths)`.
*   **Where does stage state live?**: Probably local component state (a `Set<string>` of staged dot-paths, similar to `openGroups`), not persisted — session-scoped, reset whenever the diff is recomputed since Figma's actual variable state can change between checks.
*   **Group-level actions**: Staging a group should stage all descendant leaves; a group's icon likely needs a "mixed" state (some staged, some not), similar to VS Code's partial-stage indicators.
*   **Interaction with §8 (proposal picker)**: once a designer can select an *existing* open proposal to add to, staging becomes more relevant — they'd stage only the changes relevant to that proposal's scope, holding the rest back for a later PR.
*   This changes the diff/export data flow, not just the UI — needs its own design pass before implementation.

</details>

### 13. Design Token Consistency Pass on Plugin UI
While building the diff tree (§10), spacing/colours/radii ended up as sporadic inline `style` px values (`GROUP_ROW_HEIGHT`, `INDENT_STEP`, `BASE_INDENT`, `ROW_GAP`, ad-hoc `padding`/`gap` strings) rather than reusing `@create-figma-plugin/ui`'s own space/border-radius tokens (`--space-*`, `--border-radius-*` in `base.css`) or its existing components (`Button`, `Container`, `VerticalSpace`) wherever one already exists. A bit ironic for a design-token-sync plugin's own UI. Worth a dedicated pass: audit `DiffList.tsx` and other components for inline `style` usage, replace with design tokens/CSS variables and existing UI primitives where they fit, and decide whether custom values (e.g. tree indentation, sticky row height) need their own local CSS custom properties for consistency.

---

## 📈 Implementation Order

1.  **Test Infrastructure & Mocks**: Set up the initial UI integration testing harness, mocking `figma.clientStorage` and background network fetch-and-diff cycles.
2.  **Storage Handlers**: Implement and test the message-passing storage logic via `figma.clientStorage` for `active_tab` values.
3.  **Shared State Refactoring**: Wrap the app in the global sync status context and write integration tests verifying diff calculation and single-fetch guarantees.
4.  **Sticky Tab**: ~~Default Landing &~~ Wire up and test tab restoration logic on initialization (default landing is done — see Goal note above).
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
