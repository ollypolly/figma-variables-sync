# Designer Feedback — Initial PR Launch (2026-08-19)

First real-world run: a designer's initial pull request against a live token repo
(`design-system/tokens/design-tokens.json`). Raw observations below, plus what
investigating each one turned up. Nothing here has been implemented yet — this is
triage input for future plan docs, not a plan itself.

## 1. Font family flagged as "external" on import

Observed: importing `design-tokens.json` flagged `Semantic.Typography.Font.Family`
(aliased to `Primitives-—-Typography.Family.Brandon-Text`) as referencing something
external. Designer's own hunch: this might just be how Figma itself talks about font
imports, not a plugin bug — and notably it didn't reset the value in this instance.

Investigated the plugin's own alias-resolution path (`parseDtcg.ts`'s
`isDanglingAlias`, `importFromDtcg.ts`'s two-pass PASS 1/PASS 2 structure,
`resolveDtcgValue.ts`) against the actual file: the alias target exists locally in
the JSON, the dot-paths match byte-for-byte (including the em-dash in
`Primitives-—-Typography`), and PASS 1 populates `pathToVariableIdMap` for every
collection before PASS 2 resolves any value, so cross-collection ordering isn't the
cause either. Nothing in this codebase's import logic explains the flag for this
specific token.

**Update — got the actual warning text**, and it's not the import-side
`unresolvedAliases` path at all:

> These variables are aliased to a variable from an external library, which can't
> be tracked here — bind them to a variable that exists locally in this file
> instead.
>
> Affected paths:
>   - Semantic.Typography.Font.Family

This is `NamingCollisionError` thrown from `exportToDtcg.ts`'s external-alias
check (`src/common/dtcg/exporter/exportToDtcg.ts:51-70`), surfaced through
`checkFigmaChanges`'s `requestExport()` call
(`src/services/gitSync.ts:45-67`) as a `collisionNotice` with
`resolution: "designer"`. That call runs on *every* check — the fast poll, the
slow poll, and any manual "check for changes" — so this isn't a one-time import
artifact, it's the live, current state of the Figma file: right now,
`Semantic.Typography.Font.Family`'s alias points to a variable ID that
`figma.variables.getLocalVariables()` doesn't return.

