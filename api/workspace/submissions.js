const {
  applyCors, getWorkspaceId, jsonResponse, errorResponse, requireWriteAuth, readJsonBody,
} = require('../_lib/http');
const { readJson, writeJson, wsPath } = require('../_lib/blob-store');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  const ws = getWorkspaceId(req);
  const path = wsPath(ws, 'submissions.json');

  try {
    if (req.method === 'GET') {
      const data = await readJson(path, {});
      return jsonResponse(res, data);
    }

    if (req.method === 'PUT') {
      if (!requireWriteAuth(req)) return errorResponse(res, 401, 'Unauthorized');
      const body = readJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return errorResponse(res, 400, 'Expected submissions object keyed by patientId');
      }
      await writeJson(path, { ...body, _syncedAt: new Date().toISOString() });
      return jsonResponse(res, { ok: true, syncedAt: new Date().toISOString() });
    }

    return errorResponse(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('submissions API error', err);
    return errorResponse(res, 500, err.message || 'Internal error');
  }
};
