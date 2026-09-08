#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:a:h}"
SCRIPT_PATH="$SCRIPT_DIR/check-and-build.sh"
LABEL="com.figma-variables-sync.autoupdate"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

chmod +x "$SCRIPT_PATH"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-l</string>
    <string>-c</string>
    <string>$SCRIPT_PATH</string>
  </array>
  <key>StartInterval</key>
  <integer>900</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$SCRIPT_DIR/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$SCRIPT_DIR/launchd.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "Installed. Checks for updates every 15 minutes (and once now)."
echo "Logs: $SCRIPT_DIR/auto-update.log (build runs) and $SCRIPT_DIR/launchd.log (raw output)"
