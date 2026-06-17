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

Run the watch task to compile code changes as you work:

```bash
npm run dev
```

This builds the files into the `dist/` directory. You can load it in Figma by right-clicking in a design file and selecting `Plugins > Development > Import plugin from manifest...` and selecting `dist/manifest.json`.

> [!TIP]
> Turn on the **Hot reload plugin** option in Figma's developer menu to automatically reload when files change.

### 🦴 UI-only Mode

To build and iterate on the UI inside a normal browser window without the Figma sandbox constraints:

```bash
npm run dev:ui-only
```

---

## 🏗️ Project Structure

- `src/common/` : Code shared between the UI and the Plugin contexts.
- `src/plugin/` : Code interacting directly with the Figma Plugin API.
- `src/ui/` : React + Vite interface.
- `plans/` : Reference roadmaps and architecture design details.

---

## 📜 License

This project is open-source and licensed under the [MIT License](LICENSE).
