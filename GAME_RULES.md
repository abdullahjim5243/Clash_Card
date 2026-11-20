# Simple Game Rules

## Goal

Be the first player to play all your cards. The last player still holding cards loses.

## Card power

From strongest to weakest:

**2 → A → K → Q → J → 10 → 9 → 8 → 7 → 6 → 5 → 4 → 3**

The server deals the cards and handles the deck rules automatically.

## Taking turns

- A player with the lead may play one card or two cards of the same rank.
- The next player must play the same kind of play: one card on a single, or a pair on a pair.
- The new card or pair must be the same rank or stronger than the cards on the table.
- You may pass instead of playing, even when you have a playable card.
- Green highlighted cards are playable. Dim cards cannot beat the current play.
- When everyone else passes, the last player to play gets the lead and can start with any single card or pair.
- When a player finishes their hand and the round continues, the next player clockwise gets a fresh lead automatically.

## End of the round and exchange

- The first player to finish is the winner. The last player with cards is the loser.
- A popup announces both players.
- Before the next round, the winner gives their lowest power card to the loser. The loser gives their highest power card to the winner. The popup shows the exchange animation.
- The previous winner starts the next round.
- The winner popup lets the host exchange cards and continue, skip the next game, or start a fresh deal. Any player can exit; their seat switches to a bot so the room can continue.

## Starting a game

Choose at least four seats and create a room. Share its code with friends. The host starts when all seats are filled, or fills the open seats with bots.

Choose a bot level when filling seats:

- **Easy** sometimes passes even when it could play and makes random choices.
- **Normal** plays low cards that beat the current play and uses low pairs when it has the lead.
- **Hard** prioritizes finishing its hand and clearing pairs.
