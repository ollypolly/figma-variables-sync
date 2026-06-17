# Phase 2 Plan: UX Enhancements

This document outlines the detailed plan, architecture, and task list for Phase 2 of the Figma Variables Sync plugin, focusing on designer workflow optimizations, sticky tab memory, and conflict prevention.

---

## 🎯 Goal
Improve the everyday usability of the plugin for designers by making the **Proposals** tab the default view, adding **Sticky Tab Memory** to persist state across sessions, and introducing **Background Sync Check Notifications** with warning alerts to proactively prevent Git merge conflicts.

---

## 🏗️ Architecture

Phase 2 introduces shared sync state and persistent storage access:

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

---

## 📈 Implementation Order

1.  **Storage Handlers**: Implement the message-passing logic for saving and loading the active tab via `figma.clientStorage`.
2.  **Shared State Refactoring**: Wrap the app in a sync status context to load and hold diff states globally.
3.  **Default Landing & Sticky Tab**: Implement tab restoration logic on app initialization.
4.  **Badging and Warning Banners**: Build the visual notifications for the tabs header and Proposals tab.
