# Phase 3 Plan: UX Enhancements

This document outlines the detailed plan, architecture, and task list for Phase 3 of the Figma Variables Sync plugin, focusing on designer workflow optimizations, sticky tab memory, and conflict prevention.

---

## 🎯 Goal
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
3.  **Proactive Sync Check**: On plugin load, execute a silent background fetch-and-diff. If incoming updates are found on Git that are missing locally in Figma, display tab notification badges and warning banners.

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
*   **Conflict handling — "contact an engineer" philosophy**: Designers shouldn't need to understand git conflicts. When a conflict or unexpected error occurs on a proposal, the plugin should:
    *   Localise the error to that specific proposal (don't break the rest of the UI).
    *   Show a clear message: "This proposal has a conflict that needs an engineer to resolve."
    *   Provide a **"Copy details"** button that copies a structured summary to the clipboard — affected token paths, branch name, PR URL, error details — so the designer can paste it to an engineer in Slack/Teams.
    *   Offer a **"Delete proposal"** button as the self-service escape hatch (close the PR + delete the branch via GitHub API).
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
5.  **Badging and Warning Banners**: Build the visual notifications for the tabs header and Proposals tab, backed by integration tests confirming warning visibility conditions.
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
