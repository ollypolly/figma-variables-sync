# Phase 1 Plan: Direct PAT Sync (MVP)

This document outlines the detailed plan, architecture, and component checklist for Phase 1 (MVP) of the Figma Variables Sync plugin.

---

## 🎯 Goal
Build a 100% serverless, client-side Figma plugin that syncs native Figma variables and modes directly with a GitHub repository using a **Fine-Grained Personal Access Token (PAT)** in W3C DTCG-compliant JSON format.

---

## 🏗️ Architecture

Phase 1 operates entirely within the Figma plugin sandbox:

```
┌────────────────────────────────────────────────────────┐
│                      Figma Plugin                      │
│                                                        │
│  ┌───────────────────────┐      ┌───────────────────┐  │
│  │ Plugin Sandbox (Main) │      │ React UI (Iframe) │  │
│  │                       │      │                   │  │
│  │ - Figma Variables API │◄────►│ - Octokit/Fetch   │  │
│  │ - Translation Engine  │      │ - Settings Storage│  │
│  └───────────────────────┘      └─────────┬─────────┘  │
└───────────────────────────────────────────┼────────────┘
                                            │ HTTPS (Direct CORS)
                                            ▼
                                    GitHub REST API
```

1. **Credentials**: The user supplies a Fine-Grained PAT, restricted to a single specific repository (with `Contents: write` and `Pull requests: write` scopes).
2. **Storage**: The token and repo configuration are stored locally and securely using `figma.clientStorage`.
3. **CORS Requests**: The React UI thread makes direct API calls to `https://api.github.com` using the Octokit client with the PAT in the authorization headers. No relay backend is used.

---

## 🛠️ Components to Build

### 1. GitHub API Service (`src/ui/services/github.ts`)
A service utilizing the official **Octokit SDK (`@octokit/core`)** to execute REST requests:
- **Client Instantiation**: Integrated inside a React Context (`GitHubProvider` and `useGitHub` hook) which instantiates a cached Octokit instance with the saved PAT settings.
- **`getFile(config)`**: Fetches the current `design-tokens.json` file content, its base64 body, and its target `sha`.
- **`createBranch(config, newBranchName)`**: Finds the latest commit of the base branch and creates a new branch pointer.
- **`updateFile(config, commitMessage, contentBase64, currentSha, branchName)`**: Commits the updated tokens file to the new branch.
- **`createPullRequest(config, prTitle, prBody, headBranch)`**: Creates a Pull Request from the new branch back to the base branch.

### 2. DTCG Translation Engine (`src/common/dtcg.ts`)
A custom translator mapping Figma variables to W3C DTCG format and vice versa:
- **Export (Figma → DTCG)**:
  - Traverses local variable collections.
  - Groups modes using the `$modes` nested overrides format.
  - Maps Figma variable types (`COLOR`, `FLOAT`, `STRING`, `BOOLEAN`) to corresponding DTCG `$type` spec tags.
  - Resolves variable aliases (references) to dot-notation strings, e.g., `{color.brand.primary}`.
- **Import (DTCG → Figma)**:
  - Parses incoming DTCG JSON structures.
  - Resolves dot-notation aliases back into local Figma variable references.
  - Compares and updates native variables (value, name, type) per mode.

### 3. Proposed React UI Components & Strategy (Under Review/Discussion)

> [!NOTE]
> All UI/UX libraries, layout structures, styling methods, and terminology naming conventions described below are **proposed recommendations**. The final design system alignment, naming, and presentation screens are open for debate and will be iterated on with the user before code is implemented.

#### Proposed UI Libraries & Frameworks
- **Base Components**: Utilizing **Radix UI primitives** (e.g., tabs, dialogs) styled with custom vanilla CSS targeting Figma's native theme variables (e.g., `--figma-color-bg`, `--figma-color-text`, `--figma-color-border`) for automatic light/dark mode adaptation.
- **Proposed Design Aesthetic Goals**:
  - Replicate the layout, typography, and spacing of Figma's native **Local Variables dialog** (compact list items, grid-like columns for variable names/types/values, subtle border dividers, and distinct styling for modes).
  - Match Figma UI aesthetics using custom styles mapping to native `--figma-color-*` design tokens (for panels, inputs, tags, hover states, and button components).
- **Proposed UX Strategy (Git Abstraction)**:
  - Completely hide developer-centric terms like "Git", "GitHub", "Pull Request", "Merge Conflict", "Branch", "Commit", "Push", and "Pull".
  - Use designer-facing terms: "Updates" (incoming changes), "Propose Changes" (outgoing proposals), and "Proposal Status" (Pending, Approved, Merged).
  - The designer works in a simplified "Sync" workspace and is never exposed to the mechanics of git branching and PRs.
- **Proposed Directory Structure**: `src/ui/pages/` containing:
  - **`Settings.tsx`**: Form to configure and store the GitHub PAT, repository coordinates (owner/name), tokens file path, and target branch. (Setup/admin panel).
  - **`Updates.tsx`**: Displays a visual changelog of incoming changes (e.g. `primary: #000 → #111`) with an "Accept Updates" button.
  - **`Proposals.tsx`**: Displays outgoing variable edits, accepts a brief description of "what changed", triggers proposal creation under the hood, and tracks status of existing proposals.

---

## 📈 Implementation Order

1. **Core Translation Engine**: Write the Figma variables exporter/importer logic in `src/common/dtcg.ts`.
2. **GitHub Network Service**: Create the HTTP REST client integration in `src/ui/services/github.ts` and verify connection using a test PAT.
3. **Figma Main-UI Bridge**: Wire up `postMessage` handlers in `src/plugin/plugin.ts` and `src/ui/app.tsx` to pass parsed variables between threads.
4. **React Screens**: Build the Settings, Updates, and Proposals screens under `src/ui/pages/`, and test the complete end-to-end sync loop.
