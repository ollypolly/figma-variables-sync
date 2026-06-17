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
3. **CORS Requests**: The React UI thread makes direct `fetch` calls to `https://api.github.com` using the PAT in the authorization headers. No relay backend is used.

---

## 🛠️ Components to Build

### 1. GitHub API Service (`src/ui/services/github.ts`)
A service using native `fetch` (or a lightweight request helper) to perform the following operations:
- **`getFile(config)`**: Fetches the current `design-tokens.json` file content and its target `sha`.
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

### 3. React UI Components (`src/ui/`)
A clean, tabbed panel dashboard:
- **Settings Panel**: Form to input/edit PAT, repository owner/name, file path, and base branch.
- **Pull Panel**: Displays a changelog of differences between remote tokens and local variables, with an "Accept & Sync" button.
- **Push Panel**: Summarizes local changes, takes a PR description, and initiates the "Propose Changes" workflow.

---

## 📈 Implementation Order

1. **Core Translation Engine**: Write the Figma variables exporter/importer logic in `src/common/dtcg.ts`.
2. **GitHub Network Service**: Create the HTTP REST client integration in `src/ui/services/github.ts` and verify connection using a test PAT.
3. **Figma Main-UI Bridge**: Wire up `postMessage` handlers in `src/plugin/plugin.ts` and `src/ui/app.tsx` to pass parsed variables between threads.
4. **React Screens**: Build the Settings, Pull, and Push screens, and test the complete end-to-end sync loop.
