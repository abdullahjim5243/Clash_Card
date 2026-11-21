let roomCode = '';
let sessionToken = '';
let playerId = null;
let isHost = false;
let roomView = null;
let gameState = null;
let selectedCards = new Set();
let pollTimer = null;
let pollInFlight = false;
let botTimer = null;
let shownLogCount = 0;
let announcedRoundNumber = 0;
let lastObservedRound = 0;
let lastPlaySignature = '';
let hasObservedPlayState = false;
let animatedPlaySignature = '';
let musicEnabled = true;

const $ = id => document.getElementById(id);
const playerCountInput = $('playerCountInput');
const presetButtons = [...document.querySelectorAll('.preset-btn')];
const playerNameInput = $('playerNameInput');
const backgroundMusic = $('backgroundMusic');
const cardPlacedSound = $('cardPlacedSound');
const turnActions = $('turnActions');

function playCardPlacementSound(cardCount = 1) {
  for (let index = 0; index < cardCount; index++) {
    setTimeout(() => {
      const sound = cardPlacedSound.cloneNode();
      sound.volume = 1;
      sound.play().catch(() => {});
    }, index * 220);
  }
}

function startMusic() {
  if (!musicEnabled || !backgroundMusic.paused) return;
  if ('audioSession' in navigator) {
    try { navigator.audioSession.type = 'playback'; } catch { /* Optional browser API. */ }
  }
  backgroundMusic.volume = 0.10;
  backgroundMusic.play().then(() => {
    $('musicToggle').textContent = '♫ Music: On';
    $('musicToggle').title = 'Turn background music off';
  }).catch(() => {
    $('musicToggle').textContent = backgroundMusic.paused ? '♫ Tap to start' : '♫ Music: On';
    $('musicToggle').title = backgroundMusic.paused
      ? 'Music is enabled; click or press a key to start playback'
      : 'Turn background music off';
  });
}

function setMusicEnabled(enabled) {
  musicEnabled = enabled;
  const button = $('musicToggle');
  if (!musicEnabled) {
    backgroundMusic.pause();
    button.textContent = '♫ Music: Off';
    button.setAttribute('aria-pressed', 'false');
    button.title = 'Turn background music on';
  } else {
    button.textContent = '♫ Music: On';
    button.setAttribute('aria-pressed', 'true');
    button.title = 'Turn background music off';
    startMusic();
  }
  if (navigator.mediaSession) navigator.mediaSession.playbackState = musicEnabled ? 'playing' : 'paused';
}

function toggleMusic() {
  if (musicEnabled && backgroundMusic.paused) {
    startMusic();
    return;
  }
  setMusicEnabled(!musicEnabled);
}

function retryMusicFromGesture(event) {
  if (event.target instanceof Element && event.target.closest('#musicToggle')) return;
  startMusic();
}

function configureMediaSession() {
  if (!navigator.mediaSession) return;
  if ('MediaMetadata' in window) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Clash Card',
      artist: 'Game soundtrack',
      album: 'Clash Card'
    });
  }
  try { navigator.mediaSession.setActionHandler('play', () => setMusicEnabled(true)); } catch { /* Not supported by this browser. */ }
  try { navigator.mediaSession.setActionHandler('pause', () => setMusicEnabled(false)); } catch { /* Not supported by this browser. */ }
}

function request(path, { method = 'POST', body = {} } = {}) {
  const options = { method, headers: {} };
  if (method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  return fetch(path, options).then(async response => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'The server could not complete that action.');
    return payload;
  });
}

function credentialsKey(code) { return `card-game-room:${code}`; }

function saveSession() {
  try { localStorage.setItem(credentialsKey(roomCode), sessionToken); } catch { /* Storage may be disabled. */ }
}

