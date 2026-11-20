let gameId = null;
let gameState = null;
let selectedCards = new Set();
let aiTimer = null;
let shownLogCount = 0;
let announcedRoundNumber = 0;

const $ = id => document.getElementById(id);
const playerCountInput = $('playerCountInput');
const presetButtons = [...document.querySelectorAll('.preset-btn')];

async function apiRequest(path, body = {}) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'The game server could not complete that action.');
  if (payload.gameId) gameId = payload.gameId;
  if (payload.state) gameState = payload.state;
  return payload;
}

function makeCard(card, { selectable = false, selected = false, playable = false, unplayable = false } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `card-item ${card.color}${selected ? ' selected' : ''}${playable ? ' playable-card' : ''}${unplayable ? ' unplayable-card' : ''}`;
  el.setAttribute('aria-label', `${card.rank} of ${card.suitName}`);
  if (unplayable) el.title = 'This card cannot beat the current play';
  else if (playable) el.title = 'Playable card';
  el.innerHTML = `<span class="card-top"><span class="card-rank">${card.rank}</span><span class="card-suit-small">${card.suit}</span></span><span class="card-center-suit">${card.suit}</span>`;
  if (!selectable) el.disabled = true;
  else el.addEventListener('click', () => toggleCard(card.code));
  return el;
}

function toggleCard(code) {
  if (selectedCards.has(code)) selectedCards.delete(code);
  else if (selectedCards.size < 2) selectedCards.add(code);
  else selectedCards = new Set([code]);
  render();
}

function addLog(message) {
  const stream = $('logStream');
  const entry = document.createElement('div');
  entry.className = 'log-item';
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  stream.append(entry);
  stream.scrollTop = stream.scrollHeight;
}

function syncLogs() {
  const logs = gameState?.gameLog || [];
  for (; shownLogCount < logs.length;) {
    const message = logs[shownLogCount++].message;
    if (!message.includes('52 mod') && !message.includes('Excluded lowest cards')) addLog(message);
  }
}

function render() {
  if (!gameState) return;
  const state = gameState;
  const table = $('tableCenterCards');
  table.replaceChildren();
  if (!state.currentPlay) table.innerHTML = '<span class="center-placeholder">No cards on the table. The lead can play any single card or pair.</span>';
  else {
    const played = document.createElement('div');
    played.className = 'played-summary';
    const who = document.createElement('strong');
    who.textContent = `${state.currentPlay.playedByName} played ${state.currentPlay.type === 'PAIR' ? 'a pair' : 'a single'}`;
    played.append(who);
    const cards = document.createElement('div');
    cards.className = 'played-cards';
    state.currentPlay.cards.forEach(card => cards.append(makeCard(card)));
    played.append(cards);
    table.append(played);
  }

  const human = state.players[0];
  const active = state.activePlayer;
  $('tableHeading').textContent = state.state === 'ROUND_OVER' ? 'Round complete' : `Round ${state.roundNumber}`;
  $('tableStatus').textContent = state.state === 'ROUND_OVER'
    ? `${state.lastWinner?.name || 'No winner'} finished first · ${state.lastLoser?.name || 'No loser'} finished last`
    : active?.id === human.id
      ? (state.currentPlay ? `${active.name}, beat the ${state.currentPlay.type.toLowerCase()} or pass.` : `${active.name} has the lead. Play a single or pair.`)
      : `${active?.name} is thinking…`;

  const players = $('playersContainer');
  players.replaceChildren();
  state.players.forEach((player, index) => {
    const board = document.createElement('section');
    board.className = `player-board${player.id === active?.id && state.state === 'PLAYING' ? ' player-active' : ''}${player.isFinished ? ' player-finished' : ''}`;
    const header = document.createElement('div');
    header.className = 'player-board-header';
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = `${player.name}${player.id === state.leadPlayerId ? ' · LEAD' : ''}${player.isFinished ? ` · #${player.finishRank}` : ''}`;
    const count = document.createElement('span');
    count.className = 'card-count-badge';
    count.textContent = `${player.handCount} card${player.handCount === 1 ? '' : 's'}`;
    header.append(name, count);
    board.append(header);
    if (index === 0) {
      const hand = document.createElement('div');
      hand.className = 'player-hand human-hand';
      const humanTurn = state.state === 'PLAYING' && active?.id === human.id;
      const playableCodes = new Set(state.playableCardCodes || []);
      player.hand.forEach(card => {
        const playable = humanTurn && playableCodes.has(card.code);
        hand.append(makeCard(card, {
          selectable: playable,
          selected: selectedCards.has(card.code),
          playable,
          unplayable: humanTurn && !playable
        }));
      });
      board.append(hand);
    } else {
      const back = document.createElement('div');
      back.className = 'opponent-hand';
      back.textContent = player.isFinished ? 'Finished' : '🂠 '.repeat(Math.min(player.handCount, 12));
      board.append(back);
    }
    players.append(board);
  });

  const isHumanTurn = state.state === 'PLAYING' && active?.id === human.id;
  $('playBtn').disabled = !isHumanTurn || selectedCards.size === 0;
  $('passBtn').disabled = !isHumanTurn || !state.currentPlay;
  $('nextRoundBtn').hidden = state.state !== 'ROUND_OVER';
  const playableCount = (state.playableCardCodes || []).length;
  $('selectionHint').textContent = selectedCards.size > 0
    ? `${selectedCards.size} selected`
    : isHumanTurn && state.currentPlay && playableCount === 0
      ? 'No playable cards. Pass your turn.'
      : isHumanTurn && state.currentPlay
        ? 'Highlighted cards can beat the play. You may also pass.'
        : isHumanTurn
          ? 'Highlighted cards are playable. Select one or a same-rank pair.'
          : 'Green cards show which plays are available on your turn.';
  syncLogs();
  if (state.state === 'ROUND_OVER' && announcedRoundNumber !== state.roundNumber) showRoundResults(state);
  if (state.state === 'PLAYING' && active?.isAI) scheduleAI();
}