Static analysis of the import path (previous note, still true) found nothing that
would cause our own `importFromDtcg.ts` to bind this alias incorrectly — PASS 1
populates the full id map before PASS 2 resolves any alias, so a correct import
should bind `Semantic.Typography.Font.Family` straight to the `Brandon-Text`
variable's real local id. And the token's own `$description` ("single source of
truth for font family — components bind here rather than hard-coding the family
name") reads like it's meant to be a local primitive, not a real cross-file/library
reference. So the working hypothesis is a genuine bug — the alias ended up bound
to a stale or mismatched id rather than the current local `Brandon-Text`
variable — rather than the designer's original hunch that this is just how Figma
talks about fonts.

**Confirmed via live Figma inspection** (`design/n4N51UjLuXdFcfgKnfCMCP` —
Goodlord Design System): this is not an external library reference at all.

`Semantic/Typography/Font/Family`'s alias points to `VariableID:12854:42`,
named `Family/Brandon Text` (space). That variable still resolves through
`figma.variables.getVariableByIdAsync` — `remote: false`, so it's local — but
it is **absent from its own collection's `variableIds` list**
(`Primitives — Typography`, collection `VariableCollectionId:12854:35`): a
soft-deleted/orphaned variable. Meanwhile a separate, currently-live variable,
`Family/Brandon-Text` (hyphenated) at `VariableID:13879:1119`, sits in that
same collection's `variableIds` list and is presumably the one meant to be
bound. Likely cause: someone renamed "Brandon Text" → "Brandon-Text" by
creating a new variable and deleting the old one instead of renaming in
place, and the semantic alias never got repointed.

Since `exportToDtcg`'s `variableMap` is built only from
`figma.variables.getLocalVariables()` (which correctly excludes the orphaned
variable), it can't resolve the alias — so it threw `NamingCollisionError`
with the same message used for genuine external-library aliases. That message
was misleading for this case: it's a dangling reference to a deleted *local*
variable, not a library reference, and it's fixable by rebinding in Figma —
not by "binding to a variable that exists locally" (it already should be).

**Status: fixed.** Distinguishing the two cases properly (dangling local vs.
genuine external) would mean making `exportToDtcg` async so it can call
`getVariableByIdAsync` per unresolved alias and check `remote` — a wide change
touching all 23 call sites across the handler and 4 test files, plus a new
mock capability for the "resolvable but orphaned" case the current mock can't
simulate. Given `exportToDtcg`'s sync inputs can't actually tell the two cases
apart without that, went with the cheaper fix instead: reworded the message to
stop asserting "external library" as fact, covering both possibilities and
pointing at the fix (rebind in Figma) either way. Left this file's actual data
alone — no alias rebind — since the message fix covers the designer-facing
problem on its own.

## 2. Stale GitHub Contents API cache overwrites fresh local changes — urgent

Observed: shortly after creating/updating a PR (a push), a re-poll reads GitHub's
Contents API before it's caught up with that write, sees the pre-push content, and
treats that as drift — auto-syncing the designer's just-submitted Figma variables
back to the old values.

This is the same root cause already logged as a known limitation in PR #15
(`7199d06`) and tracked as "Stale Data After Merge" in `future-ideas-plan.md`, but
the severity is worse than that entry currently describes: it's not just a stale
diff being *shown*, it's idle-drift's auto-apply mechanism (`computeSafeSubset` /
`applySafeSubset`) *writing* stale content over real local edits, right after
submit. Flagged as urgent — worth prioritizing over other backlog items in
`future-ideas-plan.md`.

Confirmed as a core-workflow blocker, not a polish item — the sync flow doesn't
hold up if it keeps showing the designer the wrong state.

**Status: fix up for review, PR [#22](https://github.com/ollypolly/figma-variables-sync/pull/22).**
Went with SHA-based staleness detection: `submitProposal` now records the sha its
write replaced, and any subsequent read that still reports that exact sha is
treated as a lagging Contents API read (not real drift) and ignored, until a read
reports something different. 217 unit tests pass including a regression test for
this exact scenario, confirmed to actually catch the bug (disabled the guard,
watched it fail, re-enabled it). Not yet confirmed against a real GitHub race
under normal use — pending a designer running through a normal submit/update-PR
flow.

## 3. PAT is scoped to one resource owner — no designer-safe credential path

`PluginSettings.pat` (`src/types.ts:94`) is a single shared token — whoever
configures the plugin's Settings tab supplies one PAT, used for every GitHub call
(reading/writing the token file, creating branches/PRs, and separately, filing
feedback issues per `future-ideas-plan.md`'s "Feedback Button Requires Access to a
Personal Repo"). There's no mechanism for a designer to act under their *own*,
appropriately-scoped credential instead of the repo owner's.

**Scope narrowed**: the in-plugin feedback/issue-filing feature is dev-period-only
and won't ship in the final product, so this doesn't need a general
credential-management design. Just add a second, separate PAT field for now (e.g.
a designer-scoped PAT alongside the existing one) so a designer can act under their
own token rather than the repo owner's. No broader redesign needed.

## 4. Switching PR target can silently resurrect renamed-away variables, with no visibility into what changed — urgent

Observed: designer selected PR #518 in the dropdown (their own initial, long-stale
proposal, unmerged and untouched since 2026-08-19) and got a "Sync variables ...
This will update or remove 10 variables in Figma to match PR #518" dialog. They
correctly suspected this would revert real, already-fixed work (a radius/spacing
naming cleanup, a colour correction) and asked to push their current state as an
*update* to #518 instead, without pulling its stale content in first.

**Confirmed against the real repo** (`ohgoodlord/design-system`): `main` has had
no `tokens/design-tokens.json` at all since 2026-08-11 (deleted "to make way for
a fresh Figma export"); PR #518, opened 2026-08-19, is the only place a tokens
file exists in git, and it's never been updated since. Pulled #518's actual
content: it has the old, redundant-nested names
(`Primitives-—-Radius.radius.2/4/10/full`, `Primitives-—-Spacing.spacing.5/10/…`)
— 10 paths, matching the dialog's count exactly. Checked live Figma: those
variables are now named without the redundant subgroup (`2`, `4`, `10`, `full` /
`5`, `10`, …) — the designer's rename already happened. `Teal/100` is correctly
protected (still exists as a live path, so it registers as drift) — the bug is
specific to paths that no longer exist under their old name.

**Root cause**: `computeSafeSubset` (`src/services/gitSync.ts`) treats any path
present in the new target but absent from both Figma's current export and the
old baseline as safe to add. A rename looks exactly like that from a pure
dot-path diff — old path "deleted", new path "added" — and when the old
baseline is empty (as `main` is here), *nothing* generates the protective
"this path used to exist and is now gone, leave it alone" signal, so the stale
path sails through. `applySafeDiffsToFigmaJson` then `setPath`s it back into
the merged export — not reverting a value, but **recreating the old variable as
a duplicate alongside the already-renamed one**, resurrecting the exact naming
collision the designer just fixed.

Separately, the switch UX made this worse: selecting a PR and syncing Figma to
match it are one atomic action — canceling the dialog cancels the whole switch,
not just the sync, so there was no way to target #518 (to push an update to it)
without either accepting the revert or not switching at all. And the dialog only
ever showed a count, never which variables or what they'd become.

**Status: fix up for review, PR [#24](https://github.com/ollypolly/figma-variables-sync/pull/24).**
Three coordinated changes:

1. **`computeSafeSubset` never auto-adds a path Figma doesn't currently have.**
   Filter out `type === "added"` delta items before building the safe set —
   paths that are new relative to the old baseline always require an explicit
   look, regardless of `skipSwitchConfirmation`. This subsumes the empty-baseline
   case entirely (when the old baseline is empty, *every* delta item is
   `"added"`, so the safe set is correctly empty) without needing a separate
   guard. Modifications and removals of paths Figma already has are unaffected
   and stay eligible for auto-sync as before.
2. **`requestSwitch` no longer gates the switch itself on the sync decision.**
   Restructured to match `abandonProposal`/`updateProposalBranch`'s existing
   shape: fetch the target's content, diff Figma against it, and set
   `$activeProposal`/`$check` unconditionally — then separately offer the
   (now-corrected) safe subset as an optional, cancelable sync. Canceling
   declines the sync; the switch already happened. This is what actually
   guarantees the designer can always get to the state they want: after
   switching, the diff shown is the real, current diff against the target
   (including their renames), and submitting is merge-based (patches only
   what changed) — pushing an update to #518 never requires pulling its stale
   content in first.
3. **The sync dialog lists the actual variables**, not just a count — threading
   the real `DiffItem[]` (already computed by `computeSafeSubset` before being
   reduced to a bare path set, previously discarded) through `SafeSyncPlan`
   into `SyncConfirmDialog`. Reframed as an optional pull ("Would you like to
   pull these changes in?", with "Pull in changes" / "Not now" actions) rather
   than a warning about an update that's about to happen — it's an offer the
   designer can accept or decline, not something gating the switch.

**Follow-up found while testing against a repro fixture** (a stale PR whose
old baseline still had the pre-rename flat paths, unlike #518's empty
baseline): the same ambiguity exists in the other direction. A rename is one
`"added"` item (the new path) and one `"deleted"` item (the old path) — (1)
above only excluded the added side, so when the old baseline still has the
pre-rename path matching Figma's current export exactly (no drift), the
deleted side sailed through as "safe" and the dialog offered to *delete* the
designer's live, still-correct variable, believing the target had genuinely
removed it. Fixed by excluding a deletion too when its value reappears under
some other added path in the same delta — the same "this needs an explicit
look, not a silent apply" treatment, just recognizing a rename from the
other direction.
