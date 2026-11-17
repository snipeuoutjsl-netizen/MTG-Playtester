# MTG Playtester

> ## ⚠️ First: please check you are on the latest build
> This project changes often, and many fixes are small. Before you report a bug or assume something is missing:
> 1. Open the app and look at the version number (⚙ Settings, or the title bar).
> 2. Compare it with the newest tag on the **[Releases page](https://github.com/snipeuoutjsl-netizen/MTG-Playtester/releases)**.
> 3. If yours is older, update (see [Updating](#updating)) and try again.
>
> The desktop app also checks for updates when it starts and offers to install one with a progress bar.

An offline, solo "goldfish" playtester for Magic: The Gathering. You play your deck against an empty table to test draws, sequencing and combos. Everything runs on your computer: no account, no server, nothing is uploaded.

It is built for people who want a playtester that **understands the rules and teaches them as you go**, rather than just moving cards around. It is a personal project in active development (version 0.x), so some cards and rules are still handled by hand. The app tells you when it is unsure ("understood / partly / by hand").

## Features

- **Rules-aware play.** Cast costs and alternative costs (evoke, delve, convoke, flashback, warp, suspend, and more), the stack and priority, triggered and activated abilities, replacement effects (CR 614), spell copies and storm, state-based actions, sagas, transform and double-faced cards, and many "return from graveyard" effects.
- **Teaching mode.** Every teaching aid (rule explanations, timing hints, cost breakdowns, trigger prompts, keyword tooltips) is its own switch, so you can learn with all of them or play with none.
- **Combat helper.** Declare attackers with one click per creature, or **Attack with all**, which skips anything tapped, summoning sick (unless it has haste), with defender, or under a "can't attack" effect.
- **Counters shown clearly.** Chips on the card, such as a green "5 +1/+1", red for −1/−1, blue for other kinds.
- **Deck tools.** Paste an MTGO, Arena or plain-text list; London mulligan; deck stats; sideboard; undo (Ctrl+Z, 300 steps).
- **Look and sound.** Card images (optional download), playmats, card sleeves, UI themes, including a pixel-art cosmos set, and generated low-fi music with its own on/off switches.
- **Updates in the app.** The desktop version tells you at launch when a newer build exists and installs it with a progress bar. Your decks and settings are kept.

## Install

You need nothing for the browser version, and Node.js only if you build the desktop app yourself.

| You want | Do this |
|---|---|
| **Windows installer or portable .exe** | Download from the [Releases page](https://github.com/snipeuoutjsl-netizen/MTG-Playtester/releases). Not code-signed, so Windows SmartScreen may warn: choose *More info*, then *Run anyway*. |
| **Linux / Steam Deck AppImage** | Download from Releases, make it executable, run it. On Steam Deck use Desktop Mode, then add it as a non-Steam game for Game Mode. |
| **Just try it in a browser** | Download the source zip, then double-click `In-Browser/Play-in-Browser.bat` (Windows) or run `In-Browser/Play-in-Browser.sh` (Linux). Or open `app/index.html` in Edge, Chrome or Firefox. |
| **Desktop window from source** | Install [Node.js LTS](https://nodejs.org), then run `Windows/Play.bat` or `SteamDeck-and-Linux/Play.sh`. |
| **Build it yourself** | `Windows/Build-Installer.bat` or `SteamDeck-and-Linux/Build-AppImage.sh`; or use the GitHub Actions workflows *Build Windows app* and *Build Linux app*. |

The desktop app and the browser version keep **separate storage**, so load the card data and import your decks once in whichever you use.

## First run

1. **Card data:** ⚙ → *Card data…*, then choose the *Oracle Cards* bulk file from <https://scryfall.com/docs/api/bulk-data>. You load it once and it is saved. Parsing takes 10 to 30 seconds.
2. **Import a deck:** ⚙ → *Import / edit deck* and paste your list (put a `Sideboard` line or a blank line before the sideboard). *Load sample* gives you a test list.
3. **New game:** keep or mulligan, then play.
4. **Card images (optional):** ⚙ → *Card images* downloads art once; it needs internet only for that step.

## Updating

**Check your version first** (⚙ Settings or the title bar) and compare it with the latest [release](https://github.com/snipeuoutjsl-netizen/MTG-Playtester/releases).

- **Desktop app:** it checks at launch. When a newer build exists a window offers *Update now* (with a progress bar), *Remind me later* or *Skip this version*. You can turn the start-up check off, or check by hand, in Settings.
- **Manual update (no internet needed):** extract the new zip, then ⚙ → *Update app…* → *Update from folder…* and pick the extracted folder. Restart when asked. Only the game files are replaced, so your decks, settings, mats and sleeves stay.
- **Installer or AppImage:** download the new one from Releases and run it over the old one.
- Some releases change the desktop shell (`main.js`, `preload.js`). Those need the full installer once; the update window tells you if that is the case.

## Controls

| Action | How |
|---|---|
| Move cards | Drag between Hand, Battlefield and the piles, or right-click for a menu |
| Play / tap | Double-click a card in hand to play it; double-click on the battlefield to tap |
| Draw, untap, next turn, shuffle | Buttons, or **D**, **U**, **N**, **S** |
| Tap the selected card | **T** |
| Undo | **Ctrl+Z** |
| Counters, abilities | Right-click a battlefield card |
| Scry, search, view graveyard / exile / sideboard | Left-hand panel |

## How accurate is it?

It follows the Comprehensive Rules where it can, and it is tested against a growing suite of rules checks (`tests/`, organised by CR section). Those tests use mock cards and a headless browser, so real games can still surface cases they miss. Where the app cannot apply an effect itself it says so and leaves it to you. If something behaves wrongly, please open an issue.

**Known gaps** (the plan is in the developer notes): Unearth/Embalm/Eternalize/Disturb, opposing graveyards, replicate and splice, a full priority audit, and an opposing board.

## Reporting a bug

Please include:
- your version number and whether you use the desktop app or the browser;
- the card names involved and the phase you were in;
- what you expected and what happened. A screenshot helps.

## For developers

- `developer/DEVNOTES.md` is the developer history.
- Run the rules tests: `cd tests && python3 inject.py && node cr-rules.js`.
- The game is plain HTML, JS and CSS with a thin Electron shell (`main.js`, `preload.js`). The game files are in `app/`. The code lives in `developer/src/` (one file per area) and is joined into `app/app.js` by `node developer/build-src.js`. Edit `src/`, then build; commit both.
- `python3 tests/rules-audit.py MagicCompRules.txt --table` regenerates the Comprehensive Rules keyword table (`src/40-rules-table.js`).
- **Publishing a release:** run `node developer/make-release.js`, then upload ALL SIX files it lists (index.html, app.js, style.css, package.json, latest.json, update.json) to the newest GitHub release. The in-app updater downloads them from `releases/latest/download/`, so a release that is a draft, a pre-release, or missing a file cannot be installed from inside the app.

## Legal

**MTG Playtester is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.**

Magic: The Gathering, its card names, mana symbols and related marks are trademarks of Wizards of the Coast LLC. This project is free, is not sold, and is not affiliated with, sponsored or endorsed by Wizards of the Coast, Hasbro or Scryfall.

- **What is in this repository:** the program only. There are no card images, no card artwork, no Oracle card database and no Wizards logos or set symbols. Mana and tap symbols are drawn by the app as plain coloured text circles. The icon, playmats, sleeves and cursors are original.
- **Card data and images** are downloaded by you, onto your own computer, from [Scryfall](https://scryfall.com) (or card text from [MTGJSON](https://mtgjson.com)) when you choose to. They stay on your computer. Data is provided by Scryfall; Scryfall does not endorse this app and has its own [terms](https://scryfall.com/docs/api). Card text and images remain the property of their owners.
- **Rules:** implemented from the Magic: The Gathering Comprehensive Rules and official Oracle text and rulings. This is a goldfish practice tool, not a judge, and it can be wrong or incomplete. For tournament play the Comprehensive Rules, Oracle and your event's judges are the authority.
- **Privacy:** no accounts, no tracking, no ads. Decks, settings and card data are stored only on your computer. The app connects to the internet only to download card data/images (Scryfall, MTGJSON) and to check for and download new versions (GitHub). The check on start can be switched off in the update window.
- **No warranty:** provided "as is", without warranty of any kind. The authors are not liable for any damage or loss arising from its use.
- **Third-party software:** the desktop version uses Electron (MIT licence), which includes Chromium and other open-source components under their own licences.
- **Contributors:** do not commit card images, full card databases, Wizards artwork or logos, or verbatim Oracle text. Test fixtures that contain card text belong in `tests/corpus.json`, which is git-ignored.

- **Licence:** all rights reserved for now (see `LICENSE`). The code is viewable but not licensed for reuse.

The same notice is in the app under ⚙ → Settings → Legal notice.
