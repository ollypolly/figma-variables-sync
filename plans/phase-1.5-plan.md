# Phase 1.5: Replatform onto create-figma-plugin

## Context

Antigravity scaffolded a working codebase in `figma-variables-sync/` using a React + Vite boilerplate template. This plan captures what's worth keeping, what needs replacing, and why — before we start building in `figma-vars-plugin/`.

## Decision: Switch to create-figma-plugin

### Why

| Concern | Current (React + Vite) | create-figma-plugin (Preact + esbuild) |
|---------|----------------------|----------------------------------------|
| Bundle size | ~40KB (React + ReactDOM) | ~4KB (Preact) |
| Build tooling | Dual Vite configs, vite-plugin-singlefile, vite-plugin-generate-file, npm-run-all | Single esbuild pipeline, zero config |
| UI components | Custom CSS Modules primitives (Button, Form, Tabs, etc.) — functional but don't match Figma's native look | `@create-figma-plugin/ui` — Preact components that visually match Figma's native panels |
| Messaging | monorepo-networker (third-party, channel-based) | Built-in typed `emit`/`on` with `EventHandler` types |
| Manifest | Manual `figma.manifest.ts` + vite-plugin-generate-file | Auto-generated from `package.json` fields |

**Bundle size matters more than usual here.** Plugin UI loads in an iframe that reopens every time the user launches the plugin. 40KB of React is 10x what Preact costs, and the iframe has no caching between opens.

**Native look matters for adoption.** An open-source plugin competing with polished commercial tools (Tokens Studio, Gitfig) needs to feel like it belongs in Figma. Rolling custom CSS Modules to approximate Figma's design language is avoidable work when `@create-figma-plugin/ui` provides it.

### What about Radix UI?

Radix primitives (`@radix-ui/react-form`, `@radix-ui/react-tabs`) are React-only — they depend on React context, `forwardRef`, and refs. They won't work with Preact without `preact/compat`, and even then compatibility is fragile. The current codebase uses Radix for Form validation and Tabs — both have direct equivalents in `@create-figma-plugin/ui`.

## Antigravity Audit

### What's portable (copy directly)

These modules are framework-agnostic pure TypeScript. They have no React/Preact dependency and existing tests:

| Module | Files | Tests | Notes |
|--------|-------|-------|-------|
| DTCG Exporter | `exporter/exportToDtcg.ts`, `exporter/getVariableDotPath.ts` | `exportToDtcg.test.ts` | Converts Figma Variables → DTCG JSON. Handles collections, modes, color conversion, variable aliases, type mapping. Solid. |
| DTCG Importer | `importer/importFromDtcg.ts`, `importer/resolveDtcgValue.ts` | `importFromDtcg.test.ts` | Two-pass import (create structures, then resolve values/aliases). Takes a `figmaInstance` param for testability. |
| DTCG Parser | `parser/parseDtcg.ts`, `parser/findTokens.ts` | — | Parses DTCG JSON into flat token list with mode overrides. Used by both exporter tests and diff. |
| Color utils | `color/figmaColorToHex.ts`, `color/parseColor.ts` | Both tested | RGBA ↔ hex conversion. |
| Naming/path utils | `utils/sanitizeName.ts`, `utils/setPath.ts`, `utils/getVariablePath.ts`, `utils/figmaTypeToDtcg.ts`, `utils/dtcgTypeToFigma.ts` | `sanitizeName.test.ts`, `getVariablePath.test.ts` | Pure helpers. |
| Diff engine | `ui/utils/diff.ts` | — | `computeDiff()` compares two DTCG JSON strings, returns added/modified/deleted items. Framework-agnostic despite living in `ui/`. |
| Types | `dtcg/types.ts` | — | `ParsedToken` interface. |

**Total: ~21 files, 6 with tests.** This is the hard part of the plugin — the DTCG ↔ Figma translation layer — and it's done.

### What's portable with minor changes

| Module | What needs changing |
|--------|-------------------|
| `GitHubService` (`ui/services/github.ts`) | Framework-agnostic (just Octokit). Currently lives in `ui/` but has no React dependency. Move to `common/` or `services/`. |
| `GitHubConfig` type | Extract from `github.ts` into a shared types file. |
| Business logic hooks (`useProposals.ts`, `useUpdates.ts`, `useSettingsForm.ts`) | The *logic* (fetch file, compute diff, create branch, commit, open PR) is reusable. The React hook wrappers need rewriting for Preact but the flow is identical — Preact's `useState`/`useEffect` have the same API. |

