# Plan: Open-Source Figma Variables Sync Plugin

## Why

No open-source tool exists that syncs native Figma Variables (including modes) with DTCG JSON in a git repo using scoped permissions. Every existing option has a dealbreaker:

- **Gitfig** — bidirectional but closed-source, global OAuth
- **Figma REST Variables API** — Enterprise plan only
- **Lukasoppermann/design-tokens** — Figma → export, but classic PAT with `repo` scope (all private repos)
- **Token Nexus** — code → Figma only (one-way)

The gap is specifically **Figma → Code PR** with fine-grained repo-scoped auth on any Figma plan.

## Strategy

Start lean — Figma → Code direction only (opens PRs). Use Token Nexus for the other direction (Code → Figma) initially. Later, add Code → Figma pulling into the same plugin so we own both sides and can drop Token Nexus — one tool, fully open-source, no external dependencies.

## Goals

- **Native Variables panel** — designers never leave their familiar Figma workflow
- **Modes support** — light/dark/brand themes as first-class
- **Figma → PR** — edit in Figma → plugin opens a PR in GitHub
- **Fine-grained PAT** — scoped to one repo, `Contents: write` + `Pull requests: write`. No org-wide access
- **DTCG output** — W3C spec format, directly consumable by Style Dictionary v4
- **Open-source** — MIT, community-driven
- **Any Figma plan** — uses Plugin API (not REST API), so no Enterprise requirement

## Architecture Sketch

### Phase 1: MVP (Direct PAT Architecture - Serverless)
```
┌─────────────────────────────────────────┐
│ Figma Plugin (TypeScript + React UI)    │
│                                         │
│  ┌───────────┐  ┌───────────────────┐   │
│  │ Variables │  │ Sync Engine       │   │
│  │ API       │◄►│ (diff/merge/stage)│   │
│  └───────────┘  └────────┬──────────┘   │
│                           │              │
└───────────────────────────┼──────────────┘
                            │ HTTPS (Direct REST API)
                            ▼
                    GitHub Repository
                    (tokens/*.json)
```

### Phase 2: Future (GitHub App + Relay Architecture)
```
┌─────────────────────────────────────────┐
│ Figma Plugin (TypeScript + React UI)    │
│                                         │
│  ┌───────────┐  ┌───────────────────┐   │
│  │ Variables │  │ Sync Engine       │   │
│  │ API       │◄►│ (diff/merge/stage)│   │
│  └───────────┘  └────────┬──────────┘   │
│                           │              │
└───────────────────────────┼──────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────┐
│ Relay Service (lightweight, self-hosted) │
│                                         │
│  - GitHub App (scoped per-repo)         │
│  - Branch/PR creation                   │
│  - Webhook listener (code → Figma)      │
│  - Conflict detection                   │
└─────────────────────────────────────────┘
                            │
                            ▼
                    GitHub Repository
                    (tokens/*.json)
```

### Why skip the relay for MVP?

Figma plugins run in a browser sandbox and can make standard HTTP `fetch()` requests. To minimize deployment complexity and maintenance overhead for the MVP, the plugin makes direct API calls to GitHub using a **Fine-Grained Personal Access Token (PAT)**. 

Since GitHub's Fine-Grained PATs allow users to limit authorization to a **single specific repository** and specify exact scopes (`Contents: write`, `Pull requests: write`), we achieve our goal of scoped repository permissions without needing any server infrastructure. 

A relay service and a GitHub App installation flow can be introduced in Phase 2 to optimize the user onboarding flow (replacing the manual PAT generation).

## MVP (keep it ruthlessly lean)

Three actions. That's it.

1. **Accept updates** — pull latest DTCG JSON from the repo into native Figma Variables. One button.
2. **Propose changes** — push current variable state as a PR. Designer adds a short description ("what" + optional "why"), plugin creates the PR. Keeps yours unless it literally can't merge (engineer resolves conflicts on the PR).
3. **Track proposals** — see status of your open PRs: pending review / approved / merged. Link to preview deploy if available.

Plus:
- **Modes** — Figma modes map to separate files per mode (Option A: `color.dark.json`). One format, no config.
- **Scoped auth** — Fine-Grained PAT restricted to a single repository (Contents: read/write, Pull Requests: read/write).

### What's explicitly NOT in v1

