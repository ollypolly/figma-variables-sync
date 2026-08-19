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

**Open question, not yet resolved**: most likely this is native Figma UI language
(e.g. how Figma's own variable picker describes a bound font/library asset) rather
than anything our `unresolvedAliases`/quarantine logic produced — but that needs
confirming against the live Figma file (per this repo's own convention of setting
state via the Figma MCP `use_figma` tool rather than guessing) before concluding
it's a non-issue.

**Blocked on**: a screenshot of the actual warning the designer saw. Static
analysis alone hasn't turned up a cause in this codebase, so the next step is
seeing the literal wording/UI before guessing further.

If it does turn out to be a real unresolved-alias case somewhere else, the design
asked for is: **assume external, don't reset** — i.e. treat an alias target we can't
find as intentionally pointing outside the local set (silently leave it alone)
rather than falling back to a default value. That's a different failure mode than
what `resolveDtcgValue.ts` currently does (falls back to `defaultValueForType` and
`console.warn`s) — worth revisiting once the open question above is answered.

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
hold up if it keeps showing the designer the wrong state. Not yet designed:
candidate mitigations noted previously were a short cooldown after our own writes,
SHA-based staleness detection, or a "last checked" timestamp — none chosen yet.

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
