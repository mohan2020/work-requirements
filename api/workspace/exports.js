const {
  applyCors, getWorkspaceId, jsonResponse, errorResponse, requireAdminView, readJsonBody,
} = require('../_lib/http');
const { readJson, readBuffer, wsPath } = require('../_lib/blob-store');

const MANIFEST_FALLBACK = { items: [] };

function safeId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  const ws = getWorkspaceId(req);
  const manifestPath = wsPath(ws, 'exports-manifest.json');

  try {
    if (req.method === 'GET') {
      if (!requireAdminView(req)) return errorResponse(res, 401, 'Admin key required');

      const exportId = safeId(req.query?.id);
      if (exportId) {
        const manifest = await readJson(manifestPath, MANIFEST_FALLBACK);
        const meta = manifest.items?.find((e) => e.id === exportId);
        const ext = meta?.contentKind === 'json' ? 'json' : 'pdf';
        const buf = await readBuffer(wsPath(ws, 'exports', `${exportId}.${ext}`));
        if (!buf) return errorResponse(res, 404, 'Export not found');
        const filename = meta?.filename || `${exportId}.${ext}`;
        const contentType = ext === 'json' ? 'application/json' : 'application/pdf';
        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.end(buf);
        return;
      }

      const manifest = await readJson(manifestPath, MANIFEST_FALLBACK);
      return jsonResponse(res, manifest);
    }

    return errorResponse(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('exports API error', err);
    return errorResponse(res, 500, err.message || 'Internal error');
  }
};
