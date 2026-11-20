# Custom Card Game

An extensible card game engine built based on custom ranking and dynamic deck trimming rules.

For player instructions, see [GAME_RULES.md](GAME_RULES.md).

---

## 🃏 Implemented Rules

### 1. Power Sequence
The card hierarchy from strongest to weakest:
$$\mathbf{2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3}$$

- **`2`** is the highest rank card in the game (beats Aces).
- **`3`** is the lowest rank card in the game.

### 2. Player Count
- Minimum **4 players** ($n \ge 4$).

### 3. Dynamic Deck Trimming ($52 \pmod n$)
When dealing a standard 52-card deck:
- The remainder $r = 52 \pmod n$ determines how many cards cannot be dealt evenly.
- If $r > 0$, the **$r$ lowest cards** (starting from $3$s, then $4$s if needed) are permanently **excluded** from the round before dealing.
- Each player receives exactly $(52 - r) / n$ cards.

#### Dealing Breakdown:
| Players ($n$) | $52 \pmod n$ | Lowest Cards Excluded | Playable Cards | Cards Per Player |
|:---:|:---:|:---:|:---:|:---:|
| **4** | 0 | None | 52 | **13** |
| **5** | 2 | 2 lowest ($3♦, 3♣$) | 50 | **10** |
| **6** | 4 | 4 lowest (All four $3$s: $3♦, 3♣, 3♥, 3♠$) | 48 | **8** |
| **7** | 3 | 3 lowest ($3♦, 3♣, 3♥$) | 49 | **7** |
| **8** | 4 | 4 lowest (All four $3$s) | 48 | **6** |
| **9** | 7 | 7 lowest (All four $3$s + three $4$s) | 45 | **5** |
| **10** | 2 | 2 lowest ($3♦, 3♣$) | 50 | **5** |

---

## 🚀 How to Run

### 1. Run Automated Unit Tests
```bash
npm test
```
Runs 11 automated test assertions verifying rank power ordering, lowest-card exclusion math, hand sorting, and player constraints.

### 2. Run CLI Simulation
```bash
npm run cli
```
Displays terminal simulation of dealing with 4, 5, 6, 7, and 8 players.

### 3. Open Interactive Web UI
Start the backend server, which owns the deck, dealing calculations, rules, and AI turns:
  ```bash
  npm start
  ```
  Then visit `http://localhost:3000`. The frontend sends actions to the backend API and renders the state it returns. Open the site through the server rather than opening `public/index.html` directly.

---

## 📁 Project Architecture
```
card game/
├── src/
│   ├── constants.js   # Power sequence, rank values, suits
│   ├── card.js        # Card comparison and formatting
│   ├── deck.js        # 52-card deck, shuffling, (52 % n) trimming
│   ├── player.js      # Player hands & auto-sorting by power
│   ├── game.js        # Core round lifecycle & table state
│   └── index.js       # CLI runner & export hub
├── test/
│   └── game.test.js   # Node.js native test suite
├── public/
│   ├── index.html     # Interactive table UI
│   ├── styles.css     # Casino felt green layout & playing cards
│   └── app.js         # Frontend controller
└── package.json
```

---

## Playing a round

- Player 1 is the human seat; the remaining seats are computer players.
- The lead can start with one card or a pair of equal rank. Each response must match the play type and rank at least as high as the current play. Players may pass while responding.
- When every other active player passes, the last player to play takes the lead and may start a new single or pair.
- The first player to empty their hand wins; the last player still holding cards loses. At the next deal, they exchange cards: the winner gives their lowest card and receives the loser's highest card.
- The previous round's winner starts the next round. The New Game button resets the player count and starts fresh.

These are the initial playable rules. The game can be extended as you send the remaining instructions.
