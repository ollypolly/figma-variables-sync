# Designer auto-update

Runs on the designer's machine so they don't have to manually pull and rebuild the plugin
every time there's an update. A macOS launch agent checks `main` every 15 minutes; if it's
moved on, it resets the local checkout to match, reinstalls dependencies, rebuilds, and fires
a macOS notification.

## Install

On the designer's machine: give their Claude Code the prompt in
[`SETUP_PROMPT.md`](./SETUP_PROMPT.md) — it finds their existing clone, runs `install.sh`,
and retires their old `pull-figma-plugin` alias.

To run it manually instead, once the repo is cloned:

```
./designer-auto-update/install.sh
```

This registers a launch agent that runs immediately, then every 15 minutes, for as long as
the designer is logged in. No further action needed — no more manual `cd && git pull && npm
run build`.

## How it works

- `check-and-build.sh` — `git fetch`s `origin/main`, compares SHAs, and only does the
  reset/install/build/notify if there's something new. A no-op check exits immediately.
- `install.sh` — writes `~/Library/LaunchAgents/com.figma-variables-sync.autoupdate.plist`
  pointing at `check-and-build.sh`, then loads it via `launchctl`.
- `uninstall.sh` — unloads and removes the launch agent.

The build only ever runs when there's a real update, so this doesn't burn CPU/battery on a
15-minute cron doing nothing.

## Logs

- `auto-update.log` — one entry per actual update (old SHA → new SHA, build output).
- `launchd.log` — raw stdout/stderr from the launch agent, for debugging if an update silently
  fails to apply.

Both live in this folder and are gitignored; delete them anytime.

## Uninstall

```
./designer-auto-update/uninstall.sh
```

## Notes

- Assumes the designer never edits files in this repo — `git reset --hard` discards any local
  changes to bring the checkout in line with `origin/main`.
- Requires Node/npm on `PATH` in a login shell (whatever the designer's normal terminal setup
  already provides — asdf, nvm, Homebrew, etc.). No hardcoded paths.
