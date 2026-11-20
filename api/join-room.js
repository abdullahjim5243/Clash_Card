import { vercelHandler } from '../src/vercel-handler.js';
export default function handler(req, res) { return vercelHandler(req, res, '/api/join-room'); }
