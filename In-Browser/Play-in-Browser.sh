#!/usr/bin/env bash
# No install needed: opens the game in your browser (Firefox or Chromium).
cd "$(dirname "$0")/../app" || exit 1
xdg-open "file://$PWD/index.html" 2>/dev/null || echo "Open index.html in your browser."
