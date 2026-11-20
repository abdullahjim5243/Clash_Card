import { dispatchApi } from './api-routes.js';

export async function vercelHandler(req, res, pathname) {
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = body ? JSON.parse(body) : {}; }
    catch { body = {}; }
  }
  const query = Object.fromEntries(Object.entries(req.query || {}).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const result = await dispatchApi(pathname, req.method || 'GET', body, query);
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(result.body));
}
