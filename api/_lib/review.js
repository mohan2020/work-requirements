const DEFAULT_WORKSPACE = process.env.WR_DEFAULT_WORKSPACE || 'chw-feedback';

function getBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const header = req.headers['x-wr-token'];
  return typeof header === 'string' ? header.trim() : '';
}

function getDefaultWorkspaceId() {
  return DEFAULT_WORKSPACE.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'chw-feedback';
}

function getWorkspaceId(req) {
  const ws = req.query?.ws || req.query?.workspace;
  if (!ws || typeof ws !== 'string') return getDefaultWorkspaceId();
  return ws.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || getDefaultWorkspaceId();
}

function requireAdminView(req) {
  const expected = process.env.WR_ADMIN_VIEW_KEY;
  if (!expected) return true;
  const key = req.query?.key;
  return typeof key === 'string' && key === expected;
}

/** Admin mapping/template writes — token or open when WR_DEMO_MODE=1 */
function requireWriteAuth(req) {
  if (process.env.WR_DEMO_MODE === '1') return true;
  const expected = process.env.WR_SHARED_TOKEN;
  if (!expected) return true;
  return getBearerToken(req) === expected;
}

module.exports.getDefaultWorkspaceId = getDefaultWorkspaceId;
module.exports.requireAdminView = requireAdminView;
module.exports.requireWriteAuth = requireWriteAuth;
