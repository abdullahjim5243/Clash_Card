import { MIN_PLAYERS } from './constants.js';
import { Deck } from './deck.js';
import { Player } from './player.js';

export class Game {
  /**
   * @param {number} [playerCount=4] - Number of players (at least 4)
   * @param {string[]} [playerNames=[]] - Optional custom player names
   */
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

  /**
   * Initializes player instances.
   */
  initPlayers(count, names = []) {
    if (count < MIN_PLAYERS) {
      throw new Error(`Cannot initialize game: minimum ${MIN_PLAYERS} players required. Got: ${count}`);
    }

    this.players = [];
    for (let i = 1; i <= count; i++) {
      const name = names[i - 1] || `Player ${i}`;
      this.players.push(new Player(i, name));
    }
  }

  /**
   * Starts a new round:
   * 1. Resets and shuffles the standard 52-card deck.
   * 2. Calculates (52 mod n) and excludes the lowest cards.
   * 3. Deals remaining cards equally to all players.
   * 4. Sorts each player's hand by power sequence (2 > A > K > ... > 3).
   */
  startRound(rng = Math.random) {
    this.deck = new Deck();
    this.deck.shuffle(rng);

    // Prepare deck and exclude lowest (52 % n) cards
    const { excludedCards, specs } = this.deck.prepareForPlayers(this.players.length);
    this.excludedCards = excludedCards;
    this.dealingSpecs = specs;

    // Clear previous hands
    for (const player of this.players) {
      player.clearHand();
    }

    // Deal cards round-robin
    const hands = this.deck.deal(this.players.length);
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].receiveCards(hands[i]);
    }

    this.state = 'DEALT';
    this.currentTurnIndex = 0;
    this.tableCards = [];

    this.log(`New round started with ${this.players.length} players.`);
    if (specs.remainder > 0) {
      this.log(`52 mod ${specs.playerCount} = ${specs.remainder}. Excluded lowest ${specs.remainder} card(s): ${this.excludedCards.map(c => c.toString()).join(', ')}.`);
    } else {
      this.log(`52 mod ${specs.playerCount} = 0. All 52 cards in play.`);
    }
    this.log(`Each player dealt ${specs.cardsPerPlayer} cards.`);

    return {
      specs: this.dealingSpecs,
      excludedCards: this.excludedCards,
      players: this.players
    };
  }

  log(message) {
    const entry = {
      timestamp: new Date().toISOString(),
      message
    };
    this.gameLog.push(entry);
    return entry;
  }

  /**
   * Returns serializable game state for UI / API consumption.
   */
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
