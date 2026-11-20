import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Card } from '../src/card.js';
import { Deck } from '../src/deck.js';
import { Player } from '../src/player.js';
import { Game } from '../src/game.js';
import { POWER_SEQUENCE, RANK_POWER, MIN_PLAYERS } from '../src/constants.js';

describe('Power Sequence and Card Comparisons', () => {
  test('ranks match the exact requested power hierarchy: 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3', () => {
    for (let i = 0; i < POWER_SEQUENCE.length - 1; i++) {
      const higherRank = POWER_SEQUENCE[i];
      const lowerRank = POWER_SEQUENCE[i + 1];
      assert.ok(
        RANK_POWER[higherRank] > RANK_POWER[lowerRank],
        `Rank ${higherRank} must be strictly stronger than ${lowerRank}`
      );
    }
  });

  test('Card comparison works according to power sequence', () => {
    const card2 = new Card('2', '♠');
    const cardA = new Card('A', '♠');
    const cardK = new Card('K', '♥');
    const card3 = new Card('3', '♦');

    assert.ok(card2.compareRank(cardA) > 0, '2 must beat A');
    assert.ok(cardA.compareRank(cardK) > 0, 'A must beat K');
    assert.ok(cardK.compareRank(card3) > 0, 'K must beat 3');
    assert.ok(card3.compareRank(card2) < 0, '3 must lose to 2');
  });

  test('Invalid rank throws descriptive error', () => {
    assert.throws(() => new Card('Joker', '♠'), /Invalid card rank/);
  });
});

describe('Player Count and Deck Trimming (52 mod n)', () => {
  test('Requires at least 4 players', () => {
    assert.throws(() => new Game(3), /minimum 4 players required/);
    assert.doesNotThrow(() => new Game(4));
    assert.doesNotThrow(() => new Game(6));
  });

  test('4 Players: 52 % 4 = 0, no cards excluded, 13 cards each', () => {
    const specs = Deck.calculateDealingSpecs(4);
    assert.equal(specs.remainder, 0);
    assert.equal(specs.playableCount, 52);
    assert.equal(specs.cardsPerPlayer, 13);

    const game = new Game(4);
    game.startRound();
    const state = game.getState();
    assert.equal(state.excludedCards.length, 0);
    assert.equal(state.players.length, 4);
    for (const player of state.players) {
      assert.equal(player.hand.length, 13);
    }
  });

  test('5 Players: 52 % 5 = 2, 2 lowest cards excluded, 10 cards each', () => {
    const specs = Deck.calculateDealingSpecs(5);
    assert.equal(specs.remainder, 2);
    assert.equal(specs.playableCount, 50);
    assert.equal(specs.cardsPerPlayer, 10);

    const game = new Game(5);
    game.startRound();
    const state = game.getState();
    assert.equal(state.excludedCards.length, 2);
    // Excluded cards must be lowest power (3s)
    for (const c of state.excludedCards) {
      assert.equal(c.rank, '3');
    }
    for (const player of state.players) {
      assert.equal(player.hand.length, 10);
    }
  });

  test('6 Players: 52 % 6 = 4, all four 3s excluded, 8 cards each', () => {
    const specs = Deck.calculateDealingSpecs(6);
    assert.equal(specs.remainder, 4);
    assert.equal(specs.playableCount, 48);
    assert.equal(specs.cardsPerPlayer, 8);

    const game = new Game(6);
    game.startRound();
    const state = game.getState();
    assert.equal(state.excludedCards.length, 4);
    const excludedCodes = state.excludedCards.map(c => c.code);
    assert.deepEqual(excludedCodes.sort(), ['3♦', '3♣', '3♥', '3♠'].sort());
    for (const player of state.players) {
      assert.equal(player.hand.length, 8);
    }
  });

  test('7 Players: 52 % 7 = 3, 3 lowest cards excluded, 7 cards each', () => {
    const specs = Deck.calculateDealingSpecs(7);
    assert.equal(specs.remainder, 3);
    assert.equal(specs.playableCount, 49);
    assert.equal(specs.cardsPerPlayer, 7);

    const game = new Game(7);
    game.startRound();
    const state = game.getState();
    assert.equal(state.excludedCards.length, 3);
    for (const c of state.excludedCards) {
      assert.equal(c.rank, '3');
    }
    for (const player of state.players) {
      assert.equal(player.hand.length, 7);
    }
  });

  test('9 Players: 52 % 9 = 7, 7 lowest cards excluded (all four 3s and three 4s)', () => {
    const specs = Deck.calculateDealingSpecs(9);
    assert.equal(specs.remainder, 7);
    assert.equal(specs.playableCount, 45);
    assert.equal(specs.cardsPerPlayer, 5);

    const game = new Game(9);
    game.startRound();
    const state = game.getState();
    assert.equal(state.excludedCards.length, 7);
    const ranks = state.excludedCards.map(c => c.rank);
    assert.equal(ranks.filter(r => r === '3').length, 4);
    assert.equal(ranks.filter(r => r === '4').length, 3);
    for (const player of state.players) {
      assert.equal(player.hand.length, 5);
    }
  });

  test('Total cards accounted for: dealt cards + excluded cards === 52', () => {
    for (let n = 4; n <= 10; n++) {
      const game = new Game(n);
      game.startRound();
      const state = game.getState();
      const totalDealt = state.players.reduce((sum, p) => sum + p.hand.length, 0);
      assert.equal(totalDealt + state.excludedCards.length, 52);
    }
  });
});

describe('Player Hands', () => {
  test('Hand sorts cards in descending power sequence by default (2 first, 3 last)', () => {
    const p = new Player(1, 'Alice');
    p.receiveCards([
      new Card('3', '♠'),
      new Card('2', '♥'),
      new Card('10', '♣'),
      new Card('A', '♦'),
      new Card('K', '♠')
    ]);

    const handRanks = p.hand.map(c => c.rank);
    assert.deepEqual(handRanks, ['2', 'A', 'K', '10', '3']);
  });
});
