const {
  applyCors, getWorkspaceId, jsonResponse, errorResponse, requireWriteAuth, readJsonBody,
} = require('../_lib/http');
const { readBuffer, writeBuffer, wsPath } = require('../_lib/blob-store');

function safeMappingId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  const ws = getWorkspaceId(req);
  const mappingId = safeMappingId(req.query?.mappingId);

  try {
    if (req.method === 'GET') {
      if (!mappingId) return errorResponse(res, 400, 'mappingId required');
      const buf = await readBuffer(wsPath(ws, 'templates', `${mappingId}.pdf`));
      if (!buf) return errorResponse(res, 404, 'Template not found');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.end(buf);
      return;
    }

    if (req.method === 'PUT') {
      if (!requireWriteAuth(req)) return errorResponse(res, 401, 'Unauthorized');
      if (!mappingId) return errorResponse(res, 400, 'mappingId required');
      const body = readJsonBody(req);
      if (!body?.pdfBase64) return errorResponse(res, 400, 'pdfBase64 required');
      const buf = Buffer.from(body.pdfBase64, 'base64');
      await writeBuffer(wsPath(ws, 'templates', `${mappingId}.pdf`), buf, 'application/pdf');
      return jsonResponse(res, { ok: true, mappingId, bytes: buf.length });
    }

    return errorResponse(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('pdf-template API error', err);
    return errorResponse(res, 500, err.message || 'Internal error');
  }
};
