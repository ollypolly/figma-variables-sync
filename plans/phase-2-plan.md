# Phase 2 Plan: Portable QA Test Kit

## Prerequisites

Phase 1.5 (replatform) is complete. The plugin is rebuilt on `create-figma-plugin` (Preact + esbuild + Tailwind) with all three UI tabs (Settings, Updates, Proposals) wired up. Integration testing in Figma was deferred from phase 1.5 step 6 to this phase (Stage 2.3).

## Goal

Create a small, self-contained design system test that exercises the full plugin sync loop. Instead of dogfooding with the plugin's own UI (which is now built with `@create-figma-plugin/ui` rather than custom primitives), we provide a portable test fixture that anyone can use to QA the plugin end-to-end.

## What's in the test kit

### 1. Token set (`test-kit/tokens/design-tokens.json`)

A minimal DTCG token file with enough variety to exercise every token type the plugin supports:

- **Colors**: `brand/primary`, `brand/secondary`, `surface/background`, `surface/foreground`
- **Spacing**: `spacing/small`, `spacing/medium`, `spacing/large`
- **Border radius**: `radius/small`, `radius/full`
- **Typography** (if supported): `font/size/body`, `font/weight/bold`
- **Modes**: Light and Dark mode overrides for colors

This token set is the source of truth — it lives in a test GitHub repo and maps 1:1 to the Figma variables in the test file.

### 2. Test Figma file

A portable `.fig` file (or a community-publishable file) containing:

- A **variable collection** matching the token set above, with Light/Dark modes
- A **Button component** that consumes those variables:
  - Background → `brand/primary`
  - Text color → `surface/foreground`
  - Padding → `spacing/medium`
  - Border radius → `radius/small`
  - Hover state variant using `brand/secondary`
- A **test page** showing the button in both Light and Dark modes, so the tester can visually confirm variables are applied

The file is intentionally minimal — just enough to validate the sync round-trip without being a real design system.

### 3. QA script

A step-by-step checklist for testing the plugin:

1. **Import the test file** into your Figma drafts
2. **Install the plugin** in dev mode
3. **Configure settings**: point at the test repo + token path
4. **Test Updates flow**: tokens already exist in the repo → plugin should show "no changes" (everything in sync)
5. **Modify a variable in Figma** (e.g., change `brand/primary` to a new color)
6. **Test Proposals flow**: plugin detects the diff → create a PR → verify PR contents on GitHub
7. **Modify the token file on GitHub** (e.g., change `spacing/medium` from `16px` to `20px`)
8. **Test Updates flow**: plugin detects incoming change → accept → verify Figma variable updated
9. **Verify button component** visually reflects the new spacing

## How it ships

- The token set lives in a dedicated test repo (e.g., `ollypolly/figma-sync-test-tokens`)
- The Figma file is shared via a Figma community link or included as a downloadable `.fig` in the repo
- The QA script lives in `test-kit/QA.md`
- Contributors and beta testers can clone the test repo, import the Figma file, and run through the checklist in under 10 minutes

## Stages

### Stage 2.1: Create the token set [COMPLETE]
- [x] Write the DTCG JSON with all token types and Light/Dark modes ([design-tokens.json](file:///Users/olly/dev/figma-variables-sync/test-kit/tokens/design-tokens.json))
- [x] Add single-mode token set for Free plan compatibility ([design-tokens-single-mode.json](file:///Users/olly/dev/figma-variables-sync/test-kit/tokens/design-tokens-single-mode.json))
- [x] Verify it round-trips through the DTCG parser (written [roundtrip.test.ts](file:///Users/olly/dev/figma-variables-sync/src/common/dtcg/roundtrip.test.ts) unit test)
- [x] Build robust unit-dimension parsing (pixels, nested values) and Starter plan single-mode fallback in importer

### Stage 2.2: Build the Figma test file [COMPLETE]
- [x] Configure figma MCP server in user's dotfiles (`config/dot_claude/dot_mcp.json.tmpl` and `config/dot_gemini/`) and apply configuration
- [x] Connect to Figma file `FN7FDpzw6DpZJeibayDH2K` via the Figma plugin/MCP interface
- [x] Programmatically add variables to the Figma file from the single-mode token set ([design-tokens-single-mode.json](file:///Users/olly/dev/figma-variables-sync/test-kit/tokens/design-tokens-single-mode.json))
- [x] Programmatically create the Button component on the canvas, ensuring it binds to variables (Background Fill -> `brand/primary`, Radius -> `radius/small`, Padding -> `spacing/medium`, Text Color -> `surface/foreground`)
- [x] Programmatically build variant states (e.g. Hover state using `brand/secondary` background fill)
- [x] Create preview documentation on the canvas showing all button variant states in Light Mode (due to free plan constraints; if a Pro plan were available, we would document Dark Mode too)

### Stage 2.3: End-to-end QA [IN PROGRESS]
- [x] Load the plugin in Figma dev mode, verify build output compiles cleanly
- [x] Write up the step-by-step QA checklist as [QA.md](file:///Users/olly/dev/figma-variables-sync/test-kit/QA.md)
- [x] Add Style Dictionary token build + HTML preview page (`test-kit/build-tokens.js`, `test-kit/preview.html`)
- [x] Fix Tailwind watcher picking up test-kit files (`@source not` directive)
- [x] Fix exporter dimension/number round-trip: FLOAT variables with dimension scopes now export as `$type: "dimension"` with `px` suffix; importer sets `WIDTH_HEIGHT` scope on new dimension-type variables
- [ ] **BLOCKED**: Updates tab still shows 11 updates when Figma vars and Git tokens should be in sync
- [ ] Write a snapshot test that: (1) takes the actual Figma variable state (pulled via MCP — collection, name, type, scopes, values), (2) feeds it through `exportToDtcg`, (3) compares the exported DTCG against the Git token file (`design-tokens-single-mode.json`) to pinpoint every mismatch
- [ ] Fix the remaining round-trip mismatches identified by the snapshot test
- [ ] Run through the full QA script

### Stage 2.4: Package and publish [IN PROGRESS]
- [x] Save the local test file copy to `test-kit/figma/variables-sync-test-kit.fig`
- [x] Add setup instructions to the plugin [README.md](file:///Users/olly/dev/figma-variables-sync/README.md)
- [ ] Tag a release in the repository

---

## 📌 Claude Handover Instructions & Guidelines

When Claude picks up this work, please follow these guidelines:
1. **Figma API Key**: Do **NOT** attempt to use or request a Figma REST API key/token. The variables sync and canvas updates should run via the local Figma Desktop App plugin context (or the Figma Developer MCP server), which does not require a REST API key to perform write operations.
2. **Preview Documentation & Theme Mode**: Create the preview documentation on the canvas showing the button variant states (Normal, Hover, etc.) in **Light Mode only**. Because the target file is on a Free Figma plan, it is limited to a single mode. If we had a Pro plan, we would also render the preview documentation in Dark Mode, but under current constraints, only Light Mode should be generated.
3. **Variables Input**: Import variables from the single-mode token set: `test-kit/tokens/design-tokens-single-mode.json`.
4. **Download and Include the Figma File**: Once the Figma file setup is complete (variables added, button component created, and preview documentation generated), download/export the Figma file from Figma (via File -> Save local copy...) and place it in the repository at `test-kit/figma/variables-sync-test-kit.fig`. This ensures the `.fig` file is packaged directly into the test kit for future QA runs.
