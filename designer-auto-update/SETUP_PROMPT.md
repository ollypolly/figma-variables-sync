# Setup prompt

Paste this into a fresh Claude Code session on the machine that needs the plugin — works
whether it's a brand new machine or one that already has the plugin set up manually:

---

Set up the Figma "Variables Sync" plugin on this machine so it updates itself
automatically, instead of me having to pull/rebuild it by hand.

1. Look for an existing setup first:
   - Check for a `pull-figma-plugin` alias (grep `~/.zshrc`, `~/.zprofile`, `~/.bashrc`) —
     if it exists, it `cd`s into the existing clone.
   - Otherwise check common dev folders (`~/dev`, `~/Developer`, `~/Projects`, `~/Code`)
     for a `figma-variables-sync` folder.

2. If no existing clone was found, set one up from scratch:
   `git clone git@github.com:ollypolly/figma-variables-sync.git ~/dev/figma-variables-sync`
   (creating `~/dev` first if needed), then in that repo: `npm install && npm run build`

   If an existing clone was found, just bring it up to date:
   `git checkout main && git pull`

3. Set up the auto-updater: `./designer-auto-update/install.sh`
   This registers a macOS launch agent that checks `origin/main` every 15 minutes and
   rebuilds automatically when there's something new, firing a notification when it does.

4. Confirm it's running: `launchctl list | grep autoupdate`

5. If a `pull-figma-plugin` alias existed, remove it from whichever shell config defines
   it — it's no longer needed.

6. Figure out whether the plugin is already imported into Figma:
   - Found an existing `pull-figma-plugin` alias, or the plugin already shows up in
     Figma → Plugins → Development? It's already imported — nothing more to do.
   - Otherwise, tell me the absolute path to `manifest.json` in the repo, so I can import
     it myself via Plugins → Development → Import plugin from manifest (this step needs a
     human inside the Figma app — you can't drive that UI directly).

---
