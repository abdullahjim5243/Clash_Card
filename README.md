# Clash Card

A multiplayer card game for browser play. Players can create a private room, invite friends with a six-character code, or fill the other seats with bots.

Read [GAME_RULES.md](GAME_RULES.md) for the player rules.

## Run locally

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000). Local rooms are stored in the running server process.

## Play online

The site uses Vercel Functions for its API and Upstash Redis to share room state across requests and players. Vercel does not keep a single server process for all players, so the deployed multiplayer game needs the Redis connection.

1. Connect an Upstash Redis database to the Vercel project. The integration should provide `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` and `KV_REST_API_TOKEN`).
   Use the same database credentials for every Vercel environment where players need to share rooms. Room codes from localhost do not exist in the Vercel database.
2. Deploy this project with the Vercel CLI:

   ```bash
   npx vercel --prod
   ```

Room data expires after 24 hours. The browser checks for game updates about every 1.2 seconds.

## Play with bots

Choose a bot level (Easy, Normal, or Hard) and select **Play with bots**. To mix friends and bots, create a room and use **Fill empty seats with bots** before starting.

## Project layout

- `src/game.js` contains the card rules, dealing, turns, and bot strategy.
- `src/room-service.js` manages multiplayer rooms, player sessions, and Redis persistence.
- `api/` contains the Vercel Function entry points.
- `server.js` serves the same API locally.
- `public/` contains the browser game.
