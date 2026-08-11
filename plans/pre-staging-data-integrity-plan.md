# Plan: Data Integrity Fixes Before the PR-Selection Workflow

Gates [`staged-proposals-plan.md`](./staged-proposals-plan.md). Recovered and re-verified from `origin/feature/phase-3-mvp` (a branch that diverged from `main` back in July, never merged — its plan-doc content survived, but is stale relative to what's since shipped: the diff tree redesign, branch-prefix PR filtering, etc.). This doc re-scopes that branch's "MVP Blockers" section against the *current* codebase rather than copying it verbatim.

## Why this comes first

Building "work on an existing PR" and "stage individual changes" (`staged-proposals-plan.md`) on top of an exporter/importer that silently loses data makes the eventual bug reports much harder to untangle — a designer staging "just token A" who then finds token B's description vanished from Git won't know whether staging caused it or the underlying merge-vs-replace behaviour did. Fix the data path first, so the PR-selection workflow is being built on a foundation that at minimum doesn't lose data on a plain add/modify/delete.

**Re-verified against current `main`** (this session, not carried over as an assumption): all four bugs below are still present. `setPath.ts` still does blind last-write-wins on nested paths, `importFromDtcg.ts` has no orphan-removal pass, no file reads/writes `$description`/`scopes`/`codeSyntax`/`hiddenFromPublishing` anywhere in `src/common/dtcg/`, and `useProposals.ts`'s `submit` still commits the full `figmaContent` export as the entire file body via `updateFile`, rather than merging.

## Bug 1 — Figma variable naming collisions produce invalid DTCG (data loss)

**Root cause:** `exportToDtcg.ts` builds tree paths by splitting Figma variable *names* on `/` and writing them via `setPath`. If a Figma variable is named `Primary` and sibling variables are named `Primary/Hover`, `Primary/Disabled`, `setPath` collides them — one write clobbers the other, depending on processing order. Per the [W3C DTCG spec §6.1](https://www.designtokens.org/TR/drafts/format/), a node can't legally be both a token (has `$value`) and a group (has children) — so this isn't a parser bug, the *input shape* (a Figma file with `Primary` + `Primary/Hover` as siblings) is what's invalid, and today's exporter silently mangles it instead of catching it.

The previous branch's fixture (`example/goodlord-tokens.json`, not present on current `main` — see "Bringing the fixture forward" below) found **16 of 154 tokens affected across 7 colliding paths** in the real Goodlord Design System file. That number is from July and needs re-checking against the file's current state before treating it as gospel — Goodlord's own file may have changed since.

**Fix — different handling per direction, since only one side is self-serviceable:**
- **Export (Figma → JSON):** hard-fail, block the PR. The designer sees exactly which Figma variable names collide and can rename them right there (e.g. `Primary` → `Primary/Default`), in the tool they're already using.
- **Import (Git JSON → Figma):** the designer can't fix bad JSON directly — it could be hand-authored, left by another tool, or a leftover from before the export fix ships. Quarantine just the offending subtree: import everything else, surface a visible warning naming the broken paths, rather than either dropping data silently (today) or failing the entire import over one bad subtree.

**Tasks:**
- [ ] Build `ContactEngineerNotice` (see "Shared component" below) — first consumer is this bug's import-side quarantine warning
- [ ] In `exportToDtcg.ts`, detect the collision while building the tree (a Figma variable name that would need to be both a token and a parent of other tokens) and abort export with a clear error listing the colliding variable names + a suggested rename
- [ ] In `findTokens.ts`, detect (don't silently misparse) a JSON node with both `$value` and non-`$` children; quarantine that subtree rather than throwing for the whole parse or letting it corrupt siblings
- [ ] Surface quarantined import paths via `ContactEngineerNotice`, affected paths included in the copyable details
- [ ] Re-derive the actual collision count against Goodlord's *current* Figma file state (not the July fixture) before treating this as sized/scoped
- [ ] Test cases: export rejected with a useful error for a colliding fixture; import succeeds for clean tokens and quarantines only the colliding subtree

## Bug 2 — Metadata not round-tripped (data loss)

Cross-referencing the plugin's own export against three other DTCG exporters (Variables Pro, Export/Import Variables, a Mylong export — fixtures from the old branch, need re-exporting fresh against current Goodlord state) surfaced Figma Plugin API metadata this plugin silently drops on both import and export:

**Standard DTCG, high value:**
- **`$description`** (Figma API: `variable.description`) — design guidance, e.g. *"The Goodlord teal. Use for primary button backgrounds..."*. Neither `findTokens.ts` (import) nor `exportToDtcg.ts` (export) currently reads or writes it.

**Figma-specific, but round-tripping them prevents data loss:**
- **`scopes`** (`variable.scopes`) — which properties a variable can bind to. `importFromDtcg.ts` currently hardcodes `["WIDTH_HEIGHT"]` for every dimension-type variable (see `variable.scopes = ["WIDTH_HEIGHT"]` in the create-variable branch), discarding the real scope on round-trip.
- **`codeSyntax`** (`variable.codeSyntax`) — dev-facing code snippets, e.g. `{"WEB": "var(--radius-xs)"}`.
- **`hiddenFromPublishing`** (`variable.hiddenFromPublishing`) — visibility flag.

Would export under `$extensions.figma.*` per DTCG convention for tool-specific data.

**Tasks:**
- [ ] Add `description` to `ParsedToken` (`src/common/dtcg/types.ts`) and read/write `$description` in `findTokens.ts`/`exportToDtcg.ts`
- [ ] Import: set `variable.description` from `$description` when present
- [ ] Export: read `variable.description`, emit `$description` when non-empty
- [ ] Add `$extensions.figma.scopes` export + import (replacing the `importFromDtcg.ts` hardcoded `WIDTH_HEIGHT`)
- [ ] Add `$extensions.figma.codeSyntax` export + import
- [ ] Add `$extensions.figma.hiddenFromPublishing` export + import
- [ ] Preserve unrecognised `$`-prefixed keys and `$extensions` sub-keys through a round-trip (don't strip what this plugin doesn't itself understand)

## Bug 3 — Importer never deletes variables removed from Git (orphaned variables)

`importFromDtcg.ts` (current `main`, read this session) creates and updates variables in its two passes but has no step that removes a Figma variable whose corresponding token no longer exists in the imported JSON. The only `variable.remove()` call is for type-mismatch replacement (line ~104), not for "this token was deleted upstream." A token added in Figma, proposed, then reverted in Git, leaves an orphaned variable in Figma forever after the next "Accept Updates."

**Tasks:**
- [ ] Test: import a token file, then import a smaller file with one token removed → the corresponding Figma variable is deleted
- [ ] Test: import a token file, then import with an entire collection removed → that collection's variables are deleted
- [ ] Decide UX: silent removal, or does the Updates flow need to show "N variables will be removed" before confirming? (Needs a design decision, not just an engineering one — leaning toward showing it, given the "no silent data loss" theme of this whole doc)
- [ ] Implement the cleanup pass in `importFromDtcg`: after create/update, diff existing Figma variables against the imported token set and remove anything not present
- [ ] Edge case to verify: what happens if a removed variable is still bound to a property on the canvas? (Figma may error, or leave a broken binding — needs checking against real behaviour, not assumed)

## Bug 4 — Proposals replace the entire Git file instead of merging (data loss, compounds the above)

`useProposals.ts`'s `submit` (current `main`) calls `updateFile(config, description, check.data.figmaContent, fileData?.sha, branchName)` — `figmaContent` is the *entire* current Figma export, and `updateFile` writes it as the complete new file body. Git is meant to be the source of truth, but anything Git holds that this plugin's exporter doesn't currently produce or preserve — tokens dropped by Bug 1's collision, metadata from Bug 2, tokens added by another tool or a human edit — is silently deleted the moment a PR merges.

This is the compound risk: even after Bugs 1–3 are fixed, a full-file replacement is still dangerous if Git ever contains anything the plugin doesn't fully round-trip. Fixing this is what makes the other three fixes actually durable, rather than just reducing the frequency of loss.

**Fix approach:** proposals should merge into the existing Git file rather than replace it — read the current Git file, apply only the changes `computeDiff` identifies (added/modified/deleted), and leave everything else in the Git JSON untouched.

**Tasks:**
- [ ] Test: Git file has extra keys/tokens the current Figma state doesn't have → a PR preserves them untouched
- [ ] Test: Git file has `$description` (once Bug 2 lands) → a PR preserves it for tokens that weren't touched
- [ ] Test: a variable was deleted in Figma → the PR removes only that token from the Git file, nothing else
- [ ] Implement a merge function using `computeDiff`'s output to surgically patch the Git JSON instead of replacing it wholesale — note this is close in shape to `applyStagedDiffs` from `staged-proposals-plan.md` Slice 4 (apply a specific set of diffs onto a base JSON); worth designing them together or reusing the same core function, since "submit everything" is just "stage everything" in that model

## Shared component: `ContactEngineerNotice`

Referenced by Bug 1's quarantine warning here, and by the "eject to dev" conflict handling in `staged-proposals-plan.md` Slice 3. Confirmed nothing like this exists in `src/` yet — `StatusBanner` is the only banner primitive today, and it's a plain pass/fail string with no structured detail payload or actions.

Build it generically now rather than as a one-off for either consumer:
- [ ] Message + structured details (affected token paths, file/branch, error text)
- [ ] "Copy details" button (clipboard) — the structured details, formatted for pasting into Slack/Teams
- [ ] Optional context-specific escape-hatch action slot (e.g. "Delete proposal" for the staged-proposals conflict case; none needed for a quarantine warning)

## Hardening (deferred until the data-loss bugs are closed)

Hardening around flows that are about to change shape (Bug 4's merge-based proposals, Bug 3's importer cleanup) is wasted effort if done first — the error paths, edge cases, and even which functions exist will shift once those land. Do this pass after, not alongside.

- [ ] Audit which raw Octokit errors currently reach the designer as-is, and improve the worst ones
- [ ] Guard against submitting a PR with zero diffs
- [ ] Prevent double-submission (rapid double-click on "Create Pull Request")
- [ ] Extend `isConfigured` (Settings) to check `filePath`/`branch` are non-empty, not just present
- [ ] Verify color parsing's fallback behavior against real malformed input (or confirm it's a non-issue)
- [ ] Verify what happens with an unresolved alias reference at runtime (error vs. silently bad value)

## Bringing the fixture forward

The old branch's `example/goodlord-tokens.json` and the cross-exporter comparison files (`example/goodlord-tokens-from-other-exporters/*`) aren't on current `main` — they were the evidence base for Bug 1's "16 of 154" and Bug 2's metadata findings. Before implementing, re-export fresh fixtures from the real Goodlord file (it may have already changed since July) rather than trusting the numbers in this doc as still-accurate. `git show origin/feature/phase-3-mvp:example/goodlord-tokens.json` (and sibling paths under `example/goodlord-tokens-from-other-exporters/`) still has the old ones if a quick diff against a fresh export is useful for spotting drift.

## Suggested order

Bug 1 → Bug 4 → Bug 3 → Bug 2, then hardening. Reasoning: Bug 1 is the most acute (an active corruption path on every export today) and unblocks trustworthy fixture re-generation for the others. Bug 4 (merge-not-replace) is what makes every other fix durable rather than just reducing loss frequency, and its core mechanism overlaps with `staged-proposals-plan.md`'s `applyStagedDiffs` — worth sequencing before that plan's Slice 4 starts, ideally designed together. Bug 3 (orphan deletion) and Bug 2 (metadata) are real but lower-urgency data-loss/data-fidelity issues that don't block the PR-selection workflow from being safe to build on.
