/**
 * Custom Card Game Simulator - Web Application Controller
 * Standalone browser build (runs both via local server and by opening index.html directly)
 */

// ==========================================
// 1. CONSTANTS & GAME CONFIGURATION
// ==========================================
const POWER_SEQUENCE = ['2', 'A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3'];

const RANK_POWER = {
  '3': 1,
  '4': 2,
  '5': 3,
  '6': 4,
  '7': 5,
  '8': 6,
  '9': 7,
  '10': 8,
  'J': 9,
  'Q': 10,
  'K': 11,
  'A': 12,
  '2': 13
};

const SUITS = [
  { symbol: '♦', name: 'Diamonds', color: 'red', power: 1 },
  { symbol: '♣', name: 'Clubs', color: 'black', power: 2 },
  { symbol: '♥', name: 'Hearts', color: 'red', power: 3 },
  { symbol: '♠', name: 'Spades', color: 'black', power: 4 }
];

const SUIT_SYMBOLS = ['♦', '♣', '♥', '♠'];
const MIN_PLAYERS = 4;
const STANDARD_DECK_SIZE = 52;

// ==========================================
// 2. CARD MODEL
// ==========================================
class Card {
  constructor(rank, suitSymbol) {
    if (RANK_POWER[rank] === undefined) {
      throw new Error(`Invalid card rank: ${rank}`);
    }
    const suitObj = SUITS.find(s => s.symbol === suitSymbol);
    if (!suitObj) {
      throw new Error(`Invalid card suit: ${suitSymbol}`);
    }

    this.rank = rank;
    this.suit = suitObj.symbol;
    this.suitName = suitObj.name;
    this.suitColor = suitObj.color;
    this.suitPower = suitObj.power;
    this.rankPower = RANK_POWER[rank];
  }

  compareRank(other) {
    return this.rankPower - other.rankPower;
  }

  compareTo(other) {
    if (this.rankPower !== other.rankPower) {
      return this.rankPower - other.rankPower;
    }
    return this.suitPower - other.suitPower;
  }

  toString() {
    return `${this.rank}${this.suit}`;
  }

  toJSON() {
    return {
      rank: this.rank,
      suit: this.suit,
      suitName: this.suitName,
      color: this.suitColor,
      rankPower: this.rankPower,
      suitPower: this.suitPower,
      code: this.toString()
    };
  }
}

// ==========================================
// 3. DECK MODEL
// ==========================================
class Deck {
  constructor(cards = null) {
    this.cards = cards ? [...cards] : Deck.createStandardDeck();
    this.excludedCards = [];
  }

  static createStandardDeck() {
    const cards = [];
    for (const rank of POWER_SEQUENCE) {
      for (const suit of SUIT_SYMBOLS) {
        cards.push(new Card(rank, suit));
      }
    }
    return cards;
  }

  static calculateDealingSpecs(playerCount) {
    if (playerCount < MIN_PLAYERS) {
      throw new Error(`Minimum player count is ${MIN_PLAYERS}. Received: ${playerCount}`);
    }
    const remainder = STANDARD_DECK_SIZE % playerCount;
    const playableCount = STANDARD_DECK_SIZE - remainder;
    const cardsPerPlayer = Math.floor(playableCount / playerCount);

    return {
      totalCards: STANDARD_DECK_SIZE,
      playerCount,
      remainder,
      playableCount,
      cardsPerPlayer
    };
  }

  shuffle(rng = Math.random) {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    return this;
  }

  prepareForPlayers(playerCount) {
    const specs = Deck.calculateDealingSpecs(playerCount);

    if (specs.remainder === 0) {
      this.excludedCards = [];
      return {
        playableCards: this.cards,
        excludedCards: [],
        specs
      };
    }

    // Sort full standard deck ascending by power to pick the exact lowest cards
    const sortedAll = Deck.createStandardDeck().sort((a, b) => a.compareTo(b));
    const cardsToExclude = sortedAll.slice(0, specs.remainder);
    const excludeKeys = new Set(cardsToExclude.map(c => c.toString()));

    this.excludedCards = [];
    const remaining = [];

    for (const card of this.cards) {
      if (excludeKeys.has(card.toString())) {
        this.excludedCards.push(card);
      } else {
        remaining.push(card);
      }
    }

    this.excludedCards.sort((a, b) => a.compareTo(b));
    this.cards = remaining;

    return {
      playableCards: this.cards,
      excludedCards: this.excludedCards,
      specs
    };
  }

