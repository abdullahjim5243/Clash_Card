import { MIN_PLAYERS } from './constants.js';
import { Deck } from './deck.js';
import { Player } from './player.js';

export class Game {
  /**
   * @param {number} [playerCount=4] - Number of players (at least 4)
   * @param {string[]} [playerNames=[]] - Custom names
   */
  constructor(playerCount = 4, playerNames = [], options = {}) {
    this.roundNumber = 0;
    this.players = [];
    this.excludedCards = [];
    this.dealingSpecs = null;
    this.state = 'SETUP'; // 'SETUP' | 'PLAYING' | 'ROUND_OVER'
    this.currentTurnIndex = 0;
    this.leadPlayerId = null;
    this.starterPlayerId = 1; // Round 1 starts with Player 1, subsequent with previous Winner

    // Current trick / play on the table
    this.currentPlay = null; // { type: 'SINGLE'|'PAIR', cards: Card[], rankPower: number, rank: string, playedById: number, playedByName: string }
    this.consecutivePasses = 0;
    this.tableCards = []; // Visual history of cards currently on the felt

    // Finishers tracking
    this.finishOrder = [];
    this.lastWinner = null;
    this.lastLoser = null;
    this.lastCardExchange = null; // { winnerId, loserId, loserGaveCard, winnerGaveCard }

    this.gameLog = [];

    this.initPlayers(playerCount, playerNames, options);
  }

  initPlayers(count, names = [], options = {}) {
    if (count < MIN_PLAYERS) {
      throw new Error(`Cannot initialize game: minimum ${MIN_PLAYERS} players required. Got: ${count}`);
    }

    this.players = [];
    for (let i = 1; i <= count; i++) {
      const name = names[i - 1] || `Player ${i}`;
      // Player 1 is Human by default, others are AI
      const isAI = Array.isArray(options.aiPlayerIds)
        ? options.aiPlayerIds.includes(i)
        : options.aiPlayers === false ? false : i !== 1;
      this.players.push(new Player(i, name, isAI, isAI ? (options.aiDifficulty || 'normal') : null));
    }
  }

  getActivePlayers() {
    return this.players.filter(p => !p.isFinished());
  }

