# Phase 2 Plan: Design System Integration & Dogfooding

This document outlines the architectural plan and checkpoints for integrating a localized design system (Storybook + Style Dictionary) into the Figma Variables Sync plugin repository, enabling us to dogfood the plugin with its own design variables.

---

## 🎯 Goal
Create a localized design system for the plugin's UI primitives. We will define the variables inside Figma, use a Figma MCP to automate variable structure creation, export them using this sync plugin, compile them using **Style Dictionary** into native CSS variables, and render/test the components using **Storybook**.

---

## 🏗️ Architecture & Dogfooding Workflow

The system is a closed loop of token generation, synchronization, and component consumption:

```
                  ┌──────────────────────┐
                  │   Figma UI (Canvas)  │
                  └──────────┬───────────┘
                             ▲ (Automated via Figma MCP)
                             │
                  ┌──────────┴───────────┐
                  │ Figma Local Variables│
                  └──────────┬───────────┘
                             │
            Export           ▼ (via Sync Plugin Proposals)
    ┌─────────────────────────────────────────────────┐
    │              GitHub Repository                  │
    │                                                 │
    │   ┌─────────────────┐     ┌─────────────────┐   │
    │   │  Tokens JSON    │────►│Style Dictionary │   │
    │   │  (W3C DTCG Format)    │ (Token compiler)│   │
    │   └─────────────────┘     └────────┬────────┘   │
    │                                    │            │
    │                                    ▼            │
    │   ┌─────────────────┐     ┌─────────────────┐   │
    │   │   Storybook     │◄────│ CSS Variables   │   │
    │   │ (Visual Preview)│     │ (Plugin Styles) │   │
    │   └─────────────────┘     └─────────────────┘   │
    └─────────────────────────────────────────────────┘
```

---

## 🛠️ Architectural Stages & Checkpoints

To ensure high-quality and collaborative execution, we will halt and check in at each of the following architectural stages. **We will not proceed to the next stage until the current checkpoint is approved by the user.**

### 1. Stage 2.1: Style Dictionary Setup & Token Spec
*   **Tasks**:
    *   Install and configure **Style Dictionary** (v4).
    *   Set up a `sd.config.js` in the project root.
    *   Define token folder structure (e.g. `tokens/design-tokens.json` mapped to W3C format).
    *   Configure Style Dictionary to compile the W3C JSON into native CSS variables (e.g. `src/ui/styles/variables.css`).
*   🛑 **Checkpoint 2.1**: Present the Style Dictionary configuration, directory structures, and sample output CSS variable mappings to the user for review and improvement.

### 2. Stage 2.2: Component Migration & Storybook Setup
*   **Tasks**:
    *   Install and configure **Storybook** (latest React-Vite setup).
    *   Refactor current primitives (`Button`, `Flex`, `Text`, `Layout`, `Tabs`, `Form`) to consume the compiled Style Dictionary CSS variables.
    *   Write Storybook stories for each of these primitive components.
*   🛑 **Checkpoint 2.2**: Present the Storybook preview configuration, component directory bindings, and story layouts to the user.

### 3. Stage 2.3: Figma Variables & Components Creation via MCP
*   **Tasks**:
    *   Design the collection structure for the plugin's own theme (colors, spacing scales, border-radii).
    *   Use the **Figma MCP** to construct the collections and variables natively inside a Figma draft file.
    *   Create corresponding Figma component frames (Buttons, Layout blocks, Text instances) using the MCP, ensuring they consume and are styled by these native variables.
    *   Align the React UI primitive structures and properties to these Figma components, styling them using the exported CSS variables compiled via Style Dictionary.
*   🛑 **Checkpoint 2.3**: Present the created Figma variables, matching Figma components, and the React primitive mappings to the user before exporting/dogfooding.

### 4. Stage 2.4: End-to-End Dogfooding Validation
*   **Tasks**:
    *   Open our plugin inside the draft file.
    *   Use the **Proposals** tab to export the plugin's design system variables to the repository.
    *   Verify that Style Dictionary compiles them correctly, Storybook renders them, and the plugin's own UI automatically styles itself using its own design tokens!
*   🛑 **Checkpoint 2.4**: Final review of the dogfooding cycle, verification of compiler outputs, and staging for main merge.