- No staging/selective push (all changes go together)
- No conflict resolution UI (if it can't merge, engineer handles it)
- No drafts or named workstreams
- No multi-designer awareness
- No webhooks or auto-pull
- No branch switching
- No Tokens Studio migration
- No history/activity feed

These are all good ideas for later. Ship the core loop first.

## Stretch Features (v2+)

- **Staging UI** — let designer pick which changes to include
- **Drafts** — multiple named workstreams in progress simultaneously
- **Auto-pull on file open** — check for upstream changes when plugin launches
- **Webhooks** — relay notifies plugin when a PR merges (toast: "your changes are live")
- **Branch switching** — work on feature/theme branches from Figma
- **Multi-designer conflict surfacing** — "Alex also changed this token"
- **Variable scoping** — only sync specific collections
- **PR feedback loop** — see engineer comments, respond from plugin
- **Status & history** — full timeline of changes and their lifecycle
- **Tokens Studio migration** — import existing JSON into native Variables
- **Figma REST API support** — for Enterprise orgs, CI/CD without the plugin

## Modes → DTCG Mapping

Use the `$modes` proposal from [design-tokens/community-group#210](https://github.com/design-tokens/community-group/issues/210):

```jsonc
{
  "$modes": {
    "light": {},
    "dark": { "$fallback": "light" }
  },
  "color": {
    "surface": {
      "$type": "color",
      "$value": "#ffffff",
      "$modes": {
        "dark": "#0b0d10"
      }
    }
  }
}
```

File-level `$modes` declares available modes + fallbacks. Per-token `$modes` overrides the default `$value`. This is the same format used in the workout-app design system spike — keeps the plugin aligned with the likely spec direction.

## Tech Stack

- **Plugin:** TypeScript, React, Figma Plugin API
- **Relay:** None for MVP (Direct client-to-GitHub API). Phase 2: TypeScript, Hono, Cloudflare Workers
- **Auth:** Fine-Grained PAT scoped to a single repo (MVP). Phase 2: GitHub App installation flow
- **Format:** DTCG JSON (W3C spec), with Style Dictionary compatibility tested

## What Makes It Attractive for Contributors

- **Small, focused scope** — not trying to be Tokens Studio (no custom token UI, no style management, no theming engine). One job, done well.
- **Real unmet need** — designers and devs both want this, current options all have dealbreakers
- **Modern stack** — TypeScript end-to-end, minimal dependencies
- **Low maintenance surface** — Figma Plugin API is stable, DTCG spec is converging, GitHub API is mature
- **Immediate personal use** — anyone with a design system can use it day one
- **Approachable codebase** — Tokens Studio is open-source (MIT, 1,592 stars) but has 345 open issues and a massive surface area (custom UI, style management, multi-provider sync, theming engine). Contributing native variables + modes there means navigating years of architectural decisions. This plugin is small enough that a new contributor can read the whole thing in an afternoon, understand the full flow, and ship a meaningful PR on day one.

## Goodlord Compatibility

Design the Goodlord pipeline (Figma Enterprise REST API + GitHub Actions) with a standard interface: DTCG JSON in a known path, PRs as the change mechanism. If this plugin ships and proves stable, it can slot in as a direct replacement without changing the rest of the pipeline (SD config, CI, app consumption). The contract is the file format and the PR workflow, not the tool.

## Designer Workflow (MVP — git fully abstracted)

The designer never sees branches, commits, diffs, or merge conflicts. Three screens.

### Accept updates

1. Designer opens plugin (or plugin checks on file open)
2. If repo has changed since last sync: **"3 tokens updated"** with a human-readable list (e.g. "spacing-lg: 20px → 24px")
3. Designer clicks **"Accept"** → Variables update in Figma. Done.

### Propose changes

1. Designer edits variables in Figma's native panel as normal (including switching modes)
2. Opens plugin → sees: **"5 changes since last sync"**
3. Clicks **"Propose"**
4. Short form: **"What's this change?"** (auto-filled summary, editable) + optional why
5. Clicks **"Submit"** → PR created. Plugin shows confirmation + link to preview deploy

Behind the scenes: commits to a branch, opens PR. If it can't merge cleanly, the engineer resolves it on the PR — designer doesn't deal with it.

### Track proposals

1. Plugin shows a list of open proposals with status: **Pending review** / **Approved** / **Merged**
2. That's it. No comment threads, no back-and-forth — v1 keeps it read-only status tracking.

### Full vision (v2+)

The stretch features section covers what this grows into. But the MVP is just the three screens above.

### Receiving updates from code (v2 enhancement)

1. An engineer changes a token in code and merges a PR
2. Next time the designer opens the file (or plugin polls in background), a toast appears: **"Design system updated — 3 tokens changed"**
3. Designer clicks **"View changes"** → sees a human-readable list: "spacing-lg: 20px → 24px, teal-9: #009b8f → #008577"
4. Clicks **"Accept"** → Variables update in Figma
5. Or **"Dismiss"** → reminded next session

### Modes (v2 enhancement)

1. Designer switches mode in Figma's native Variables panel (already built into Figma)
2. Edits values for that mode as normal
3. Publishes — plugin knows which mode changed, labels it clearly: **"Updated 4 dark mode colors"**
4. Same review/merge flow, no branch switching required from the designer's perspective

Behind the scenes: the plugin maps modes to the appropriate file structure (e.g. `color.dark.json`), but the designer never sees filenames or folders.

### Conflicts (v2 enhancement)

If a designer and an engineer edit the same token concurrently:
- Designer publishes → plugin detects the value has changed upstream since their last sync
- Shows: **"This token was also changed in code. Which value should win?"**
  - "Keep mine: `#2dd4c8`"
  - "Use the code version: `#3ae3d3`"
  - "Ask an engineer" (posts a comment on the PR)
- No merge conflict UX, no rebase, no force push. Just a choice.

### Change Lifecycle (v2 enhancement)

Designers need clear states for their changes — similar to how a CMS handles content (draft → review → published):

| Designer sees | What it means | Git reality |
|---------------|---------------|-------------|
| **Draft** | Work in progress, not ready for review. Designer can keep editing and adding changes. | Commits on a branch, no PR yet |
| **Proposed** | Submitted for review. Engineer can see it, CI runs, previews deploy. | Open PR |
| **Published** | Live in production. | PR merged to main |

**Draft workflow:**
- Designer can have multiple named drafts in progress simultaneously (e.g. "refreshing teal palette", "dark mode tweaks")
- Each draft is an isolated set of changes — editing one doesn't affect the other
- Plugin tracks what changed and prompts "what's this change about?" to keep drafts labelled
- Designer can discard individual drafts or propose any one independently
- Behind the scenes each draft maps to a branch, but the designer just sees named workstreams

**Multi-designer conflicts:**
- If two designers change the same token in different drafts, the plugin surfaces it early: "Alex also changed `teal-6` in their draft 'dark mode tweaks' — chat with them before proposing"
- This is inherent to collaborative design, not something the tool introduces — it just makes it visible rather than letting it become a surprise at merge time
- Conflict resolution stays human: the plugin shows what's diverged, designers decide who wins or how to reconcile

**Proposed → Published:**
- Once proposed, designer sees a status: "Waiting for review", "Changes requested", "Approved — shipping soon"
- When merged, status flips to "Published" with a timestamp
- If engineer requests changes (via PR comments), designer sees: "Feedback on your proposal" with the comment text — can respond or update directly from the plugin

This mirrors how news/content platforms work (Draft → In Review → Published) and maps cleanly onto git (branch → PR → merge) without exposing any of it.

### Status & History (v2 enhancement)

- **Status tab:** shows drafts in progress, proposals waiting for review, recently published changes, any updates available
- **History:** "You changed X on [date], it shipped on [date]" — designer can see their impact without checking GitHub

## Dogfooding

The plugin manages its own design system. A shared token set consumed by three surfaces:

- **Docs site** — documentation/guides for the plugin
- **Branding site** — landing page, marketing
- **Plugin UI** — the Figma plugin itself (Preact components)

All three consume the same DTCG tokens via Style Dictionary, synced through the plugin. Any design change (update the brand color, tweak spacing) goes through the exact workflow a user would: edit variable in Figma → publish → PR → CI builds all three consumers → preview deploy → merge → ship.

This gives:
- **Real multi-consumer validation** — proves the pipeline works across different tech stacks (static site, web app, Figma plugin sandbox)
- **Dogfood-driven development** — rough edges surface immediately because you're a daily user
- **Compelling README story** — "this tool's design system is managed by itself"
- **Contributor onramp** — anyone wanting to contribute can see the full pipeline in action on a real project before touching the plugin code

## Name Ideas

- `fig-tokens` / `figtokens`
- `varsync` (taken — 1 star though)
- `tokenbridge`
- `figvar`
- `designpush`

TBD — check npm/GitHub availability when starting.

