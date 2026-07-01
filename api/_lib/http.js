function jsonResponse(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function errorResponse(res, status, message) {
  jsonResponse(res, { error: message }, status);
}

function getWorkspaceId(req) {
  const { getDefaultWorkspaceId } = require('./review');
  const ws = req.query?.ws || req.query?.workspace;
  if (!ws || typeof ws !== 'string') return getDefaultWorkspaceId();
  return ws.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || getDefaultWorkspaceId();
}

function getBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const header = req.headers['x-wr-token'];
  return typeof header === 'string' ? header.trim() : '';
}

/** Admin mapping/template writes — see review.js */
function requireWriteAuth(req) {
  const { requireWriteAuth: check } = require('./review');
  return check(req);
}

function requireAdminView(req) {
  const { requireAdminView: check } = require('./review');
  return check(req);
}

function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-WR-Token');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) return JSON.parse(req.body);
  return null;
}

module.exports = {
  jsonResponse,
  errorResponse,
  getWorkspaceId,
  requireWriteAuth,
  requireAdminView,
  applyCors,
  readJsonBody,
};
