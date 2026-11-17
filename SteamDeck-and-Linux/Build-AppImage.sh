#!/usr/bin/env bash
# Builds a single-file AppImage into dist/ for Linux and the Steam Deck.
cd "$(dirname "$0")/../app" || exit 1
command -v npm >/dev/null 2>&1 || { echo "Node.js is not installed (SteamOS/Arch: sudo pacman -S nodejs npm)"; exit 1; }
npm install || exit 1
npm run dist:linux || exit 1
echo
echo "Done. Your app is: dist/MTG-Playtester-*-x86_64.AppImage"
echo "Right-click it > Properties > Permissions > tick 'Is executable', then double-click it."
