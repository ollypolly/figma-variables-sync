# Figma Variables Sync - QA Test Kit

This directory contains a portable QA test kit for validating the `figma-variables-sync` plugin. By following this guide, contributors and testers can verify the complete variables sync loop (from local Figma edits, to Git PRs, and importing from Git back to Figma) in less than 10 minutes.

---

## 🛠️ Prerequisites

Before you begin, make sure you have:
1. **Figma Desktop App** (local developer plugin loading is only supported in the desktop app, not the web).
2. A **GitHub account** and a personal access token (PAT) with `repo` scope to allow the plugin to read/write to your test repository.
3. A **GitHub Repository** with write access. You can use this very repository (`figma-variables-sync`) or any other repo.
   - Ensure the token file `test-kit/tokens/design-tokens.json` exists on your remote target branch (so the plugin can read it).
4. **Figma Test File**: Download the portable `.fig` template (or create a draft in Figma using the variables defined in `design-tokens.json`).

---

## 📋 Step-by-Step QA Checklist

### 1. Import the Test Figma File
1. Open the Figma Desktop App and navigate to your **Drafts**.
2. Click **Import** and select the portable test kit `.fig` file.
3. Open the imported file. You should see a page with a **Button** component placed inside a frame showcasing both a **Light Mode** and **Dark Mode** variant.

### 2. Load the Plugin in Developer Mode
1. Clone this repository locally.
2. Run `npm install` and `npm run build` to compile the plugin.
3. In Figma, click the main menu -> **Plugins** -> **Development** -> **Import plugin from manifest...**.
4. Select the `manifest.json` located in the root of this plugin project.
5. Launch the **Variables Sync** plugin.

### 3. Configure Plugin Settings
1. Go to the **Settings** tab in the plugin.
2. Fill in the configuration fields:
   - **GitHub PAT**: Your personal access token.
   - **Repository Owner**: e.g., `yourusername`
   - **Repository Name**: e.g., `figma-sync-test-tokens`
   - **File Path**: The path to your JSON file, e.g. `tokens/design-tokens.json`
   - **Branch**: e.g., `main`
3. Click **Save Settings**.

### 4. Verify Initial Sync State
1. Go to the **Updates** tab.
2. Since the variables in Figma match the ones in your GitHub repository, the plugin should show **"No changes detected. Everything is in sync."**.
3. Verify that there are no pending proposals in the **Proposals** tab.

### 5. Test Diff Detection & Proposals (Export Loop)
1. Open the Figma **Local Variables** panel (press `Shift + I` -> Variables, or click empty canvas space and locate the variables icon on the right sidebar).
2. Change the value of the `brand/primary` variable under the `Light` mode to a different hex color (e.g., `#FF5733`).
3. Open the plugin (or switch to it) and go to the **Proposals** tab.
4. Verify that the plugin detects the diff:
   - It should list `brand/primary` with the change.
5. Enter a commit/PR title and click **Create Proposal / Pull Request**.
6. Go to your GitHub repository and verify that a new Pull Request has been opened with the correct color change.

### 6. Test Incoming Updates (Import Loop)
1. In your GitHub repository, directly edit `tokens/design-tokens.json` on the main branch (or merge the PR you just created, then make another change to the JSON).
2. For example, modify `spacing/medium` under `Tokens.spacing.medium` from `16px` to `20px` (represented as `20` or `"20px"` in the file).
3. Back in Figma, open the plugin and click the **Updates** tab.
4. Verify that the plugin displays the incoming change:
   - `spacing/medium`: `16` ➔ `20`
5. Click **Apply Updates**.
6. Verify that the spacing in Figma variables is updated.
7. Confirm that the **Button component** layout adjusts dynamically to reflect the new padding spacing.
