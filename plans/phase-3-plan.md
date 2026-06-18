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

---

## 📈 Implementation Order

1.  **Test Infrastructure & Mocks**: Set up the initial UI integration testing harness, mocking `figma.clientStorage` and background network fetch-and-diff cycles.
2.  **Storage Handlers**: Implement and test the message-passing storage logic via `figma.clientStorage` for `active_tab` values.
3.  **Shared State Refactoring**: Wrap the app in the global sync status context and write integration tests verifying diff calculation and single-fetch guarantees.
4.  **Default Landing & Sticky Tab**: Wire up and test tab restoration logic on initialization.
5.  **Badging and Warning Banners**: Build the visual notifications for the tabs header and Proposals tab, backed by integration tests confirming warning visibility conditions.
