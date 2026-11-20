export { POWER_SEQUENCE, RANK_POWER, SUITS, SUIT_SYMBOLS, MIN_PLAYERS, STANDARD_DECK_SIZE } from './constants.js';
export { Card } from './card.js';
export { Deck } from './deck.js';
export { Player } from './player.js';
export { Game } from './game.js';

// If executed directly, run an interactive CLI demonstration
import { Game } from './game.js';
import { POWER_SEQUENCE } from './constants.js';

const isDirectRun = process.argv[1] && process.argv[1].endsWith('index.js');

if (isDirectRun) {
  console.log('========================================================');
  console.log('           CUSTOM CARD GAME CORE INITIALIZED            ');
  console.log('========================================================');
  console.log('Power Sequence: ' + POWER_SEQUENCE.join(' > '));
  console.log('Player Rule: Minimum 4 players.');
  console.log('Deck Trimming Rule: If 52 mod n > 0, lowest cards are removed.');
  console.log('--------------------------------------------------------\n');

  // Demonstrate dealing for 4, 5, 6, 7, and 8 players
  const playerCountsToTest = [4, 5, 6, 7, 8];

  for (const n of playerCountsToTest) {
    console.log(`>>> Simulating Game with ${n} Players:`);
    const game = new Game(n);
    game.startRound();
    const state = game.getState();
    const specs = state.dealingSpecs;

    console.log(`    Total Cards: ${specs.totalCards}`);
    console.log(`    52 mod ${n} = ${specs.remainder}`);
    if (specs.remainder > 0) {
      console.log(`    Excluded Lowest Card(s): ${state.excludedCards.map(c => c.code).join(' ')}`);
    } else {
      console.log(`    Excluded Lowest Card(s): None`);
    }
    console.log(`    Cards per player: ${specs.cardsPerPlayer} (${n} x ${specs.cardsPerPlayer} = ${specs.playableCount})`);
    console.log(`    Sample Player 1 Hand: ${state.players[0].hand.map(c => c.code).join(' ')}\n`);
  }
}
