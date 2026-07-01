const {
  applyCors, getWorkspaceId, jsonResponse, errorResponse, readJsonBody,
} = require('../_lib/http');
const { readJson, writeJson, writeBuffer, wsPath } = require('../_lib/blob-store');

const MANIFEST_FALLBACK = { items: [] };

function safeId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed');
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return errorResponse(res, 503, 'Review submissions are not configured on this server.');
  }

  const ws = getWorkspaceId(req);
  const manifestPath = wsPath(ws, 'exports-manifest.json');

  try {
    const body = readJsonBody(req);
    if (!body) return errorResponse(res, 400, 'Invalid JSON body');

    const id = safeId(body.id) || `rev_${Date.now()}`;
    const patientName = body.patientName || 'Unknown patient';
    const formId = body.formId || 'unknown';
    const formTitle = body.formTitle || formId;
    const submittedBy = body.submittedBy || 'CHW';
    let bytes = null;
    let filename = body.filename || `review_${formId}_${id}.pdf`;
    let contentKind = 'pdf';

    if (body.pdfBase64) {
      bytes = Buffer.from(body.pdfBase64, 'base64');
      await writeBuffer(wsPath(ws, 'exports', `${id}.pdf`), bytes, 'application/pdf');
    } else if (body.formState) {
      contentKind = 'json';
      filename = `review_${formId}_${id}.json`;
      bytes = Buffer.from(JSON.stringify(body.formState, null, 2), 'utf8');
      await writeBuffer(wsPath(ws, 'exports', `${id}.json`), bytes, 'application/json');
    } else {
      return errorResponse(res, 400, 'pdfBase64 or formState required');
    }

    const manifest = await readJson(manifestPath, MANIFEST_FALLBACK);
    const entry = {
      id,
      patientId: body.patientId || null,
      patientName,
      formId,
      formTitle,
      filename,
      percentComplete: body.percentComplete ?? null,
      savedBy: submittedBy,
      submittedBy,
      contentKind,
      createdAt: new Date().toISOString(),
      bytes: bytes.length,
      source: 'submit-review',
    };

    manifest.items = [entry, ...(manifest.items || []).filter((e) => e.id !== id)].slice(0, 100);
    await writeJson(manifestPath, manifest);

    return jsonResponse(res, { ok: true, message: 'Submitted for review', export: entry });
  } catch (err) {
    console.error('submit-review error', err);
    return errorResponse(res, 500, err.message || 'Internal error');
  }
};
