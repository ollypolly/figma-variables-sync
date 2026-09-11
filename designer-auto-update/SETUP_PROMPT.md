# Setup prompt

Paste this into a fresh Claude Code session on the machine that already has the plugin
set up (an existing clone, already imported into Figma via manifest.json, currently
updated by hand via a `pull-figma-plugin` alias):

---

Replace my manual `pull-figma-plugin` alias with an automatic updater for the Figma
"Variables Sync" plugin, so I never have to run it by hand again.

1. Find the existing clone: look up the `pull-figma-plugin` alias definition (grep it out
   of `~/.zshrc`, `~/.zprofile`, `~/.bashrc`, or wherever shell aliases are defined) — it
   `cd`s into the plugin's repo before pulling and building. That's the directory to use;
   it's already set up, so there's no need to clone or import it into Figma again.

2. In that repo, make sure it's on `main` and up to date: `git checkout main && git pull`

3. Set up the auto-updater: `./designer-auto-update/install.sh`
   This registers a macOS launch agent that checks `origin/main` every 15 minutes and
   rebuilds automatically when there's something new, firing a notification when it does.

4. Confirm it's running: `launchctl list | grep autoupdate`

5. Remove the `pull-figma-plugin` alias from whichever shell config it's defined in — it's
   no longer needed, updates now happen automatically in the background.

---
