export class Player {
  /**
   * @param {string|number} id 
   * @param {string} [name]
   */
  constructor(id, name = null) {
    this.id = id;
    this.name = name || `Player ${id}`;
    this.hand = [];
    this.score = 0;
  }

  /**
   * Adds cards to the player's hand.
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
