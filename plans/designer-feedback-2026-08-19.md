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

**Blocked on**: live Figma file access to confirm. Need to check, via the Figma
MCP `use_figma` tool: (a) the actual `valuesByMode` alias id currently bound to
`Semantic.Typography.Font.Family`, (b) whether that id resolves to a variable with
`remote: true` (a genuine team-library reference — hypothesis wrong, this is
correct behavior) or `remote: false`/unresolvable (bug — bound to a dead/wrong
id), and (c) the actual `Brandon-Text` variable's own id, to see if the two
simply don't match. Don't have a route to the file directly yet — next step once
access is sorted.

If it turns out to be a real, currently-unhandled case (either this bug, or a
legitimate external alias we should stop hard-blocking on), the design asked for
is: **assume external, don't reset** — treat an alias target we can't find as
intentionally pointing outside the local set (leave it alone) rather than
resetting to a default. That's a different failure mode than what
`resolveDtcgValue.ts` currently does on import (falls back to
`defaultValueForType` and `console.warn`s) — worth revisiting once the live-state
question above is answered, and note it'd need its own decision for the *export*
side's current hard-block-with-`NamingCollisionError` behavior too, not just
import.

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