  getPlayerById(id) {
    return this.players.find(p => p.id === id) || null;
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnIndex];
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
   * Starts a round (Round 1 or next rounds).
   * Automatically performs card exchange if round > 1 and winner/loser exist.
   */
  startRound(rng = Math.random) {
    this.roundNumber += 1;
    this.finishOrder = [];
    this.currentPlay = null;
    this.consecutivePasses = 0;
    this.tableCards = [];
    this.lastCardExchange = null;

    // 1. Deck setup and (52 mod n) lowest card exclusion
    this.deck = new Deck();
    this.deck.shuffle(rng);
    const { excludedCards, specs } = this.deck.prepareForPlayers(this.players.length);
    this.excludedCards = excludedCards;
    this.dealingSpecs = specs;

    // 2. Clear hands
    for (const player of this.players) {
      player.clearHand();
    }

    // 3. Deal equal cards
    const hands = this.deck.deal(this.players.length);
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].receiveCards(hands[i]);
    }

    this.log(`--- Round ${this.roundNumber} Started ---`);
    if (specs.remainder > 0) {
      this.log(`52 mod ${specs.playerCount} = ${specs.remainder}. Excluded ${specs.remainder} lowest cards: ${this.excludedCards.map(c => c.toString()).join(' ')}`);
    } else {
      this.log(`52 mod ${specs.playerCount} = 0. All 52 cards dealt (${specs.cardsPerPlayer} each).`);
    }

    // 4. Card Exchange between previous Winner and Loser (for Round 2 onwards)
    if (this.roundNumber > 1 && this.lastWinner && this.lastLoser) {
      this.executeCardExchange();
    }

    // 5. Determine who starts: Winner of previous game, or Player 1 for first game
    if (this.lastWinner) {
      this.starterPlayerId = this.lastWinner.id;
    } else {
      this.starterPlayerId = this.players[0].id;
    }

    const starterIdx = this.players.findIndex(p => p.id === this.starterPlayerId);
    this.currentTurnIndex = starterIdx !== -1 ? starterIdx : 0;
    this.leadPlayerId = this.players[this.currentTurnIndex].id;

    this.state = 'PLAYING';
    this.log(`${this.players[this.currentTurnIndex].name} starts the game with the Lead.`);

    return {
      roundNumber: this.roundNumber,
      specs: this.dealingSpecs,
      excludedCards: this.excludedCards,
      cardExchange: this.lastCardExchange,
      starter: this.players[this.currentTurnIndex]
    };
  }

  /**
   * Rule: Loser gives highest power card to Winner; Winner gives lowest power card to Loser.
   */
  executeCardExchange() {
    const winner = this.getPlayerById(this.lastWinner.id);
    const loser = this.getPlayerById(this.lastLoser.id);

    if (!winner || !loser) return;

    // Loser gives highest card
    const loserHighest = loser.getHighestCard();
    // Winner gives lowest card
    const winnerLowest = winner.getLowestCard();

    if (loserHighest && winnerLowest) {
      loser.playCard(loserHighest);
      winner.playCard(winnerLowest);

      winner.receiveCards(loserHighest);
      loser.receiveCards(winnerLowest);

      this.lastCardExchange = {
        winnerId: winner.id,
        winnerName: winner.name,
        loserId: loser.id,
        loserName: loser.name,
        loserGave: loserHighest.toJSON(),
        winnerGave: winnerLowest.toJSON()
      };

      this.log(`[Card Exchange] Loser ${loser.name} gave highest card (${loserHighest.toString()}) to Winner ${winner.name}.`);
      this.log(`[Card Exchange] Winner ${winner.name} gave lowest card (${winnerLowest.toString()}) to Loser ${loser.name}.`);
    }
  }

  /**
   * Validates a candidate play.
   * @param {Player} player 
   * @param {Card[]} cards - empty array signifies PASS
   * @returns {{ valid: boolean, error?: string, playType?: 'SINGLE'|'PAIR'|'PASS' }}
   */
  validateMove(player, cards) {
    if (player.id !== this.getCurrentPlayer().id) {
      return { valid: false, error: "Not player's turn." };
    }

    // Is it a PASS?
    if (!cards || cards.length === 0) {
      if (this.currentPlay === null) {
        return { valid: false, error: "Cannot pass when you have the lead. You must play a card or pair." };
      }
      return { valid: true, playType: 'PASS' };
    }

    // Verify player actually holds these cards
    for (const c of cards) {
      if (!player.hasCard(c)) {
        return { valid: false, error: `Player does not hold ${c.toString()}.` };
      }
    }

    // Play size validation: must be 1 card (SINGLE) or 2 cards of same rank (PAIR)
    if (cards.length === 1) {
      // Single card
      const candidateRankPower = cards[0].rankPower;

      if (this.currentPlay !== null) {
        if (this.currentPlay.type !== 'SINGLE') {
          return { valid: false, error: `Must play a ${this.currentPlay.type} (current play requires 2 cards of same rank).` };
        }
        if (candidateRankPower < this.currentPlay.rankPower) {
          return {
            valid: false,
            error: `Card ${cards[0].toString()} is weaker than table rank ${this.currentPlay.rank}. Must be same or higher power.`
          };
        }
      }
      return { valid: true, playType: 'SINGLE' };
    } else if (cards.length === 2) {
      // Pair / Dual card
      if (cards[0].rank !== cards[1].rank) {
        return { valid: false, error: `Dual card must be two cards of the same rank (got ${cards[0].rank} and ${cards[1].rank}).` };
      }

      const candidateRankPower = cards[0].rankPower;

      if (this.currentPlay !== null) {
        if (this.currentPlay.type !== 'PAIR') {
          return { valid: false, error: `Must play a ${this.currentPlay.type} (current play requires a single card).` };
        }
        if (candidateRankPower < this.currentPlay.rankPower) {
          return {
            valid: false,
            error: `Pair of ${cards[0].rank}s is weaker than table pair of ${this.currentPlay.rank}s. Must be same or higher power.`
          };
        }
      }
      return { valid: true, playType: 'PAIR' };
    } else {
      return { valid: false, error: "Invalid play: You can only play 1 card (single) or 2 cards of same rank (dual/pair)." };
    }
  }

  /**
   * Executes a move (Play single/dual card OR Pass).
   * @param {number} playerId 
   * @param {Card[]|string[]|null} cardsInput 
   */
  playMove(playerId, cardsInput = []) {
    if (this.state !== 'PLAYING') {
      throw new Error(`Cannot play: game is currently in state ${this.state}`);
    }

    const player = this.getPlayerById(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found.`);
    }

    // Convert strings if needed
    let cards = [];
    if (Array.isArray(cardsInput)) {
      cards = cardsInput.map(c => {
        if (typeof c === 'string') {
          return player.hand.find(h => h.toString() === c) || null;
        }
        return c;
      }).filter(Boolean);
    }

    const validation = this.validateMove(player, cards);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    if (validation.playType === 'PASS') {
      this.handlePass(player);
    } else {
      this.handlePlay(player, cards, validation.playType);
    }

    return this.getState();
  }

  handlePass(player) {
    this.consecutivePasses += 1;
    this.log(`${player.name} passed.`);

    const activePlayers = this.getActivePlayers();

    // If all other active players have passed consecutively, the trick is won!
    if (this.consecutivePasses >= activePlayers.length - 1) {
      this.resolveTrick();
    } else {
      this.advanceTurn();
    }
  }

  handlePlay(player, cards, playType) {
    player.playCards(cards);
    this.consecutivePasses = 0;

    this.currentPlay = {
      type: playType,
      cards: [...cards],
      rankPower: cards[0].rankPower,
      rank: cards[0].rank,
      playedById: player.id,
      playedByName: player.name
    };

    this.tableCards.push(...cards);
    this.log(`${player.name} played ${playType === 'PAIR' ? 'Pair of ' : 'Single '}${cards.map(c => c.toString()).join(' ')}`);

    // Check if player has emptied their hand (finished!)
    if (player.isFinished()) {
      this.finishOrder.push(player);
      player.finishRank = this.finishOrder.length;
      this.log(`🎉 ${player.name} has finished all cards! (Rank #${player.finishRank})`);

      // Check if this was the 1st finisher (Winner)
      if (this.finishOrder.length === 1) {
        this.lastWinner = player;
      }

      // If only 1 player remains with cards, that player is the Loser!
      const activeRemaining = this.getActivePlayers();
      if (activeRemaining.length === 1) {
        const loser = activeRemaining[0];
        this.finishOrder.push(loser);
        loser.finishRank = this.finishOrder.length;
        this.lastLoser = loser;
        this.log(`💥 ${loser.name} is the Loser (Last with cards).`);
        this.endRound();
        return;
      }

      // Finishing immediately hands a fresh lead to the next active player.
      // They choose a new single or pair instead of responding to the finisher's card.
      let nextIdx = this.players.findIndex(p => p.id === player.id);
      do {
        nextIdx = (nextIdx + 1) % this.players.length;
      } while (this.players[nextIdx].isFinished());

      const nextPlayer = this.players[nextIdx];
      this.currentPlay = null;
      this.consecutivePasses = 0;
      this.tableCards = [];
      this.currentTurnIndex = nextIdx;
      this.leadPlayerId = nextPlayer.id;
      this.log(`${player.name} finished their hand. Lead passes automatically to ${nextPlayer.name}, who starts a new play.`);
      return;
    }

    this.advanceTurn();
  }

  /**
   * Called when all other active players passed:
   * Clears table and awards Lead to the last player who played cards.
   */
  resolveTrick() {
    const lastPlayerId = this.currentPlay.playedById;
    const lastPlayer = this.getPlayerById(lastPlayerId);

    this.log(`All players passed. ${lastPlayer.name} wins the trick and gets the Lead!`);

    this.currentPlay = null;
    this.consecutivePasses = 0;
    this.tableCards = [];

    // If the trick winner is already finished, lead passes to next active player
    if (lastPlayer.isFinished()) {
      let nextIdx = this.players.findIndex(p => p.id === lastPlayer.id);
      do {
        nextIdx = (nextIdx + 1) % this.players.length;
      } while (this.players[nextIdx].isFinished());
      this.currentTurnIndex = nextIdx;
      this.leadPlayerId = this.players[nextIdx].id;
      this.log(`(Previous leader finished, Lead passes to ${this.players[nextIdx].name})`);
    } else {
      this.currentTurnIndex = this.players.findIndex(p => p.id === lastPlayer.id);
      this.leadPlayerId = lastPlayer.id;
    }
  }

  /**
   * Advances current turn index to the next active player.
   */
  advanceTurn() {
    let nextIdx = this.currentTurnIndex;
    let found = false;
    for (let i = 0; i < this.players.length; i++) {
      nextIdx = (nextIdx + 1) % this.players.length;
      if (!this.players[nextIdx].isFinished()) {
        found = true;
        break;
      }
    }

    if (found) {
      this.currentTurnIndex = nextIdx;
    }
  }

  endRound() {
    this.state = 'ROUND_OVER';
    this.log(`=== Round ${this.roundNumber} Ended ===`);
    this.log(`Winner: ${this.lastWinner ? this.lastWinner.name : 'None'}`);
    this.log(`Loser: ${this.lastLoser ? this.lastLoser.name : 'None'}`);
  }

  /**
   * Calculates a smart legal move for an AI player.
   * @param {Player} player 
   * @returns {Card[]|[]} Cards to play or [] to pass
   */
  getAIMove(player) {
    const difficulty = player.aiDifficulty || 'normal';
    if (difficulty === 'easy') {
      if (this.currentPlay === null) {
        return player.hand.length ? [player.hand[Math.floor(Math.random() * player.hand.length)]] : [];
      }
      if (Math.random() < 0.3) return [];
      if (this.currentPlay.type === 'SINGLE') {
        const cards = player.hand.filter(card => card.rankPower >= this.currentPlay.rankPower);
        return cards.length ? [cards[Math.floor(Math.random() * cards.length)]] : [];
      }
      const pairs = player.getPairs().filter(pair => pair[0].rankPower >= this.currentPlay.rankPower);
      return pairs.length ? pairs[Math.floor(Math.random() * pairs.length)] : [];
    }

    if (difficulty === 'hard') {
      const finishPair = player.getPairs().find(pair => pair.length === player.hand.length);
      if (finishPair) return finishPair;
      if (player.hand.length === 1) {
        const onlyCard = player.hand[0];
        if (!this.currentPlay || (this.currentPlay.type === 'SINGLE' && onlyCard.rankPower >= this.currentPlay.rankPower)) return [onlyCard];
      }
    }

    if (this.currentPlay === null) {
      // AI has Lead: can play single or pair
      // Strategy: if AI has pairs of low ranks (power <= 8), play lowest pair to dump cards.
      // Otherwise play lowest single card.
      const pairs = player.getPairs();
      if (pairs.length > 0 && (difficulty === 'hard' || pairs[0][0].rankPower <= 8)) {
        return pairs[0];
      }
      // Play lowest single card
      const lowest = player.getLowestCard();
      return lowest ? [lowest] : [];
    }

    if (this.currentPlay.type === 'SINGLE') {
      // Must play single card >= current rank power
      const minPower = this.currentPlay.rankPower;
      // Filter cards in hand that satisfy minPower, sorted ascending
      const eligible = player.hand
        .filter(c => c.rankPower >= minPower)
        .sort((a, b) => a.compareTo(b));

      if (eligible.length > 0) {
        return [eligible[0]]; // play lowest eligible
      }
      return []; // Pass
    }

    if (this.currentPlay.type === 'PAIR') {
      // Must play pair >= current rank power
      const minPower = this.currentPlay.rankPower;
      const pairs = player.getPairs().filter(p => p[0].rankPower >= minPower);

      if (pairs.length > 0) {
        return pairs[0]; // play lowest eligible pair
      }
      return []; // Pass
    }

    return [];
  }

  getState() {
    const activePlayer = this.getCurrentPlayer();
    return {
      roundNumber: this.roundNumber,
      state: this.state,
      playerCount: this.players.length,
      dealingSpecs: this.dealingSpecs,
      excludedCards: this.excludedCards.map(c => c.toJSON()),
      players: this.players.map(p => p.toJSON()),
      currentTurnIndex: this.currentTurnIndex,
      activePlayer: activePlayer ? activePlayer.toJSON() : null,
      leadPlayerId: this.leadPlayerId,
      currentPlay: this.currentPlay ? {
        ...this.currentPlay,
        cards: this.currentPlay.cards.map(c => c.toJSON())
      } : null,
      consecutivePasses: this.consecutivePasses,
      tableCards: this.tableCards.map(c => c.toJSON()),
      finishOrder: this.finishOrder.map(p => ({ id: p.id, name: p.name, rank: p.finishRank })),
      lastWinner: this.lastWinner ? { id: this.lastWinner.id, name: this.lastWinner.name } : null,
      lastLoser: this.lastLoser ? { id: this.lastLoser.id, name: this.lastLoser.name } : null,
      lastCardExchange: this.lastCardExchange,
      gameLog: this.gameLog
    };
  }
}