function addLog(message) {
  const stream = $('logStream');
  if (!stream) return;
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

function makeCard(card, { selectable = false, selected = false, playable = false, unplayable = false } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `card-item ${card.color}${selected ? ' selected' : ''}${playable ? ' playable-card' : ''}${unplayable ? ' unplayable-card' : ''}`;
  el.setAttribute('aria-label', `${card.rank} of ${card.suitName}`);
  if (unplayable) el.title = 'This card cannot beat the current play';
  else if (playable) el.title = 'Playable card';
  el.innerHTML = `<span class="card-top"><span class="card-rank">${card.rank}</span><span class="card-suit-small">${card.suit}</span></span><span class="card-center-suit">${card.suit}</span>`;
  el.disabled = !selectable;
  if (selectable) el.addEventListener('click', () => toggleCard(card.code));
  return el;
}

function toggleCard(code) {
  const hand = gameState?.players.find(player => player.id === playerId)?.hand || [];
  const chosen = hand.find(card => card.code === code);
  const matchingPair = chosen ? hand.filter(card => card.rank === chosen.rank) : [];
  if (selectedCards.has(code)) {
    if (matchingPair.length === 2 && matchingPair.every(card => selectedCards.has(card.code))) {
      selectedCards = new Set([code]);
    } else {
      selectedCards.delete(code);
    }
  } else {
    selectedCards = new Set(matchingPair.length === 2 ? matchingPair.map(card => card.code) : [code]);
  }
  renderGame();
}

function applyRoomView(view) {
  const priorRound = lastObservedRound;
  roomView = view;
  playerId = view.playerId;
  isHost = view.isHost;
  if (view.phase === 'playing' && view.game) {
    const playSignature = view.game.currentPlay
      ? `${view.game.roundNumber}:${view.game.currentPlay.playedById}:${view.game.currentPlay.cards.map(card => card.code).join(',')}`
      : '';
    if (playSignature && playSignature !== lastPlaySignature) {
      animatedPlaySignature = playSignature;
      if (hasObservedPlayState) playCardPlacementSound(view.game.currentPlay.cards.length);
    }
    lastPlaySignature = playSignature;
    hasObservedPlayState = true;
    gameState = view.game;
    if (gameState.activePlayer?.id !== playerId) selectedCards.clear();
    const round = gameState.roundNumber;
    if (!lastObservedRound) lastObservedRound = round;
    else if (round > priorRound) {
      lastObservedRound = round;
      if (gameState.lastCardExchange) showExchangeAnimation(gameState);
    }
    if (gameState.state === 'ROUND_OVER' && announcedRoundNumber !== round) showRoundResults(gameState);
    renderGame();
    $('lobbyPanel').hidden = true;
    $('tableFelt').hidden = false;
    $('sidePanel').hidden = true;
    $('tableExitBtn').hidden = false;
    $('gameLayout').classList.remove('home-layout');
  } else {
    gameState = null;
    selectedCards.clear();
    $('tableExitBtn').hidden = true;
    renderLobby(view);
    $('roundModal').hidden = true;
  }
}

function renderLobby(view = null) {
  $('lobbyPanel').hidden = false;
  $('tableExitBtn').hidden = true;
  $('tableFelt').hidden = true;
  $('sidePanel').hidden = Boolean(!view);
  $('gameLayout').classList.toggle('home-layout', !view);
  $('homeScreen').hidden = Boolean(view);
  $('roomLobby').hidden = !view;
  if (view) $('gameLogPanel').hidden = false;
  $('roomCodeRow').hidden = !view;
  $('lobbyPlayerList').replaceChildren();
  $('fillBotsBtn').hidden = !view?.isHost || view.phase !== 'lobby' || view.players.length >= view.playerCount;
  $('startWithBotsBtn').hidden = !view?.isHost || view.phase !== 'lobby' || view.players.length >= view.playerCount;
  $('startGameBtn').hidden = !view?.isHost || view.phase !== 'lobby';
  $('startGameBtn').disabled = !view || view.players.length !== view.playerCount;

  if (!view) return;

  $('roomCodeDisplay').textContent = view.roomCode;
  if (view.phase === 'lobby') {
    $('lobbyTitle').textContent = `Room ${view.roomCode}`;
    $('lobbyStatus').textContent = view.notice || (view.players.length === view.playerCount
      ? 'All seats are filled. The host can start the game.'
      : `Waiting for players: ${view.players.length} of ${view.playerCount} seats filled.`);
    $('startGameBtn').textContent = view.notice ? 'Start a fresh game' : 'Start game';
    for (let seat = 1; seat <= view.playerCount; seat++) {
      const player = view.players.find(item => item.id === seat);
      const row = document.createElement('div');
      row.className = `lobby-seat${player ? ' seat-filled' : ''}`;
      row.textContent = player
        ? `Seat ${seat} · ${player.name}${player.id === view.playerId ? ' (you)' : ''}${player.isBot ? ' · Bot' : ''}${player.isHost ? ' · Host' : ''}`
        : `Seat ${seat} · Waiting for a player`;
      $('lobbyPlayerList').append(row);
    }
    return;
  }

  $('lobbyTitle').textContent = 'Game in progress';
  $('lobbyStatus').textContent = 'This room has already started. Return to your game.';
}

function renderGame() {
  if (!gameState || !roomView) return;
  const state = gameState;
  const table = $('tableCenterCards');
  table.replaceChildren();
  if (!state.currentPlay) table.innerHTML = '<span class="center-placeholder">No cards on the table. The lead can play any single card or pair.</span>';
  else {
    const played = document.createElement('div');
    const signature = `${state.roundNumber}:${state.currentPlay.playedById}:${state.currentPlay.cards.map(card => card.code).join(',')}`;
    played.className = `played-summary${signature === animatedPlaySignature ? ' play-enter' : ''}`;
    played.dataset.direction = String((state.currentPlay.playedById - 1) % 4);
    const who = document.createElement('strong');
    who.textContent = `${state.currentPlay.playedByName} played ${state.currentPlay.type === 'PAIR' ? 'a pair' : 'a single'}`;
    played.append(who);
    const cards = document.createElement('div');
    cards.className = 'played-cards';
    state.currentPlay.cards.forEach(card => cards.append(makeCard(card)));
    played.append(cards);
    table.append(played);
    if (signature === animatedPlaySignature) animatedPlaySignature = '';
  }

  const ownPlayer = state.players.find(player => player.id === playerId);
  const active = state.activePlayer;
  $('tableHeading').textContent = state.state === 'ROUND_OVER' ? 'Round complete' : `Round ${state.roundNumber}`;
  $('tableStatus').textContent = state.state === 'ROUND_OVER'
    ? `${state.lastWinner?.name || 'No winner'} finished first · ${state.lastLoser?.name || 'No loser'} finished last`
    : active?.id === playerId
      ? (state.currentPlay ? `${active.name}, beat the ${state.currentPlay.type.toLowerCase()} or pass.` : `${active.name} has the lead. Play a single or pair.`)
      : active?.isAI ? `${active.name} is thinking…` : `Waiting for ${active?.name} to play…`;

  const players = $('playersContainer');
  players.replaceChildren();
  $('tableFelt').classList.toggle('large-table', state.players.length > 8);
  const opponents = state.players.filter(player => player.id !== playerId);
  const perimeterSeats = {
    3: [{ x: 15, y: 17 }, { x: 85, y: 17 }, { x: 8, y: 49 }],
    4: [{ x: 15, y: 17 }, { x: 50, y: 10 }, { x: 85, y: 17 }, { x: 8, y: 49 }],
    5: [{ x: 15, y: 17 }, { x: 50, y: 10 }, { x: 85, y: 17 }, { x: 8, y: 49 }, { x: 92, y: 49 }],
    6: [{ x: 15, y: 17 }, { x: 50, y: 10 }, { x: 85, y: 17 }, { x: 8, y: 49 }, { x: 92, y: 49 }, { x: 15, y: 64 }],
    7: [{ x: 15, y: 17 }, { x: 50, y: 10 }, { x: 85, y: 17 }, { x: 8, y: 49 }, { x: 92, y: 49 }, { x: 15, y: 64 }, { x: 85, y: 64 }]
  }[opponents.length] || [];
  const seats = [
    ...opponents.map((player, index) => ({ player, seat: ['north', 'west', 'east'][index] || 'extra', position: perimeterSeats[index] })),
    { player: ownPlayer, seat: 'own' }
  ];
  seats.forEach(({ player, seat, position }, seatIndex) => {
    if (!player) return;
    const board = document.createElement('section');
    board.className = `player-board seat-${seat}${seat !== 'own' && perimeterSeats.length ? ' opponent-seat' : ''}${player.id === active?.id && state.state === 'PLAYING' ? ' player-active' : ''}${player.isFinished ? ' player-finished' : ''}`;
    if (position) {
      board.style.setProperty('--seat-x', `${position.x}%`);
      board.style.setProperty('--seat-y', `${position.y}%`);
      board.dataset.seatIndex = String(seatIndex);
    }
    const header = document.createElement('div');
    header.className = 'player-board-header';
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = `${player.name}${player.id === state.leadPlayerId ? ' · LEAD' : ''}${player.isAI ? ` · ${player.aiDifficulty || 'normal'} bot` : ''}${player.id === playerId ? ' · YOU' : ''}${player.isFinished ? ` · #${player.finishRank}` : ''}`;
    const count = document.createElement('span');
    count.className = 'card-count-badge';
    count.textContent = `${player.handCount} card${player.handCount === 1 ? '' : 's'}`;
    header.append(name, count);
    board.append(header);
    if (player.id === playerId) {
      const hand = document.createElement('div');
      hand.className = 'player-hand human-hand';
      const humanTurn = state.state === 'PLAYING' && active?.id === playerId;
      const playableCodes = new Set(state.playableCardCodes || []);
      (player.hand || []).forEach(card => {
        const playable = humanTurn && playableCodes.has(card.code);
        const cardEl = makeCard(card, { selectable: playable, selected: selectedCards.has(card.code), playable, unplayable: humanTurn && !playable });
        const middle = ((player.hand || []).length - 1) / 2;
        cardEl.style.setProperty('--fan-angle', `${(hand.children.length - middle) * 2.2}deg`);
        cardEl.style.setProperty('--fan-lift', `${Math.abs(hand.children.length - middle) * 1.5}px`);
        if (humanTurn && (player.hand || []).filter(item => item.rank === card.rank).length === 2) {
          cardEl.title = 'Click once to select both matching cards';
        }
        hand.append(cardEl);
      });
      board.append(hand);
      turnActions.classList.add('hand-actions');
      board.append(turnActions);
    } else {
      const back = document.createElement('div');
      back.className = 'opponent-hand';
      back.setAttribute('aria-hidden', 'true');
      if (!player.isFinished) {
        for (let index = 0; index < Math.min(player.handCount, 7); index++) {
          const cardBack = document.createElement('span');
          cardBack.className = 'card-back';
          cardBack.style.setProperty('--back-offset', `${(index - 3) * 10}px`);
          cardBack.style.setProperty('--back-rotation', `${(index - 3) * 5}deg`);
          back.append(cardBack);
        }
      } else {
        back.textContent = 'Finished';
      }
      board.append(back);
    }
    players.append(board);
  });

  const isMyTurn = state.state === 'PLAYING' && active?.id === playerId;
  $('playBtn').disabled = !isMyTurn || selectedCards.size === 0;
  $('passBtn').disabled = !isMyTurn || !state.currentPlay;
  $('nextRoundBtn').hidden = true;
  const playableCount = (state.playableCardCodes || []).length;
  $('selectionHint').textContent = selectedCards.size === 2
    ? 'Pair selected · click one card again to play it alone'
    : selectedCards.size === 1
      ? '1 selected'
      : isMyTurn && state.currentPlay && playableCount === 0
        ? 'No playable cards. Pass your turn.'
        : isMyTurn && state.currentPlay
          ? 'Highlighted cards can beat the play. You may also pass.'
          : isMyTurn
            ? 'Highlighted cards are playable. Select one or a same-rank pair.'
            : active?.isAI ? 'Bot turn in progress.' : 'Wait for your turn. Green cards are playable.';
  syncLogs();
  if (active?.isAI && state.state === 'PLAYING') scheduleBotTurn(active.id);
}

function showRoundResults(state) {
  announcedRoundNumber = state.roundNumber;
  $('roundModalKicker').textContent = `ROUND ${state.roundNumber} RESULTS`;
  $('roundModalTitle').textContent = 'The round is over';
  $('roundModalMessage').textContent = `${state.lastWinner?.name || 'No winner'} finished first and wins! ${state.lastLoser?.name || 'No loser'} finished last.`;
  $('exchangeStage').hidden = true;
  $('roundModalAction').textContent = isHost ? 'Exchange cards & start next round' : 'Waiting for the host to start the next round';
  $('roundModalAction').disabled = !isHost;
  $('roundModalAction').dataset.phase = 'next-round';
  $('skipNextBtn').hidden = false;
  $('freshGameBtn').hidden = false;
  $('skipNextBtn').disabled = !isHost;
  $('freshGameBtn').disabled = !isHost;
  $('exitGameBtn').hidden = false;
  $('roundModal').hidden = false;
}

function showExchangeAnimation(state) {
  announcedRoundNumber = state.roundNumber;
  const exchange = state.lastCardExchange;
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
  winnerSide.append(winnerName);
  const winnerCaption = document.createElement('span');
  winnerCaption.textContent = 'Lowest card →';
  winnerSide.append(winnerCaption);
  if (exchange?.winnerGave) winnerSide.append(makeCard(exchange.winnerGave));

  const arrow = document.createElement('span');
  arrow.className = 'exchange-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '⇄';

  const loserSide = document.createElement('div');
  loserSide.className = 'exchange-player loser-side';
  const loserName = document.createElement('strong');
  loserName.textContent = exchange?.loserName || 'Loser';
  loserSide.append(loserName);
  const loserCaption = document.createElement('span');
  loserCaption.textContent = '← Highest card';
  loserSide.append(loserCaption);
  if (exchange?.loserGave) loserSide.append(makeCard(exchange.loserGave));
  stage.append(winnerSide, arrow, loserSide);
  stage.classList.remove('exchange-animate');
  void stage.offsetWidth;
  stage.classList.add('exchange-animate');

  $('roundModalAction').dataset.phase = 'exchange';
  $('roundModalAction').textContent = 'Card exchange complete';
  $('roundModalAction').disabled = true;
  $('skipNextBtn').hidden = true;
  $('freshGameBtn').hidden = true;
  $('exitGameBtn').hidden = false;
  $('roundModal').hidden = false;
  setTimeout(() => {
    $('roundModalTitle').textContent = 'Card exchange complete';
    $('roundModalMessage').textContent = 'The next round is ready. The previous winner has the lead.';
    $('roundModalAction').textContent = 'Continue';
    $('roundModalAction').disabled = false;
    $('roundModalAction').dataset.phase = 'continue';
    $('exitGameBtn').hidden = false;
  }, 1700);
}

async function mutateAndApply(path, extra = {}) {
  const payload = await request(path, { body: { roomCode, token: sessionToken, ...extra } });
  if (payload.view) applyRoomView(payload.view);
  return payload;
}

function scheduleBotTurn(expectedPlayerId) {
  if (botTimer) return;
  botTimer = setTimeout(() => {
    botTimer = null;
    mutateAndApply('/api/ai-step', { expectedPlayerId }).catch(error => {
      addLog(error.message);
      $('tableStatus').textContent = `Bot turn failed: ${error.message}. Retrying…`;
      if (gameState?.activePlayer?.isAI && gameState.activePlayer.id === expectedPlayerId) {
        botTimer = setTimeout(() => {
          botTimer = null;
          scheduleBotTurn(expectedPlayerId);
        }, 1400);
      }
    });
  }, 600);
}

async function pollRoom() {
  if (!roomCode || !sessionToken || pollInFlight) return;
  pollInFlight = true;
  try {
    const payload = await request('/api/room', { body: { roomCode, token: sessionToken } });
    applyRoomView(payload.view);
  } catch (error) {
    $('lobbyStatus').textContent = error.message;
  } finally {
    pollInFlight = false;
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(pollRoom, 1200);
  pollRoom();
}

function setSession(payload) {
  roomCode = payload.roomCode;
  sessionToken = payload.token;
  playerId = payload.playerId;
  isHost = payload.isHost;
  saveSession();
  shownLogCount = 0;
  announcedRoundNumber = 0;
  lastObservedRound = 0;
  lastPlaySignature = '';
  hasObservedPlayState = false;
  animatedPlaySignature = '';
  selectedCards.clear();
  applyRoomView(payload.view);
  startPolling();
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomCode);
  history.replaceState(null, '', url);
}

async function createRoom(withBots = false) {
  const playerCount = Number.parseInt(playerCountInput.value, 10) || 4;
  try {
    const payload = await request('/api/create-room', { body: { playerName: playerNameInput.value, playerCount } });
    setSession(payload);
    if (withBots) {
      const difficulty = document.querySelector('input[name="botDifficulty"]:checked')?.value || 'normal';
      const result = await request('/api/fill-bots', { body: { roomCode, token: sessionToken, difficulty } });
      applyRoomView(result.view);
      await startGame();
    }
  } catch (error) {
    if (roomView) $('lobbyStatus').textContent = error.message;
    else $('homeError').textContent = error.message;
  }
}

async function joinRoom() {
  try {
    const payload = await request('/api/join-room', { body: { roomCode: $('roomCodeInput').value, playerName: playerNameInput.value } });
    setSession(payload);
  } catch (error) {
    $('homeError').textContent = error.message;
  }
}

async function startGame() {
  const fresh = Boolean(roomView?.notice);
  try {
    await mutateAndApply(fresh ? '/api/fresh-game' : '/api/start-game');
    if (fresh && gameState) {
      lastObservedRound = gameState.roundNumber;
      announcedRoundNumber = gameState.roundNumber;
    }
  } catch (error) {
    $('lobbyStatus').textContent = error.message;
  }
}

async function playCards(pass = false) {
  try {
    $('playBtn').disabled = true;
    $('passBtn').disabled = true;
    await mutateAndApply('/api/play', { pass, cards: [...selectedCards] });
    selectedCards.clear();
    renderGame();
  } catch (error) {
    addLog(error.message);
    renderGame();
  }
}

async function advanceRound() {
  $('roundModalAction').disabled = true;
  try { await mutateAndApply('/api/next-round'); }
  catch (error) {
    addLog(error.message);
    $('roundModalAction').disabled = false;
  }
}

async function skipNextGame() {
  $('roundModalAction').disabled = true;
  try { await mutateAndApply('/api/skip-next'); }
  catch (error) {
    addLog(error.message);
    $('roundModalAction').disabled = false;
  }
}

async function startFreshGame() {
  $('roundModalAction').disabled = true;
  try {
    await mutateAndApply('/api/fresh-game');
    if (gameState && !gameState.lastCardExchange) {
      lastObservedRound = gameState.roundNumber;
      announcedRoundNumber = gameState.roundNumber;
      $('roundModal').hidden = true;
    }
  }
  catch (error) {
    addLog(error.message);
    $('roundModalAction').disabled = false;
  }
}

async function exitGame() {
  try { await request('/api/exit-room', { body: { roomCode, token: sessionToken } }); }
  catch { /* Close locally even if the connection is gone. */ }
  try { localStorage.removeItem(credentialsKey(roomCode)); } catch { /* Storage may be disabled. */ }
  clearInterval(pollTimer);
  clearTimeout(botTimer);
  pollTimer = null;
  botTimer = null;
  roomCode = '';
  sessionToken = '';
  playerId = null;
  isHost = false;
  roomView = null;
  gameState = null;
  selectedCards.clear();
  $('roundModal').hidden = true;
  $('lobbyTitle').textContent = 'Game closed';
  $('lobbyPlayerList').replaceChildren();
  $('roomCodeRow').hidden = true;
  renderLobby();
  showMode('home');
  $('lobbyTitle').textContent = 'Game closed';
  $('lobbyStatus').textContent = 'You exited the room. Create a new room or join another one.';
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

function goHome() {
  if (roomCode && sessionToken) {
    exitGame();
    return;
  }
  $('roundModal').hidden = true;
  renderLobby();
  showMode('home');
}

async function fillBots() {
  try {
    const difficulty = document.querySelector('input[name="botDifficulty"]:checked')?.value || 'normal';
    const payload = await request('/api/fill-bots', { body: { roomCode, token: sessionToken, difficulty } });
    applyRoomView(payload.view);
  } catch (error) { $('lobbyStatus').textContent = error.message; }
}

async function startWithBots() {
  const button = $('startWithBotsBtn');
  button.disabled = true;
  try {
    const difficulty = document.querySelector('input[name="botDifficulty"]:checked')?.value || 'normal';
    const payload = await request('/api/fill-bots', { body: { roomCode, token: sessionToken, difficulty } });
    applyRoomView(payload.view);
    await startGame();
  } catch (error) {
    $('lobbyStatus').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function showMode(mode = 'home') {
  const home = mode === 'home';
  $('homeError').textContent = '';
  $('modeChoices').hidden = !home;
  $('playerOptions').hidden = home;
  $('botSettings').hidden = mode !== 'bots';
  $('multiplayerSettings').hidden = mode !== 'multiplayer';
  $('joinSettings').hidden = mode !== 'join';
  $('seatOptions').hidden = mode === 'join';
  $('seatPresets').hidden = mode === 'join';
}

function updatePlayerPresets(count = Number.parseInt(playerCountInput.value, 10)) {
  presetButtons.forEach(button => {
    button.classList.toggle('active', Number(button.dataset.players) === count);
  });
}

$('createRoomBtn').addEventListener('click', () => createRoom(false));
$('playBotsBtn').addEventListener('click', () => createRoom(true));
$('joinRoomBtn').addEventListener('click', joinRoom);
$('botModeBtn').addEventListener('click', () => showMode('bots'));
$('multiplayerModeBtn').addEventListener('click', () => showMode('multiplayer'));
$('joinModeBtn').addEventListener('click', () => showMode('join'));
$('multiplayerJoinBtn').addEventListener('click', () => showMode('join'));
document.querySelectorAll('.back-mode-btn').forEach(button => button.addEventListener('click', () => showMode('home')));
$('startGameBtn').addEventListener('click', startGame);
$('fillBotsBtn').addEventListener('click', fillBots);
$('startWithBotsBtn').addEventListener('click', startWithBots);
$('copyInviteBtn').addEventListener('click', async () => {
  const invite = new URL(window.location.href);
  invite.searchParams.set('room', roomCode);
  try {
    await navigator.clipboard.writeText(invite.toString());
    $('copyInviteBtn').textContent = 'Copied!';
    setTimeout(() => { $('copyInviteBtn').textContent = 'Copy invite'; }, 1300);
  } catch { $('lobbyStatus').textContent = `Share this room code: ${roomCode}`; }
});
$('playBtn').addEventListener('click', () => playCards(false));
$('passBtn').addEventListener('click', () => playCards(true));
$('roundModalAction').addEventListener('click', () => {
  if ($('roundModalAction').dataset.phase === 'continue') {
    $('roundModal').hidden = true;
    return;
  }
  if ($('roundModalAction').dataset.phase === 'next-round' && isHost) advanceRound();
});
$('skipNextBtn').addEventListener('click', skipNextGame);
$('freshGameBtn').addEventListener('click', startFreshGame);
$('exitGameBtn').addEventListener('click', exitGame);
$('exitLobbyBtn').addEventListener('click', exitGame);
$('tableExitBtn').addEventListener('click', exitGame);
$('brandHomeBtn').addEventListener('click', goHome);
$('musicToggle').addEventListener('click', toggleMusic);
document.addEventListener('pointerdown', retryMusicFromGesture, { capture: true });
document.addEventListener('keydown', retryMusicFromGesture, { capture: true });
backgroundMusic.addEventListener('play', () => {
  $('musicToggle').textContent = '♫ Music: On';
  $('musicToggle').setAttribute('aria-pressed', 'true');
  if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing';
});
backgroundMusic.addEventListener('pause', () => {
  if (navigator.mediaSession) navigator.mediaSession.playbackState = 'paused';
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && musicEnabled && backgroundMusic.paused) startMusic();
});
window.addEventListener('pageshow', () => {
  if (musicEnabled && backgroundMusic.paused) startMusic();
});
$('incrementPlayersBtn').addEventListener('click', () => {
  playerCountInput.value = Math.min(52, Number(playerCountInput.value || 4) + 1);
  updatePlayerPresets();
});
$('decrementPlayersBtn').addEventListener('click', () => {
  playerCountInput.value = Math.max(4, Number(playerCountInput.value || 4) - 1);
  updatePlayerPresets();
});
presetButtons.forEach(button => button.addEventListener('click', () => {
  playerCountInput.value = button.dataset.players;
  updatePlayerPresets();
}));
playerCountInput.addEventListener('input', () => updatePlayerPresets());

renderLobby();
showMode('home');
configureMediaSession();
startMusic();
const inviteCode = new URLSearchParams(window.location.search).get('room');
if (inviteCode) {
  $('roomCodeInput').value = inviteCode.toUpperCase();
  showMode('join');
}
try { playerNameInput.value = localStorage.getItem('card-game-player-name') || playerNameInput.value; } catch { /* Storage may be disabled. */ }
playerNameInput.addEventListener('change', () => {
  try { localStorage.setItem('card-game-player-name', playerNameInput.value.trim()); } catch { /* Storage may be disabled. */ }
});
if (inviteCode) {
  try {
    const savedToken = localStorage.getItem(credentialsKey(inviteCode.toUpperCase()));
    if (savedToken) {
      roomCode = inviteCode.toUpperCase();
      sessionToken = savedToken;
      pollRoom().then(() => startPolling());
    }
  } catch { /* Joining by room code still works if storage is disabled. */ }
}
