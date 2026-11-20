import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Game } from './src/game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const games = new Map();
const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

function publicState(game) {
  const state = game.getState();
  // Keep opponents' cards on the server; only return their card counts to the browser.
  state.players = state.players.map(player => player.id === 1 ? player : { ...player, hand: [] });
  // Deck trimming and dealing calculations stay entirely on the server.
  delete state.dealingSpecs;
  delete state.excludedCards;

  // Tell the UI which human cards can legally answer the current play.
  const human = game.getPlayerById(1);
  state.playableCardCodes = [];
  if (game.state === 'PLAYING' && game.getCurrentPlayer()?.id === 1 && human) {
    if (!game.currentPlay) {
      state.playableCardCodes = human.hand.map(card => card.toString());
    } else if (game.currentPlay.type === 'SINGLE') {
      state.playableCardCodes = human.hand
        .filter(card => card.rankPower >= game.currentPlay.rankPower)
        .map(card => card.toString());
    } else {
      state.playableCardCodes = human.getPairs()
        .filter(pair => pair[0].rankPower >= game.currentPlay.rankPower)
        .flatMap(pair => pair.map(card => card.toString()));
    }
  }
  return state;
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (body.length > 100_000) throw new Error('Request body is too large.');
  return body ? JSON.parse(body) : {};
}

async function handleApi(req, res, url) {
  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    if (url.pathname === '/api/new' && req.method === 'POST') {
      const count = Number.parseInt(body.playerCount, 10) || 4;
      if (count < 4 || count > 52) return sendJson(res, 400, { error: 'Player count must be between 4 and 52.' });
      const game = new Game(count, Array.isArray(body.playerNames) ? body.playerNames : []);
      game.startRound();
      const gameId = randomUUID();
      games.set(gameId, game);
      return sendJson(res, 201, { gameId, state: publicState(game) });
    }

    const gameId = body.gameId || url.searchParams.get('gameId');
    const game = games.get(gameId);
    if (!game) return sendJson(res, 404, { error: 'Game session not found. Start a new game.' });

    if (url.pathname === '/api/state' && req.method === 'GET') {
      return sendJson(res, 200, { state: publicState(game) });
    }
    if (url.pathname === '/api/action' && req.method === 'POST') {
      const cards = body.pass ? [] : body.cards;
      if (!body.pass && !Array.isArray(cards)) return sendJson(res, 400, { error: 'Send a card list or pass the turn.' });
      game.playMove(1, cards || []);
      return sendJson(res, 200, { state: publicState(game) });
    }
    if (url.pathname === '/api/ai-step' && req.method === 'POST') {
      const player = game.getCurrentPlayer();
      if (game.state === 'PLAYING' && player?.isAI) game.playMove(player.id, game.getAIMove(player));
      return sendJson(res, 200, { state: publicState(game) });
    }
    if (url.pathname === '/api/next-round' && req.method === 'POST') {
      if (game.state !== 'ROUND_OVER') return sendJson(res, 409, { error: 'The round is still in progress.' });
      game.startRound();
      return sendJson(res, 200, { state: publicState(game) });
    }
    return sendJson(res, 404, { error: 'API route not found.' });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || 'Invalid request.' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method Not Allowed');
  }

  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => console.log(`Card Game server running at http://localhost:${PORT}`));
