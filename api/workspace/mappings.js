const {
  applyCors, getWorkspaceId, jsonResponse, errorResponse, requireWriteAuth, readJsonBody,
} = require('../_lib/http');
const { readJson, writeJson, wsPath } = require('../_lib/blob-store');

const FALLBACK = { activeId: null, items: [] };

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  const ws = getWorkspaceId(req);
  const path = wsPath(ws, 'mappings.json');

  try {
    if (req.method === 'GET') {
      const data = await readJson(path, FALLBACK);
      return jsonResponse(res, data);
    }

    if (req.method === 'PUT') {
      if (!requireWriteAuth(req)) return errorResponse(res, 401, 'Unauthorized — set WR_SHARED_TOKEN in settings');
      const body = readJsonBody(req);
      if (!body || !Array.isArray(body.items)) {
        return errorResponse(res, 400, 'Expected { activeId, items: [] }');
      }
      await writeJson(path, {
        activeId: body.activeId ?? null,
        items: body.items,
        syncedAt: new Date().toISOString(),
      });
      return jsonResponse(res, { ok: true, syncedAt: new Date().toISOString() });
    }

    return errorResponse(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('mappings API error', err);
    return errorResponse(res, 500, err.message || 'Internal error');
  }
};
