# Figma Variables Sync

An open-source Figma plugin designed to sync native Figma Variables (including modes) directly with DTCG (Design Tokens Community Group) JSON files in a git repository.

## The Intention

Managing design tokens between design and code is often complex. Existing tools are either closed-source, require global repository permissions, or require expensive Figma Enterprise plans. 

Our goal is to build a lightweight, open-source solution that allows you to:
- **Sync Native Variables & Modes** directly inside Figma.
- **Propose changes to Code** via Pull Requests with fine-grained repository-scoped authorization (no global account access).
- **Run on any Figma plan** by interacting via the Figma Plugin API.
- **Produce W3C DTCG-compliant outputs** that slot directly into modern build tools like Style Dictionary v4.

*Note: This project is currently in active development, and features are subject to iteration as we build.*

## Getting Started

### 📦 Installation

```bash
npm install
```

### 🖱️ Developing

Run the watch task to compile code and CSS changes automatically as you work:

```bash
npm run watch
```

This builds the files into the `manifest.json` referenced outputs. You can load it in the Figma Desktop App by going to **Plugins > Development > Import plugin from manifest...** and selecting the root `manifest.json`.

> [!TIP]
> Turn on the **Hot reload plugin** option in Figma's developer menu to automatically reload when files change.

### 🧪 QA Test Kit

We provide a portable QA test kit for validating the plugin end-to-end (import, export, diffs, and GitHub PR proposals).

See the [QA Checklist & Setup Guide](test-kit/QA.md) for details on how to configure and run tests using [design-tokens.json](test-kit/tokens/design-tokens.json) against this repository.

---

## 🏗️ Project Structure

- `src/common/` : Code shared between the UI and the Plugin contexts.
- `src/services/` : Services for GitHub API and Figma interactions.
- `src/tabs/` : Plugin tab view screens (Settings, Updates, Proposals).
- `plans/` : Reference roadmaps and architecture design details.
- `test-kit/` : Self-contained end-to-end QA token set and testing checklist.

---

## 🎨 Modes & DTCG Mapping Spec

The plugin maps native Figma Variable Collections and Modes to W3C DTCG (Design Tokens Community Group) formatted JSON using the `$modes` property.

Example mapping structure:

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

- **File-level `$modes`** declares the available modes in the collection and their optional fallback hierarchies.
- **Per-token `$modes`** overrides the default `$value` for a specific mode.

---

## 🚀 Future Roadmap (v2+)

- **Staging UI** — Let designers select specific changes to include in a proposal.
- **Drafts & Workstreams** — Support multiple concurrent named drafts (branches).
- **Multi-File Token Support** — Organize tokens across directories and files instead of a single path.
- **Token-to-Component Bindings** — Track component-to-semantic-token bindings to view downstream impacts.
- **Bidirectional conflict resolution** — Ask designers which version wins directly inside Figma when merge conflicts happen.

---

## 📜 License

This project is open-source and licensed under the [MIT License](LICENSE).
