const { put, get } = require('@vercel/blob');

async function readJson(pathname, fallback) {
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return fallback;
    const text = await new Response(result.stream).text();
    if (!text) return fallback;
    return JSON.parse(text);
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('not found') || msg.includes('404') || err?.name === 'BlobNotFoundError') return fallback;
    throw err;
  }
}

async function writeJson(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function readBuffer(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const arrayBuffer = await new Response(result.stream).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function writeBuffer(pathname, buffer, contentType) {
  await put(pathname, buffer, {
    access: 'private',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

function wsPath(workspaceId, ...parts) {
  return ['wr', workspaceId, ...parts].join('/');
}

module.exports = {
  readJson,
  writeJson,
  readBuffer,
  writeBuffer,
  wsPath,
};
