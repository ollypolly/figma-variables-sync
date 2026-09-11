# Setup prompt

Paste this into a fresh Claude Code session on the machine that needs the plugin:

---

Set up the Figma "Variables Sync" plugin on this machine and make it keep itself
up to date, so I never have to manually pull/rebuild it again.

1. Check common dev folders (`~/dev`, `~/Developer`, `~/Projects`, `~/Code`) for an
   existing `figma-variables-sync` clone. If none exists, create `~/dev` if needed
   and clone it there:
   `git clone git@github.com:ollypolly/figma-variables-sync.git ~/dev/figma-variables-sync`

2. In that repo, make sure it's on `main` and up to date: `git checkout main && git pull`

3. Install dependencies and do the first build: `npm install && npm run build`

4. Set up the auto-updater: `./designer-auto-update/install.sh`
   This registers a macOS launch agent that checks `origin/main` every 15 minutes and
   rebuilds automatically when there's something new, firing a notification when it does.

5. Confirm it's running: `launchctl list | grep autoupdate`

6. Tell me the absolute path to `manifest.json` in that repo, so I can import the plugin
   into Figma via Plugins → Development → Import plugin from manifest.

---
