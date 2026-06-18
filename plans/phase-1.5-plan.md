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

### Step 1: Scaffold with create-figma-plugin — DONE

Merged three `create-figma-plugin` templates (preact-rectangles, preact-resizable, preact-tailwindcss) into the existing repo on branch `feature/phase-1.5-replatform`. This gives us:
- `package.json` with `figma-plugin` metadata fields (id `1222852692367737510`)
- esbuild-based build via `build-figma-plugin` (patched for Node v26 — see `patches/`)
- Preact + `@create-figma-plugin/ui` for components
- Tailwind v4 with `darkMode: ['class', '.figma-dark']` for auto Figma dark theme
- `useWindowResize` for resizable plugin window
- Typed messaging via `@create-figma-plugin/utilities`

Build pipeline: `@tailwindcss/cli` → `build-figma-plugin` → outputs `build/main.js` + `build/ui.js`

### Step 2: Port the DTCG engine — DONE

`src/common/dtcg/` copied in place (no changes needed). All 14 tests pass via vitest.

### Step 3: Port GitHubService — DONE

Moved from `src/ui/services/github.ts` → `src/services/github.ts`. No code changes — it's pure Octokit with no framework dependency. Diff utility moved from `src/ui/utils/diff.ts` → `src/common/diff.ts`.

### Step 4: Wire up the main thread — DONE

`src/main.ts` now handles:
- `REQUEST_EXPORT` → calls `exportToDtcg()` with `figma.variables` data → emits `EXPORT_RESULT`
- `REQUEST_IMPORT` → calls `importFromDtcg()` → emits `IMPORT_RESULT`
- `LOAD_SETTINGS` / `SAVE_SETTINGS` → reads/writes `figma.clientStorage`
- `RESIZE_WINDOW` → calls `figma.ui.resize()`

All event types are defined in `src/types.ts` using `EventHandler` interface pattern.

### Step 5: Rebuild the UI — DONE

Three tabs rebuilt with `@create-figma-plugin/ui` components + Preact hooks + Tailwind:

- **Settings tab** (`src/tabs/SettingsTab.tsx` + `useSettings.ts`): PAT, owner, repo, filePath, branch fields. Test Connection + Save buttons. Loads/saves via `emit`/`on` to main thread's `figma.clientStorage`.
- **Updates tab** (`src/tabs/UpdatesTab.tsx` + `useUpdates.ts`): Fetches remote DTCG from GitHub, requests local export from main thread, runs `computeDiff()`, shows diff list. Accept button triggers `REQUEST_IMPORT`.
- **Proposals tab** (`src/tabs/ProposalsTab.tsx` + `useProposals.ts`): Same fetch+diff in "proposals" mode. Description field + submit creates branch → commit → PR via `GitHubService`. Shows existing PRs.
- **Shared** (`src/components/DiffList.tsx`): Renders diff items for both tabs.

### Step 6: Integration test — deferred to Phase 2

Manual Figma integration testing moved to Phase 2 alongside test infrastructure setup.

## Current file structure

```
src/
  main.ts              — plugin main thread (Figma API + settings)
  ui.tsx               — UI entry point (Preact, tab routing)
  types.ts             — typed event definitions (EventHandler interfaces)
  css.d.ts             — declaration for !*.css imports
  input.css            — Tailwind entry point
  tabs/
    SettingsTab.tsx     — Settings tab component
    useSettings.ts     — Settings form state + save/load/test connection
    UpdatesTab.tsx     — Updates tab component
    useUpdates.ts      — Fetch remote, diff, accept updates
    ProposalsTab.tsx   — Proposals tab component
    useProposals.ts    — Fetch remote, diff, create PR
  components/
    DiffList.tsx       — Shared diff item renderer
  common/
    diff.ts            — computeDiff() — framework-agnostic
    dtcg/              — DTCG engine (exporter, importer, parser, color, utils)
  services/
    github.ts          — GitHubService class (Octokit)
patches/
  @create-figma-plugin+build+4.0.3.patch — skips typed-css-modules on Node v26
```

## Known issues

See `ISSUES.md` — resize behavior is buggy.

## Dependencies

### Runtime
- `@create-figma-plugin/ui` ^4.0.3 — Preact UI components
- `@create-figma-plugin/utilities` ^4.0.3 — messaging, settings
- `preact` >=10 — UI framework
- `@octokit/core` ^7.0.6 — GitHub API client

### Dev
- `@create-figma-plugin/build` ^4.0.3 — esbuild-based build (patched)
- `@create-figma-plugin/tsconfig` ^4.0.3 — base tsconfig
- `@figma/plugin-typings` ^1.129.0 — Figma API types
- `@tailwindcss/cli` >=4 — Tailwind CSS compiler
- `tailwindcss` >=4 — Tailwind core
- `concurrently` >=9 — parallel watch scripts
- `patch-package` ^8.0.1 — applies build patch on install
- `typescript` >=5
- `vitest` ^4.1.9 — tests for DTCG engine
