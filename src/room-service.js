import { randomBytes, randomUUID } from 'node:crypto';
import { Card } from './card.js';
import { Game } from './game.js';

const localRooms = new Map();
const ROOM_TTL_SECONDS = 24 * 60 * 60;

function redisConfig() {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (rawUrl && rawToken) {
    let url = String(rawUrl).trim()
      .replace(/^\s*(?:UPSTASH_REDIS_REST_URL|KV_REST_API_URL)\s*=\s*/i, '')
      .replace(/^['"`]|['"`]$/g, '')
      .trim();
    const markdownTarget = url.match(/\]\(\s*(https?:\/\/[^)\s]+)\s*\)/i);
    const plainUrl = url.match(/https?:\/\/[^\s"'<>\[\])]+/i);
    if (markdownTarget) url = markdownTarget[1];
    else if (plainUrl) url = plainUrl[0];
    url = url.replace(/\/+$/, '');
    try {
      if (new URL(url).protocol !== 'https:') throw new Error('HTTPS required');
    } catch {
      throw new Error('Invalid Upstash Redis URL. Set UPSTASH_REDIS_REST_URL to the plain HTTPS endpoint, such as https://your-database.upstash.io.');
    }
    const token = String(rawToken).trim().replace(/^['"`]|['"`]$/g, '');
    return { url, token };
  }
  if (process.env.VERCEL) throw new Error('Multiplayer storage is not configured. Connect an Upstash Redis database to this Vercel project.');
  return null;
}

async function redisCommand(...command) {
  const config = redisConfig();
  if (!config) throw new Error('Redis is unavailable.');
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || `Redis request failed (${response.status}).`);
  return payload.result;
}

function roomKey(code) { return `cardgame:room:${code}`; }

async function readRoom(code) {
  if (!redisConfig()) return localRooms.get(code) || null;
  const stored = await redisCommand('GET', roomKey(code));
  return stored ? JSON.parse(stored) : null;
}

async function saveRoom(room) {
  if (!redisConfig()) {
    localRooms.set(room.code, room);
    return;
  }
  await redisCommand('SET', roomKey(room.code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
}

async function mutateRoom(code, mutate) {
  if (!redisConfig()) {
    const room = localRooms.get(code);
    if (!room) throw new Error('Room not found. Check the room code.');
    const result = await mutate(room);
    await saveRoom(room);
    return result;
  }

  const lockKey = `${roomKey(code)}:lock`;
  const lockToken = randomUUID();
  let locked = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await redisCommand('SET', lockKey, lockToken, 'NX', 'PX', 10000) === 'OK') {
      locked = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  if (!locked) throw new Error('Room is busy. Try that action again.');

  try {
    const room = await readRoom(code);
    if (!room) throw new Error('Room not found. Check the room code.');
    const result = await mutate(room);
    await saveRoom(room);
    return result;
  } finally {
    await redisCommand('EVAL', "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, lockKey, lockToken);
  }
}

function cleanName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!name) throw new Error('Enter your player name.');
  return name;
}

function cleanCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) throw new Error('Enter the 6-character room code.');
  return code;
}

function cardFromCode(code) {
  return new Card(code.slice(0, -1), code.slice(-1));
}

function serializeGame(game) {
  return {
    roundNumber: game.roundNumber,
    players: game.players.map(player => ({
      id: player.id,
      name: player.name,
      isAI: player.isAI,
      aiDifficulty: player.aiDifficulty,
      hand: player.hand.map(card => card.toString()),
      score: player.score,
      finishRank: player.finishRank
    })),
    excludedCards: game.excludedCards.map(card => card.toString()),
    dealingSpecs: game.dealingSpecs,
    state: game.state,
    currentTurnIndex: game.currentTurnIndex,
    leadPlayerId: game.leadPlayerId,
    starterPlayerId: game.starterPlayerId,
    currentPlay: game.currentPlay ? { ...game.currentPlay, cards: game.currentPlay.cards.map(card => card.toString()) } : null,
    consecutivePasses: game.consecutivePasses,
    tableCards: game.tableCards.map(card => card.toString()),
    finishOrder: game.finishOrder.map(player => player.id),
    lastWinnerId: game.lastWinner?.id || null,
    lastLoserId: game.lastLoser?.id || null,
    lastCardExchange: game.lastCardExchange,
    gameLog: game.gameLog
  };
}

function restoreGame(room) {
  const data = room.game;
  const game = new Game(room.playerCount, room.players.map(player => player.name), { aiPlayers: false });
  data.players.forEach((saved, index) => {
    const player = game.players[index];
    player.isAI = saved.isAI;
    player.aiDifficulty = saved.aiDifficulty;
    player.hand = saved.hand.map(cardFromCode);
    player.score = saved.score;
    player.finishRank = saved.finishRank;
  });
  game.roundNumber = data.roundNumber;
  game.excludedCards = data.excludedCards.map(cardFromCode);
  game.dealingSpecs = data.dealingSpecs;
  game.state = data.state;
  game.currentTurnIndex = data.currentTurnIndex;
  game.leadPlayerId = data.leadPlayerId;
  game.starterPlayerId = data.starterPlayerId;
  game.currentPlay = data.currentPlay ? { ...data.currentPlay, cards: data.currentPlay.cards.map(cardFromCode) } : null;
  game.consecutivePasses = data.consecutivePasses;
  game.tableCards = data.tableCards.map(cardFromCode);
  game.finishOrder = data.finishOrder.map(id => game.getPlayerById(id));
  game.lastWinner = data.lastWinnerId ? game.getPlayerById(data.lastWinnerId) : null;
  game.lastLoser = data.lastLoserId ? game.getPlayerById(data.lastLoserId) : null;
  game.lastCardExchange = data.lastCardExchange;
  game.gameLog = data.gameLog;
  return game;
}

function playerFor(room, token) {
  if (!token) throw new Error('Your room session is missing. Rejoin the room.');
  const player = room.players.find(member => member.token && member.token === token);
  if (!player) throw new Error('This room session is not valid. Rejoin the room.');
  return player;
}

function roomView(room, player) {
  const view = {
    roomCode: room.code,
    phase: room.phase,
    playerCount: room.playerCount,
    players: room.players.map(({ id, name, isBot }) => ({ id, name, isBot: Boolean(isBot), isHost: id === room.hostPlayerId })),
    playerId: player.id,
    isHost: player.id === room.hostPlayerId,
    notice: room.notice || null
  };
  if (room.phase !== 'playing') return view;

  const game = restoreGame(room);
  const state = game.getState();
  state.players = state.players.map(member => member.id === player.id ? member : { ...member, hand: [] });
  delete state.dealingSpecs;
  delete state.excludedCards;
  state.playableCardCodes = [];
  const ownPlayer = game.getPlayerById(player.id);
  if (game.state === 'PLAYING' && game.getCurrentPlayer()?.id === player.id) {
    if (!game.currentPlay) {
      state.playableCardCodes = ownPlayer.hand.map(card => card.toString());
    } else if (game.currentPlay.type === 'SINGLE') {
      state.playableCardCodes = ownPlayer.hand.filter(card => card.rankPower >= game.currentPlay.rankPower).map(card => card.toString());
    } else {
      state.playableCardCodes = ownPlayer.getPairs()
        .filter(pair => pair[0].rankPower >= game.currentPlay.rankPower)
        .flatMap(pair => pair.map(card => card.toString()));
    }
  }
  view.game = state;
  return view;
}

export async function createRoom({ playerName, playerCount }) {
  const name = cleanName(playerName);
  const count = Number(playerCount);
  if (!Number.isInteger(count) || count < 4 || count > 52) throw new Error('Choose between 4 and 52 players.');
  const redis = redisConfig();
  let room;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomBytes(3).toString('hex').toUpperCase();
    if (await readRoom(code)) continue;
    room = {
      code,
      phase: 'lobby',
      playerCount: count,
      hostPlayerId: 1,
      players: [{ id: 1, name, token: randomUUID(), isBot: false }],
      createdAt: Date.now(),
      game: null
    };
    if (!redis) {
      await saveRoom(room);
      break;
    }
    if (await redisCommand('SET', roomKey(code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS, 'NX') === 'OK') break;
    room = null;
  }
  if (!room) throw new Error('Could not create a room. Please try again.');
  return { roomCode: room.code, token: room.players[0].token, playerId: 1, isHost: true, view: roomView(room, room.players[0]) };
}

export async function joinRoom({ roomCode, playerName }) {
  const code = cleanCode(roomCode);
  const name = cleanName(playerName);
  let joined;
  await mutateRoom(code, room => {
    if (room.phase !== 'lobby') throw new Error('This game has already started.');
    if (room.players.length >= room.playerCount) throw new Error('This room is full.');
    const player = { id: room.players.length + 1, name, token: randomUUID(), isBot: false };
    room.players.push(player);
    joined = { roomCode: room.code, token: player.token, playerId: player.id, isHost: false, view: roomView(room, player) };
  });
  return joined;
}

export async function getRoom({ roomCode, token }) {
  const code = cleanCode(roomCode);
  const room = await readRoom(code);
  if (!room) throw new Error('Room not found. Check the room code.');
  const player = playerFor(room, token);
  return roomView(room, player);
}

export async function startRoom({ roomCode, token }) {
  const code = cleanCode(roomCode);
  return mutateRoom(code, room => {
    const player = playerFor(room, token);
    if (player.id !== room.hostPlayerId) throw new Error('Only the room host can start the game.');
    if (room.phase !== 'lobby') throw new Error('This game has already started.');
    if (room.players.length !== room.playerCount) throw new Error('Wait until every seat has joined.');
    const game = buildRoomGame(room);
    room.game = serializeGame(game);
    room.phase = 'playing';
    return roomView(room, player);
  });
}

export async function playAction({ roomCode, token, cards, pass }) {
  const code = cleanCode(roomCode);
  return mutateRoom(code, room => {
    const player = playerFor(room, token);
    if (room.phase !== 'playing') throw new Error('The game has not started yet.');
    const game = restoreGame(room);
    game.playMove(player.id, pass ? [] : cards);
    room.game = serializeGame(game);
    return roomView(room, player);
  });
}

function buildRoomGame(room) {
  const botPlayers = room.players.filter(member => member.isBot);
  const game = new Game(room.playerCount, room.players.map(member => member.name), {
    aiPlayerIds: botPlayers.map(member => member.id)
  });
  botPlayers.forEach(bot => { game.getPlayerById(bot.id).aiDifficulty = bot.difficulty || 'normal'; });
  game.startRound();
  return game;
}

export async function fillRoomWithBots({ roomCode, token, difficulty }) {
  const code = cleanCode(roomCode);
  const level = ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
  return mutateRoom(code, room => {
    const player = playerFor(room, token);
    if (player.id !== room.hostPlayerId) throw new Error('Only the room host can add bots.');
    if (room.phase !== 'lobby') throw new Error('Bots can only be added before the game starts.');
    while (room.players.length < room.playerCount) {
      const id = room.players.length + 1;
      room.players.push({ id, name: `Bot ${id - 1}`, token: null, isBot: true, difficulty: level });
    }
    return roomView(room, player);
  });
}

export async function playBotTurn({ roomCode, token, expectedPlayerId }) {
  const code = cleanCode(roomCode);
  return mutateRoom(code, room => {
    const requester = playerFor(room, token);
    if (room.phase !== 'playing' || room.game.state !== 'PLAYING') return roomView(room, requester);
    const game = restoreGame(room);
    const bot = game.getCurrentPlayer();
    if (bot?.isAI && bot.id === Number(expectedPlayerId)) {
      game.playMove(bot.id, game.getAIMove(bot));
      room.game = serializeGame(game);
    }
    return roomView(room, requester);
  });
}

export async function nextRound({ roomCode, token }) {
  const code = cleanCode(roomCode);
  return mutateRoom(code, room => {
    const player = playerFor(room, token);
    if (player.id !== room.hostPlayerId) throw new Error('Only the room host can start the next round.');
    if (room.phase !== 'playing' || room.game.state !== 'ROUND_OVER') throw new Error('The round is still in progress.');
    const game = restoreGame(room);
    game.startRound();
    room.game = serializeGame(game);
    return roomView(room, player);
  });
}

export async function skipNextGame({ roomCode, token }) {
  const code = cleanCode(roomCode);
  return mutateRoom(code, room => {
    const player = playerFor(room, token);
    if (player.id !== room.hostPlayerId) throw new Error('Only the room host can skip the next game.');
    if (room.phase !== 'playing' || room.game.state !== 'ROUND_OVER') throw new Error('The round is still in progress.');
    room.phase = 'lobby';
    room.game = null;
    room.notice = 'Next game skipped. Start a fresh game when everyone is ready.';
    return roomView(room, player);
  });
}

export async function startFreshGame({ roomCode, token }) {
  const code = cleanCode(roomCode);
  return mutateRoom(code, room => {
    const player = playerFor(room, token);
    if (player.id !== room.hostPlayerId) throw new Error('Only the room host can start a fresh game.');
    if (room.phase === 'playing' && room.game.state !== 'ROUND_OVER') throw new Error('Finish the current game first.');
    if (room.players.length !== room.playerCount) throw new Error('Wait until every seat has joined or fill the remaining seats with bots.');
    const game = buildRoomGame(room);
    room.game = serializeGame(game);
    room.phase = 'playing';
    room.notice = null;
    return roomView(room, player);
  });
}

export async function exitRoom({ roomCode, token }) {
  const code = cleanCode(roomCode);
  return mutateRoom(code, room => {
    const player = playerFor(room, token);
    player.isBot = true;
    player.difficulty = player.difficulty || 'normal';
    player.token = null;
    if (player.id === room.hostPlayerId) {
      const nextHost = room.players.find(member => member.id !== player.id && !member.isBot);
      if (nextHost) room.hostPlayerId = nextHost.id;
    }
    if (room.phase === 'playing' && room.game) {
      const game = restoreGame(room);
      const gamePlayer = game.getPlayerById(player.id);
      gamePlayer.isAI = true;
      gamePlayer.aiDifficulty = player.difficulty;
      room.game = serializeGame(game);
    }
    return { ok: true };
  });
}
