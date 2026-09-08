#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:a:h}"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRANCH="main"
LOG_FILE="$SCRIPT_DIR/auto-update.log"

cd "$REPO_DIR"

git fetch origin "$BRANCH" --quiet

LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  exit 0
fi

{
  echo "$(date): updating $LOCAL_SHA -> $REMOTE_SHA"
  git reset --hard "origin/$BRANCH"
  npm install
  npm run build
  echo "$(date): build complete"
} >> "$LOG_FILE" 2>&1

osascript -e 'display notification "Updated to the latest version." with title "Figma Variables Sync"'