function showRoundResults(state) {
  announcedRoundNumber = state.roundNumber;
  $('roundModalKicker').textContent = `ROUND ${state.roundNumber} RESULTS`;
  $('roundModalTitle').textContent = 'The round is over';
  $('roundModalMessage').textContent = `${state.lastWinner?.name || 'No winner'} finished first and wins! ${state.lastLoser?.name || 'No loser'} finished last.`;
  $('exchangeStage').hidden = true;
  $('roundModalAction').textContent = 'Exchange cards & start next round';
  $('roundModal').hidden = false;
}

function beginNextRoundExchange() {
  advanceRound();
}

async function advanceRound() {
  $('roundModalAction').disabled = true;
  try {
    await apiRequest('/api/next-round', { gameId });
  } catch (error) {
    addLog(error.message);
    $('roundModalAction').disabled = false;
    return;
  }
  const exchange = gameState.lastCardExchange;
  const stage = $('exchangeStage');
  stage.replaceChildren();
  stage.hidden = false;
  $('roundModalKicker').textContent = 'CARD EXCHANGE';
  $('roundModalTitle').textContent = 'Pass one card each way';
  $('roundModalMessage').textContent = 'The winner gives their lowest power card. The loser gives their highest power card.';

  const winnerSide = document.createElement('div');
  winnerSide.className = 'exchange-player winner-side';
  const winnerName = document.createElement('strong');
  winnerName.textContent = exchange?.winnerName || 'Winner';
  const winnerCard = exchange?.winnerGave;
  const winnerCaption = document.createElement('span');
  winnerCaption.textContent = 'Lowest card →';
  winnerSide.append(winnerName, winnerCaption);
  if (winnerCard) winnerSide.append(makeCard(winnerCard));

  const exchangeArrow = document.createElement('span');
  exchangeArrow.className = 'exchange-arrow';
  exchangeArrow.setAttribute('aria-hidden', 'true');
  exchangeArrow.textContent = '⇄';

  const loserSide = document.createElement('div');
  loserSide.className = 'exchange-player loser-side';
  const loserName = document.createElement('strong');
  loserName.textContent = exchange?.loserName || 'Loser';
  const loserCard = exchange?.loserGave;
  const loserCaption = document.createElement('span');
  loserCaption.textContent = '← Highest card';
  loserSide.append(loserName, loserCaption);
  if (loserCard) loserSide.append(makeCard(loserCard));
  stage.append(winnerSide, exchangeArrow, loserSide);
  stage.classList.remove('exchange-animate');
  void stage.offsetWidth;
  stage.classList.add('exchange-animate');
  render();
  setTimeout(() => {
    $('roundModalTitle').textContent = 'Card exchange complete';
    $('roundModalMessage').textContent = 'The winner gave their lowest card and received the loser’s highest. The next round is ready.';
    $('roundModalAction').textContent = 'Continue';
    $('roundModalAction').disabled = false;
    $('roundModalAction').dataset.phase = 'complete';
  }, 1900);
}

function scheduleAI() {
  if (aiTimer || !$('roundModal').hidden) return;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    apiRequest('/api/ai-step', { gameId })
      .then(() => { selectedCards.clear(); render(); })
      .catch(error => addLog(error.message));
  }, 650);
}

async function submitHumanMove(pass = false) {
  try {
    await apiRequest('/api/action', { gameId, pass, cards: [...selectedCards] });
    selectedCards.clear();
    render();
  } catch (error) {
    addLog(error.message);
  }
}

async function dealNewGame() {
  clearTimeout(aiTimer);
  aiTimer = null;
  const count = Number.parseInt(playerCountInput.value, 10) || 4;
  presetButtons.forEach(button => button.classList.toggle('active', Number(button.dataset.players) === count));
  selectedCards.clear();
  shownLogCount = 0;
  $('logStream').replaceChildren();
  try {
    await apiRequest('/api/new', { playerCount: count });
    announcedRoundNumber = 0;
    $('roundModal').hidden = true;
    render();
  } catch (error) {
    addLog(error.message);
  }
}

$('dealBtn').addEventListener('click', dealNewGame);
$('playBtn').addEventListener('click', () => submitHumanMove());
$('passBtn').addEventListener('click', () => submitHumanMove(true));
$('nextRoundBtn').addEventListener('click', () => {
  $('roundModal').hidden = false;
});
$('roundModalAction').addEventListener('click', () => {
  const action = $('roundModalAction');
  if (action.dataset.phase === 'complete') {
    action.dataset.phase = '';
    $('roundModal').hidden = true;
    selectedCards.clear();
    render();
    return;
  }
  beginNextRoundExchange();
});
$('incrementPlayersBtn').addEventListener('click', () => { playerCountInput.value = Math.min(52, Number(playerCountInput.value || 4) + 1); dealNewGame(); });
$('decrementPlayersBtn').addEventListener('click', () => { playerCountInput.value = Math.max(4, Number(playerCountInput.value || 4) - 1); dealNewGame(); });
playerCountInput.addEventListener('change', dealNewGame);
presetButtons.forEach(button => button.addEventListener('click', () => { playerCountInput.value = button.dataset.players; dealNewGame(); }));
dealNewGame();
