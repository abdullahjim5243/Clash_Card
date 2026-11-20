import { RANK_POWER, SUITS } from './constants.js';

export class Card {
  /**
   * @param {string} rank - e.g. '2', 'A', 'K', ..., '3'
   * @param {string} suitSymbol - '♦', '♣', '♥', or '♠'
   */
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

  /**
   * Compare rank power of this card to another card.
   * Returns:
   *   > 0 if this card has higher rank power
   *   < 0 if this card has lower rank power
   *   = 0 if ranks are equal
   */
  compareRank(otherCard) {
    return this.rankPower - otherCard.rankPower;
  }

  /**
   * Total comparison including suit tie-breaker.
   * Useful for sorting cards deterministically and finding absolute lowest cards.
   */
  compareTo(otherCard) {
    if (this.rankPower !== otherCard.rankPower) {
      return this.rankPower - otherCard.rankPower;
    }
    return this.suitPower - otherCard.suitPower;
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
