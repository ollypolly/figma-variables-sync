# Future Ideas

Loosely-scoped improvements not currently in active development. Unlike [`staged-proposals-plan.md`](./staged-proposals-plan.md), nothing here is blocking or sequenced — pull an item into its own plan doc when it's actually being picked up.

> ✅ **Already shipped, kept here as a log:** Proposals/Changes tab defaults to the landing tab and leads the tab order. Recent Proposals is scoped to PRs this plugin created (via the `figma/proposal-` branch prefix). PR labels are a separate, user-configurable setting for external tagging (e.g. `patch`), decoupled from filtering. The diff list is a collapsible tree matching Figma's own Variables panel (sticky stacking headers, guide lines, colour-coded rows, expand/collapse all).

## Link to Actual Variable

From a diff entry, jump straight to the corresponding variable in Figma. Needs a spike first — the Plugin API doesn't have an obvious equivalent of `scrollAndZoomIntoView` (used for nodes) for variables, so it's unclear whether opening/focusing a specific variable in the Variables panel is possible at all via the API. Blocked on that research before any UI work.

## Design Token Consistency Pass on Plugin UI

The diff tree work (`DiffList.tsx`) left spacing/colours/radii as sporadic inline `style` px values (`GROUP_ROW_HEIGHT`, `INDENT_STEP`, `BASE_INDENT`, `ROW_GAP`, ad-hoc `padding`/`gap` strings) rather than reusing `@create-figma-plugin/ui`'s own space/border-radius tokens (`--space-*`, `--border-radius-*` in `base.css`) or its existing components (`Button`, `Container`, `VerticalSpace`) wherever one already fits. A bit ironic for a design-token-sync plugin's own UI. Worth a dedicated pass: audit `DiffList.tsx` and other components for inline `style` usage, replace with design tokens/CSS variables and existing UI primitives where they fit, and decide whether custom values (e.g. tree indentation, sticky row height) need their own local CSS custom properties for consistency.

## Multi-File Token Support

Currently the plugin syncs a single `filePath` to one JSON file. In practice, DTCG token repos often split tokens across multiple files — by category (`colors.json`, `typography.json`, `spacing.json`), by theme/mode (`light.json`, `dark.json`), by brand, or by Figma collection. Needs research:
- What does a typical Figma variables export look like when mapped to files? (collections × modes → files?)
- What does the average DTCG token spec setup look like in the wild? (single file vs. directory tree)
- How do popular tools (Style Dictionary, Tokens Studio) expect tokens to be organized?
- What changes are needed in the plugin to support syncing a directory of token files rather than a single file path?

## Token-to-Component Binding Awareness

Currently the plugin syncs variable **values** but not variable **bindings** — which variable is applied to which property on which component. Capturing this mapping (e.g. "Button background uses `brand/primary`") would let designers see the downstream impact of a token change. Needs research into whether the Figma Plugin API exposes bound-variable-to-node relationships in a way that's exportable.

**Key insight from QA:** with a semantic token layer, dev wires up component code once to semantic tokens (e.g. `background-color: var(--tokens-button-background-color)`), and semantic tokens alias to primitives (e.g. `button-background-color` → `brand/primary`). Designers then control two things without dev involvement: (1) the alias mapping — which primitive a semantic token points to, and (2) the primitive value itself. This two-layer indirection is the core value proposition — **design autonomy through semantic tokens**. The plugin already syncs primitive values and alias references; extending it to track component-to-semantic-token bindings would close the loop entirely.

## Stale Data After Merge

The GitHub contents API can take ~10 seconds to reflect a merged PR. After merging, the plugin may briefly show stale diffs. Consider a "last checked" timestamp, a short polling retry after submit, or a toast explaining the delay. Distinct from the data-loss bugs already fixed (naming collisions, metadata round-trip, orphan cleanup, merge-based proposals, diff visibility) — this is read-after-write API lag, not a correctness bug.

## Self-Service Fix for Git-Side Naming Collisions

When `computeDiff` finds a path that's quarantined on the git side but clean on Figma's side (invalid DTCG already committed to the repo — a token name doubling as a group name), today's `WarningNotice` says an engineer has to edit the file directly. But Figma is the real source of truth here, and export already guarantees Figma's current state can't have this collision — so the "correct" content for that path is knowable: whatever Figma currently has for it.

The blocker used to be mechanism: submitting a proposal replaced the *entire* git file with a full Figma export, which would fix the collision as a side effect but also clobber anything else in git that Figma doesn't have yet (another designer's pending change, dev-added metadata).

That's no longer true — merge-based proposals (`applyStagedDiffs`, patching only the paths that actually changed) have landed. This is now actionable: detect "quarantined on git, clean on Figma" paths specifically and surface them as a normal, safe, proposable diff item (e.g. "Fix invalid token structure") instead of a dead-end engineer notice.

## Hardening Backlog (carried over from the now-removed data-integrity plan)

Re-checked against the codebase after Bugs 1-5 landed (`data-integrity-fixes`) — none of these were touched by that work, so they're still open. Two other items from the original hardening list ("guard against zero-diff submits" and "prevent double-submission") turned out to already be solved pre-existing, unrelated to Bugs 1-5, so they're dropped rather than carried forward.

- **Raw Octokit errors reach the designer as-is.** `src/services/github.ts` only special-cases a 404 in `getFile`; every other call (`createBranch`, `updateFile`, `createPullRequest`, etc.) has no try/catch, so a 409 conflict, bad PAT, or rate-limit error surfaces GitHub's own API message verbatim via `StatusBanner`. Needs a mapping from common Octokit failure modes to a designer-facing message.
- **`isConfigured` doesn't validate `filePath`/`branch`.** `usePluginSettings.ts` only checks `pat`/`owner`/`repo` are truthy — a blanked `filePath` or `branch` still reads as "configured."
- **Color parsing silently falls back to black on malformed input.** `parseColor.ts` intentionally returns `{r:0,g:0,b:0,a:1}` for anything it can't parse (covered by an existing test), but this is a silent-corruption risk with no signal back to the user — worth revisiting whether it should quarantine/warn instead, consistent with how Bug 1 handles other invalid input.
- **Unresolved alias references fail silently.** `resolveDtcgValue.ts` only `console.warn`s when an alias path doesn't resolve, then falls through — for a color token this hits the color-parsing fallback above (writes solid black), for other types it writes the raw unresolved `{path}` string into the variable. No quarantine, no user-facing notice, unlike Bug 1's collision handling.

## Superseded (see linked plans)

The following used to live here as open sections but have moved to dedicated, actively-developed plans:

- **Multi-proposal branch management, proposal picker, conflict handling** → [`staged-proposals-plan.md`](./staged-proposals-plan.md)
- **"Updates" tab redesign / retirement, duplicate-proposal suppression** → [`staged-proposals-plan.md`](./staged-proposals-plan.md) Slice 3
- **Staged changes (VS Code-style stage/unstage)** → [`staged-proposals-plan.md`](./staged-proposals-plan.md) Slice 4
- **Background sync check + auto-apply** → folded into [`staged-proposals-plan.md`](./staged-proposals-plan.md) Slice 3 (3c)
- **MVP data-loss bugs, metadata round-tripping** → ✅ shipped, see PR [#11](https://github.com/ollypolly/figma-variables-sync/pull/11)

Sticky tab memory (persisting the last-active tab across sessions) was considered and dropped — the tab list is shrinking to just Changes + Settings once the Updates tab retires, so it's no longer worth the effort.

---

## 🚀 Release Process

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
