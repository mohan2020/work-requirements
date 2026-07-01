const { applyCors, getWorkspaceId, jsonResponse, requireWriteAuth } = require('../_lib/http');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  const ws = getWorkspaceId(req);
  const tokenRequired = !!process.env.WR_SHARED_TOKEN;
  const blobConfigured = !!process.env.BLOB_READ_WRITE_TOKEN;

  if (req.method === 'GET') {
    return jsonResponse(res, {
      ok: blobConfigured,
      workspace: ws,
      writeTokenRequired: tokenRequired,
      message: blobConfigured
        ? 'Shared workspace API is ready.'
        : 'BLOB_READ_WRITE_TOKEN is not configured. Create a Vercel Blob store and link it to this project.',
    });
  }

  if (req.method === 'POST' && req.url?.includes('ping')) {
    if (!requireWriteAuth(req)) return jsonResponse(res, { error: 'Unauthorized' }, 401);
    return jsonResponse(res, { ok: true, workspace: ws, pong: true });
  }

  return jsonResponse(res, { error: 'Method not allowed' }, 405);
};