### What gets replaced (don't port)

| Module | Why |
|--------|-----|
| All `ui/components/primitives/` (Button, EmptyState, Flex, Form, Layout, Tabs, Text) | 13+ files of custom CSS Modules components. Replaced by `@create-figma-plugin/ui` equivalents. |
| `ui/components/business/DiffTable/` | CSS Modules component. Rebuild using `@create-figma-plugin/ui` table primitives. |
| `ui/components/business/ProposalList/` | Same — rebuild with toolkit components. |
| `monorepo-networker` + `networkSides.ts` + `app.network.tsx` + `plugin.network.ts` | Replaced by `create-figma-plugin`'s built-in `emit`/`on` messaging. |
| `GitHubProvider.tsx` (React Context) | Preact equivalent using `@create-figma-plugin/ui` patterns or a simple module-level singleton. |
| Vite configs (`vite.config.ui.ts`, `vite.config.plugin.ts`) | Replaced by `build-figma-plugin` CLI from the toolkit. |
| `figma.manifest.ts` | Plugin metadata moves to `package.json` fields. |

### What's missing (not built yet)

The current `plugin.ts` (main thread) is a **no-op** — it bootstraps monorepo-networker and shows the UI, but never calls any Figma Variables API. The DTCG engine exists but isn't wired in. This is the critical gap:

- `plugin.ts` needs to call `figma.variables.getLocalVariables()` and `getLocalVariableCollections()`, run `exportToDtcg()`, and return the result to the UI
- `plugin.ts` needs to receive DTCG JSON from the UI and call `importFromDtcg()` to write variables back
- `plugin.ts` needs to handle `loadSettings` / `saveSettings` via `figma.clientStorage`
- The `networkAccess` field is missing from the manifest — required for the UI iframe to reach `api.github.com`

## UX patterns worth keeping

The three-tab structure (Updates, Proposals, Settings) maps directly to the MVP plan. The UX flow in each tab is sound:

- **Updates**: fetch remote DTCG → diff against local → show human-readable changes → one-button accept
- **Proposals**: diff local against remote → show outgoing changes → short description form → create PR
- **Settings**: PAT + owner/repo/path/branch fields, test connection button

These flows carry over 1:1 — only the component layer changes.

## Migration plan

### Step 1: Scaffold with create-figma-plugin

Initialize the project using the toolkit's CLI. This gives us:
- `package.json` with Figma plugin metadata fields
- esbuild-based build via `build-figma-plugin`
- Preact + `@create-figma-plugin/ui` ready to use
- Typed messaging via `@create-figma-plugin/utilities`

### Step 2: Port the DTCG engine

Copy `src/common/dtcg/` wholesale. These files have no framework dependency. Run existing tests with vitest to confirm they pass in the new project.

### Step 3: Port GitHubService

Move `GitHubService` class and config types. Add `@octokit/core` as a dependency.

### Step 4: Wire up the main thread

Build `plugin.ts` properly this time:
- Export variables via `exportToDtcg()`
- Import variables via `importFromDtcg()`
- Persist settings via `figma.clientStorage`
- Communicate with UI via `emit`/`on`

### Step 5: Rebuild the UI

Recreate the three tabs using `@create-figma-plugin/ui` components. The business logic from the hooks ports with minimal changes (Preact hooks are API-compatible). The component layer is new but the UX patterns are established.

### Step 6: Integration test

Load the plugin in Figma, connect to a test repo, verify the full loop:
1. Create variables in Figma → export → PR opens correctly
2. Merge a change in the repo → plugin detects diff → accept updates variables

## Dependencies (new project)

### Runtime
- `@create-figma-plugin/utilities` — messaging, settings storage
- `@create-figma-plugin/ui` — Preact UI components
- `preact` — UI framework (pulled in by the toolkit)
- `@octokit/core` — GitHub API client

### Dev
- `@create-figma-plugin/build` — esbuild-based build
- `@figma/plugin-typings` — Figma API types
- `typescript`
- `vitest` — tests for the DTCG engine