  deal(playerCount) {
    const { specs } = this.prepareForPlayers(playerCount);
    const hands = Array.from({ length: playerCount }, () => []);

    let cardIdx = 0;
    for (let round = 0; round < specs.cardsPerPlayer; round++) {
      for (let p = 0; p < playerCount; p++) {
        hands[p].push(this.cards[cardIdx++]);
      }
    }

    return hands;
  }
}

// ==========================================
// 4. PLAYER MODEL
// ==========================================
class Player {
  constructor(id, name = null) {
    this.id = id;
    this.name = name || `Player ${id}`;
    this.hand = [];
    this.score = 0;
  }

  receiveCards(cards) {
    if (Array.isArray(cards)) {
      this.hand.push(...cards);
    } else if (cards) {
      this.hand.push(cards);
    }
    this.sortHand();
  }

  sortHand(order = 'desc') {
    this.hand.sort((a, b) => {
      const cmp = a.compareTo(b);
      return order === 'desc' ? -cmp : cmp;
    });
    return this.hand;
  }

  clearHand() {
    this.hand = [];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      handCount: this.hand.length,
      hand: this.hand.map(c => c.toJSON()),
      score: this.score
    };
  }
}

// ==========================================
// 5. GAME ENGINE
// ==========================================
class Game {
  constructor(playerCount = 4, playerNames = []) {
    this.deck = new Deck();
    this.players = [];
    this.excludedCards = [];
    this.dealingSpecs = null;
    this.state = 'SETUP';
    this.currentTurnIndex = 0;
    this.tableCards = [];
    this.gameLog = [];

    this.initPlayers(playerCount, playerNames);
  }

  initPlayers(count, names = []) {
    if (count < MIN_PLAYERS) {
      throw new Error(`Minimum ${MIN_PLAYERS} players required. Got: ${count}`);
    }
    this.players = [];
    for (let i = 1; i <= count; i++) {
      const name = names[i - 1] || `Player ${i}`;
      this.players.push(new Player(i, name));
    }
  }

  startRound(rng = Math.random) {
    this.deck = new Deck();
    this.deck.shuffle(rng);

    const { excludedCards, specs } = this.deck.prepareForPlayers(this.players.length);
    this.excludedCards = excludedCards;
    this.dealingSpecs = specs;

    for (const player of this.players) {
      player.clearHand();
    }

    const hands = this.deck.deal(this.players.length);
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].receiveCards(hands[i]);
    }

    this.state = 'DEALT';
    this.currentTurnIndex = 0;
    this.tableCards = [];

    return {
      specs: this.dealingSpecs,
      excludedCards: this.excludedCards,
      players: this.players
    };
  }

  getState() {
    return {
      state: this.state,
      playerCount: this.players.length,
      dealingSpecs: this.dealingSpecs,
      excludedCards: this.excludedCards.map(c => c.toJSON()),
      players: this.players.map(p => p.toJSON()),
      currentTurnIndex: this.currentTurnIndex,
      activePlayer: this.players[this.currentTurnIndex]?.name || null,
      tableCards: this.tableCards.map(c => c.toJSON()),
      gameLog: this.gameLog
    };
  }
}

// ==========================================
// 6. UI CONTROLLER
// ==========================================
let currentGame = null;
let playerCount = 4;

const playerCountInput = document.getElementById('playerCountInput');
const incrementBtn = document.getElementById('incrementPlayersBtn');
const decrementBtn = document.getElementById('decrementPlayersBtn');
const presetButtons = document.querySelectorAll('.preset-btn');
const dealBtn = document.getElementById('dealBtn');

const statFormula = document.getElementById('statFormula');
const statExcludedCount = document.getElementById('statExcludedCount');
const statCardsPerPlayer = document.getElementById('statCardsPerPlayer');
const excludedCardsContainer = document.getElementById('excludedCardsContainer');
const excludedBadge = document.getElementById('excludedBadge');
const playersContainer = document.getElementById('playersContainer');
const logStream = document.getElementById('logStream');
const tableStatus = document.getElementById('tableStatus');

function createCardElement(card, isExcluded = false) {
  const cardDiv = document.createElement('div');
  cardDiv.className = `card-item ${card.color} ${isExcluded ? 'excluded-card' : ''}`;
  cardDiv.title = `${card.rank} of ${card.suitName} (Power Rank: ${card.rankPower})`;

  cardDiv.innerHTML = `
    <div class="card-top">
      <span class="card-rank">${card.rank}</span>
      <span class="card-suit-small">${card.suit}</span>
    </div>
    <div class="card-center-suit">${card.suit}</div>
    <div class="card-power-pill">#${card.rankPower}</div>
  `;

  if (!isExcluded) {
    cardDiv.addEventListener('click', () => {
      addLog(`Selected ${card.code} from hand (Power: #${card.rankPower}). Ready for upcoming gameplay rules!`);
    });
  }

  return cardDiv;
}

