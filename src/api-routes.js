import { createRoom, exitRoom, fillRoomWithBots, getRoom, joinRoom, nextRound, playAction, playBotTurn, skipNextGame, startFreshGame, startRoom } from './room-service.js';

export async function dispatchApi(pathname, method, body = {}, query = {}) {
  try {
    if (pathname === '/api/create-room' && method === 'POST') {
      return { status: 201, body: await createRoom(body) };
    }
    if (pathname === '/api/join-room' && method === 'POST') {
      return { status: 200, body: await joinRoom(body) };
    }
    if (pathname === '/api/room' && method === 'POST') {
      return { status: 200, body: { view: await getRoom(body) } };
    }
    if (pathname === '/api/start-game' && method === 'POST') {
      return { status: 200, body: { view: await startRoom(body) } };
    }
    if (pathname === '/api/play' && method === 'POST') {
      if (!body.pass && !Array.isArray(body.cards)) throw new Error('Select a playable card or pass.');
      return { status: 200, body: { view: await playAction(body) } };
    }
    if (pathname === '/api/next-round' && method === 'POST') {
      return { status: 200, body: { view: await nextRound(body) } };
    }
    if (pathname === '/api/fill-bots' && method === 'POST') {
      return { status: 200, body: { view: await fillRoomWithBots(body) } };
    }
    if (pathname === '/api/ai-step' && method === 'POST') {
      return { status: 200, body: { view: await playBotTurn(body) } };
    }
    if (pathname === '/api/skip-next' && method === 'POST') {
      return { status: 200, body: { view: await skipNextGame(body) } };
    }
    if (pathname === '/api/fresh-game' && method === 'POST') {
      return { status: 200, body: { view: await startFreshGame(body) } };
    }
    if (pathname === '/api/exit-room' && method === 'POST') {
      return { status: 200, body: await exitRoom(body) };
    }
    return { status: 404, body: { error: 'API route not found.' } };
  } catch (error) {
    const message = error.message || 'The server could not complete that action.';
    const status = message.includes('not found') ? 404
      : message.includes('Only the room host') || message.includes('Wait until') || message.includes('full') || message.includes('busy') ? 409
        : message.includes('not configured') || message.includes('Redis') ? 503 : 400;
    return { status, body: { error: message } };
  }
}
