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

### Stage 2.1: Create the token set
- Write the DTCG JSON with all token types and Light/Dark modes
- Push to the test repo
- Verify it round-trips through the DTCG parser (unit test)

### Stage 2.2: Build the Figma test file
- Create variables matching the token set
- Build the button component consuming those variables
- Set up Light/Dark mode variants on a test page

### Stage 2.3: End-to-end QA (includes deferred phase 1.5 integration test)
- Load the plugin in Figma dev mode, verify build output works
- Run through the full QA script
- Document any issues found
- Write up the QA checklist as `test-kit/QA.md`

### Stage 2.4: Package and publish
- Publish the Figma file (community or shareable link)
- Add setup instructions to the plugin README
- Tag a test-kit release in the test repo
