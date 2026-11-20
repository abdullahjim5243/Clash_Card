export class Player {
  /**
   * @param {string|number} id 
   * @param {string} [name]
   * @param {boolean} [isAI=false]
   */
  constructor(id, name = null, isAI = false, aiDifficulty = 'normal') {
    this.id = id;
    this.name = name || `Player ${id}`;
    this.isAI = isAI;
    this.aiDifficulty = isAI ? aiDifficulty : null;
    this.hand = [];
    this.score = 0;
    this.finishRank = null; // 1 for winner, 2 for 2nd, etc.
  }

  /**
   * Adds cards to the player's hand and auto-sorts by power (2 > A > ... > 3).
   * @param {Card|Card[]} cards 
   */
  receiveCards(cards) {
    if (Array.isArray(cards)) {
      this.hand.push(...cards);
    } else if (cards) {
      this.hand.push(cards);
    }
    this.sortHand();
  }

  /**
   * Sorts the hand based on game power sequence.
   * @param {'desc'|'asc'} [order='desc'] - 'desc': Highest power (2, A, K...) first.
   */
  sortHand(order = 'desc') {
    this.hand.sort((a, b) => {
      const cmp = a.compareTo(b);
      return order === 'desc' ? -cmp : cmp;
    });
    return this.hand;
  }

  /**
   * Checks if player has finished their hand.
   * @returns {boolean}
   */
  isFinished() {
    return this.hand.length === 0;
  }

  /**
   * Returns player's highest power card.
   * @returns {Card|null}
   */
  getHighestCard() {
    if (this.hand.length === 0) return null;
    // Hand sorted desc: index 0 is highest power
    return this.hand[0];
  }

  /**
   * Returns player's lowest power card.
   * @returns {Card|null}
   */
  getLowestCard() {
    if (this.hand.length === 0) return null;
    // Hand sorted desc: last item is lowest power
    return this.hand[this.hand.length - 1];
  }

  /**
   * Checks if player owns a specific card.
   * @param {string|Card} card 
   * @returns {boolean}
   */
  hasCard(card) {
    const cardStr = typeof card === 'string' ? card : card.toString();
    return this.hand.some(c => c.toString() === cardStr);
  }

  /**
   * Removes and returns a card from hand if present.
   * @param {string|Card} card 
   * @returns {Card|null}
   */
  playCard(card) {
    const cardStr = typeof card === 'string' ? card : card.toString();
    const index = this.hand.findIndex(c => c.toString() === cardStr);
    if (index === -1) {
      return null;
    }
    const [played] = this.hand.splice(index, 1);
    return played;
  }

  /**
   * Removes multiple cards from hand.
   * @param {Card[]|string[]} cards 
   * @returns {Card[]}
   */
  playCards(cards) {
    const played = [];
    for (const c of cards) {
      const card = this.playCard(c);
      if (card) played.push(card);
    }
    return played;
  }

  /**
   * Groups hand by rank to find pairs.
   * @returns {Map<string, Card[]>}
   */
  getRankGroups() {
    const groups = new Map();
    for (const card of this.hand) {
      if (!groups.has(card.rank)) {
        groups.set(card.rank, []);
      }
      groups.get(card.rank).push(card);
    }
    return groups;
  }

  /**
   * Returns all available pairs in hand sorted by power ascending.
   * @returns {Card[][]}
   */
  getPairs() {
    const groups = this.getRankGroups();
    const pairs = [];
    for (const [rank, cards] of groups.entries()) {
      if (cards.length >= 2) {
        // Sort pairs by rankPower ascending
        pairs.push([cards[0], cards[1]]);
      }
    }
    pairs.sort((a, b) => a[0].rankPower - b[0].rankPower);
    return pairs;
  }

  clearHand() {
    this.hand = [];
    this.finishRank = null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      isAI: this.isAI,
      aiDifficulty: this.aiDifficulty,
      handCount: this.hand.length,
      hand: this.hand.map(c => c.toJSON()),
      score: this.score,
      finishRank: this.finishRank,
      isFinished: this.isFinished()
    };
  }
}
