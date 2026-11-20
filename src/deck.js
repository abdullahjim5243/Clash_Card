import { POWER_SEQUENCE, SUIT_SYMBOLS, MIN_PLAYERS, STANDARD_DECK_SIZE } from './constants.js';
import { Card } from './card.js';

export class Deck {
  constructor(cards = null) {
    this.cards = cards ? [...cards] : Deck.createStandardDeck();
    this.excludedCards = [];
  }

  /**
   * Generates a fresh standard 52-card deck.
   * @returns {Card[]}
   */
  static createStandardDeck() {
    const cards = [];
    for (const rank of POWER_SEQUENCE) {
      for (const suit of SUIT_SYMBOLS) {
        cards.push(new Card(rank, suit));
      }
    }
    return cards;
  }

  /**
   * Computes the remainder and number of cards per player for a given player count.
   * @param {number} playerCount 
   */
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

  /**
   * Shuffles this deck in-place using the Fisher-Yates algorithm.
   * @param {Function} [rng=Math.random]
   */
  shuffle(rng = Math.random) {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    return this;
  }

  /**
   * Identifies and removes the lowest (52 % n) cards from the deck.
   * Lowest is determined by rank power (3 is lowest, then 4, etc.),
   * with suit order (♦ < ♣ < ♥ < ♠) breaking ties.
   * 
   * @param {number} playerCount
   * @returns {{ playableCards: Card[], excludedCards: Card[], specs: object }}
   */
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

    // Sort a full standard deck in ascending order of power to find the exact lowest cards
    const sortedAll = Deck.createStandardDeck().sort((a, b) => a.compareTo(b));
    const cardsToExclude = sortedAll.slice(0, specs.remainder);
    const excludeKeys = new Set(cardsToExclude.map(c => c.toString()));

    this.excludedCards = [];
    const remainingCards = [];

    for (const card of this.cards) {
      if (excludeKeys.has(card.toString())) {
        this.excludedCards.push(card);
      } else {
        remainingCards.push(card);
      }
    }

    // Sort excluded cards by power for clear inspection
    this.excludedCards.sort((a, b) => a.compareTo(b));
    this.cards = remainingCards;

    return {
      playableCards: this.cards,
      excludedCards: this.excludedCards,
      specs
    };
  }

  /**
   * Deals cards evenly to n players.
   * @param {number} playerCount
   * @returns {Card[][]} Array of player hands
   */
  deal(playerCount) {
    const { specs } = this.prepareForPlayers(playerCount);
    const hands = Array.from({ length: playerCount }, () => []);

    // Deal one card at a time in round-robin fashion
    let cardIdx = 0;
    for (let round = 0; round < specs.cardsPerPlayer; round++) {
      for (let p = 0; p < playerCount; p++) {
        hands[p].push(this.cards[cardIdx++]);
      }
    }

    return hands;
  }
}
