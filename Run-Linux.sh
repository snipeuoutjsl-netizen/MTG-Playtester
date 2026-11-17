#!/usr/bin/env bash
# Opens MTG Playtester in its own window on Linux / SteamOS (Desktop Mode). Installs Electron on first run.
cd "$(dirname "$0")" || exit 1
if [ ! -x node_modules/electron/dist/electron ]; then
  command -v npm >/dev/null 2>&1 || { echo "Node.js is not installed. On SteamOS/Arch: sudo pacman -S nodejs npm (see README: Linux and Steam Deck)."; exit 1; }
  echo "First run: installing Electron, this takes a minute..."
  npm install || { echo "npm install failed"; exit 1; }
fi
exec node_modules/electron/dist/electron --no-sandbox .