function addLog(msg) {
  const now = new Date().toLocaleTimeString();
  const item = document.createElement('div');
  item.className = 'log-item';
  item.textContent = `[${now}] ${msg}`;
  logStream.appendChild(item);
  logStream.scrollTop = logStream.scrollHeight;
}

function renderGame() {
  if (!currentGame) return;

  const state = currentGame.getState();
  const specs = state.dealingSpecs;

  // Formula & Specs
  statFormula.textContent = `52 % ${specs.playerCount} = ${specs.remainder}`;
  statExcludedCount.textContent = `${specs.remainder} card${specs.remainder === 1 ? '' : 's'}`;
  statCardsPerPlayer.textContent = `${specs.cardsPerPlayer} cards`;

  // Excluded Tray
  excludedCardsContainer.innerHTML = '';
  if (state.excludedCards.length === 0) {
    excludedBadge.textContent = '0 Excluded';
    excludedBadge.style.background = '#475569';
    excludedCardsContainer.innerHTML = '<span class="empty-state">No cards excluded (deck splits evenly).</span>';
  } else {
    excludedBadge.textContent = `${state.excludedCards.length} Excluded (Lowest)`;
    excludedBadge.style.background = '#ef4444';
    state.excludedCards.forEach(c => {
      excludedCardsContainer.appendChild(createCardElement(c, true));
    });
  }

  // Players Hand
  playersContainer.innerHTML = '';
  state.players.forEach(player => {
    const board = document.createElement('div');
    board.className = 'player-board';

    const header = document.createElement('div');
    header.className = 'player-board-header';
    header.innerHTML = `
      <div class="player-title">
        <span class="player-name">${player.name}</span>
      </div>
      <span class="card-count-badge">${player.handCount} Cards</span>
    `;

    const handDiv = document.createElement('div');
    handDiv.className = 'player-hand';
    player.hand.forEach(card => {
      handDiv.appendChild(createCardElement(card));
    });

    board.appendChild(header);
    board.appendChild(handDiv);
    playersContainer.appendChild(board);
  });

  tableStatus.textContent = `Active round: ${specs.playerCount} players, ${specs.cardsPerPlayer} cards each. Power hierarchy: 2 > A > K > ... > 3.`;
}

function dealNewRound() {
  playerCount = Math.max(4, parseInt(playerCountInput.value, 10) || 4);
  playerCountInput.value = playerCount;

  currentGame = new Game(playerCount);
  currentGame.startRound();

  const specs = currentGame.dealingSpecs;
  if (specs.remainder > 0) {
    const excludedList = currentGame.excludedCards.map(c => c.toString()).join(' ');
    addLog(`Dealt to ${playerCount} players. 52 mod ${playerCount} = ${specs.remainder}. Excluded lowest: [${excludedList}].`);
  } else {
    addLog(`Dealt to ${playerCount} players. 52 mod ${playerCount} = 0. All 52 cards dealt (${specs.cardsPerPlayer} each).`);
  }

  renderGame();
}

function updatePresetButtons(count) {
  presetButtons.forEach(btn => {
    if (parseInt(btn.getAttribute('data-players'), 10) === count) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Event Listeners
dealBtn.addEventListener('click', dealNewRound);

incrementBtn.addEventListener('click', () => {
  playerCountInput.value = (parseInt(playerCountInput.value, 10) || 4) + 1;
  updatePresetButtons(parseInt(playerCountInput.value, 10));
  dealNewRound();
});

decrementBtn.addEventListener('click', () => {
  const current = parseInt(playerCountInput.value, 10) || 4;
  if (current > 4) {
    playerCountInput.value = current - 1;
    updatePresetButtons(parseInt(playerCountInput.value, 10));
    dealNewRound();
  }
});

playerCountInput.addEventListener('change', () => {
  let val = parseInt(playerCountInput.value, 10);
  if (isNaN(val) || val < 4) val = 4;
  playerCountInput.value = val;
  updatePresetButtons(val);
  dealNewRound();
});

presetButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const count = parseInt(btn.getAttribute('data-players'), 10);
    playerCountInput.value = count;
    updatePresetButtons(count);
    dealNewRound();
  });
});

// Initial deal on load
dealNewRound();
