/**
 * Core Game Constants
 * 
 * Power Sequence: 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3
 * 2 is the highest power card, 3 is the lowest power card.
 */

export const POWER_SEQUENCE = [
  '2',
  'A',
  'K',
  'Q',
  'J',
  '10',
  '9',
  '8',
  '7',
  '6',
  '5',
  '4',
  '3'
];

// Numeric rank power mapping (higher number = higher power)
export const RANK_POWER = {
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

export const SUITS = [
  { symbol: '♦', name: 'Diamonds', color: 'red', power: 1 },
  { symbol: '♣', name: 'Clubs', color: 'black', power: 2 },
  { symbol: '♥', name: 'Hearts', color: 'red', power: 3 },
  { symbol: '♠', name: 'Spades', color: 'black', power: 4 }
];

export const SUIT_SYMBOLS = ['♦', '♣', '♥', '♠'];

export const MIN_PLAYERS = 4;
export const STANDARD_DECK_SIZE = 52;
