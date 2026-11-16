# MTG Playtester

An offline, solo Magic: The Gathering playtester for Windows. Load a deck, draw a hand and play it out turn by turn against a goldfish (no opponent) so you can practise sequencing, mana and combos. It knows the game's rules and explains them as you go, and you can switch every teaching aid off.

It is built for learning: when something can't be done (a second land, a spell at the wrong time, not enough mana of the right colour) it tells you why.

---

## How to install

### Option 1: the installer (easiest)
1. Open the **[Releases](../../releases)** page of this repository.
2. Under **Assets** of the newest release, download **`MTG-Playtester-Setup-<version>.exe`**.
3. Double-click it. It installs by itself in a few seconds, adds a desktop and Start menu shortcut, and opens the game.
4. Windows may say **"Windows protected your PC / unknown publisher"** because the installer is not code-signed. Click **More info**, then **Run anyway**.

### Option 2: the portable app (no install)
Download **`MTG-Playtester-Portable-<version>.exe`** from the same Assets list and double-click it. Nothing is installed. Keep it wherever you like (a USB stick, your Documents folder).

### First launch
The first time it opens, the app needs **card data** so it can read card text:
1. Open the **⚙ Tools & Settings** menu at the top and choose **Card data…**.
2. Click **Download from Scryfall** (about 150 MB, once). You need internet for this step only.
3. Optional: choose **Images…** from the same menu to download card pictures. Without them the app shows clean text cards, which work just as well.

After that the app works fully offline.

### Updating
Open **⚙ Tools & Settings → Update app…**, click **Check now** under *From GitHub*, read what changed, and click **Download & install**. Restart the app. Your decks, settings and card data are kept. Every file is checked against a published fingerprint before it is installed.

Some releases also change the desktop shell. The update window tells you when that is the case, and then you download the new installer from the Releases page instead.

### Running from source (optional)
Install [Node.js LTS](https://nodejs.org), download the source, then double-click `Run-Desktop.bat` to open it, or `Build-Installer.bat` to build your own installer into the `dist` folder.

---

## The basics

### 1. Load a deck
- Click the **Deck** selector at the top to see your decks, or open **⚙ Tools & Settings → Import / edit deck**.
- Paste a deck list in the usual format, one card per line, for example:
  ```
  4 Lightning Bolt
  4 Goblin Guide
  20 Mountain
  ```
  Put sideboard cards after a blank line, or after a line that says `Sideboard`.
- Name it and save. You can keep many decks and switch between them.

### 2. Start a game
- Click **New game**. You get a shuffled library and an opening hand of seven. The **On the play / On the draw** switch decides who goes first (on the play skips your first draw).
- Keep the hand, or take a mulligan. If you take one, you draw a new hand and put cards on the bottom, as in the official rules.
- Some cards can begin the game on the battlefield (for example Leylines). The app offers them on a pre-game screen.

### 3. Playing a turn
The bar at the top shows the **current phase** and what comes next. Use **Next phase** (or press Space) to move through the turn: untap, upkeep, draw, main phase, combat, second main phase, end step.

- **Play a land:** drag it from your hand onto the battlefield, or click it. You get one land drop per turn unless a card gives you more.
- **Cast a spell:** drag it onto the battlefield (or click it). A payment window shows which lands will be tapped. You can change them. The spell goes onto **the stack**.
- **The stack:** spells and abilities wait here. Resolve them one at a time, or use the stack window to respond with an instant, counter something or let it resolve.
- **Abilities:** click a permanent on the battlefield to use its abilities (tap for mana, activate, equip, and so on).
- **Combat:** at the combat phase, click **Declare attackers**, choose which creatures attack, and the app deals damage to your goldfish opponent.
- **End of turn:** **Next turn** untaps your permanents, runs triggers, moves to the next turn and draws.

### 4. Dragging cards
Click and hold a card and the card follows your mouse. Release it on a zone that accepts it (battlefield, graveyard, exile, library, hand) and the action happens. If it can't be played there right now (wrong phase, land already played), it **flies back** to where it came from. Press **Esc** while dragging to cancel.

### 5. Triggers and choices
When something triggers (an ETB ability, a landfall, a Saga chapter, a cascade), a small window shows the trigger and what it will do. Read it, make any choices (targets, "you may" decisions, searching your library) and put it on the stack.

### 6. Everything else you can reach
| Control | What it does |
|---|---|
| **Undo** (Ctrl+Z) | Takes back your last action. |
| **Draw** (D), **Shuffle** (S), **Untap all** (U) | Quick actions. |
| **Library pile** | Click for draw, look at the top, scry, surveil, mill, search. |
| **Graveyard / Exile** | Click to view; hover for a quick list. |
| **Tokens** | Make a token, or pick one your deck can create. |
| **Sideboard** | Swap cards in and out between games. |
| **Lasting effects** | Shows "until end of turn" effects and delayed triggers. |
| **Opponent controls** | Change the opponent's life, or tell the app they drew a card (for cards like Orcish Bowmasters). |
| **Hand sort** | Sort your hand, or drag cards sideways to reorder. |
| **Hover a card** | Shows it large in the right-hand panel with the app's reading of its rules text. |

### 7. Settings (⚙ Tools & Settings → Settings)
- **Graphics:** card sizes, text or images.
- **Playmat & frame:** playmat pictures, board frame, and the board layout switches (stack identical lands, dim cards that can't act, mana and phase strip, combat lane, fanned graveyard, zone depth).
- **Animations:** movement, spells, life changes, turn banners, the fanned hand, 3D hand tilt, floating battlefield and the physical card drag. Each one has its own switch.
- **Sound:** music and sound effects.
- **Tutor mode:** the teaching aids (phase bar, playability colours on cards in your hand, rules explanations, summoning-sickness hints, and so on). Switch off any you no longer need.

### 8. Getting help with a card
The app reads each card's text and tells you how much of it it handles. If a card is only partly understood, it says which part you resolve by hand. Right-click a card and choose **How the app reads this card…** to see this for one card. **Scan decks & save report** (on the screen where you pick a deck) checks every card in your decks and saves a text report you can send to the developer.

---

## Good to know
- **Your data stays on your computer.** Decks, settings and card data are stored locally. Nothing is uploaded.
- **It's a goldfish.** There is no opposing player. You control the opponent's life total, and you tell the app when they cast something or draw.
- **It follows the official rules.** Where a rule is hard, the app explains it instead of hiding it.
- Card data comes from [Scryfall](https://scryfall.com). Magic: The Gathering is a trademark of Wizards of the Coast. This is an unofficial fan project and is not affiliated with Wizards of the Coast.

## Something wrong?
Open an **Issue** on this repository. Say what you did, what you expected, and what happened. A saved deck scan report or a screenshot helps a lot.
