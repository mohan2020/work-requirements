/**
 * Shared review workspace — zero CHW setup on production deploy.
 * CHWs: auto-load mappings + Submit for review (no tokens).
 * Admins: ?admin=1 on localhost or wizard for mapping publish; review inbox via ?key=
 */
const REVIEW_WORKSPACE = 'chw-feedback';
const CHW_NAME_KEY = 'chw_reviewer_name';
const ADMIN_TOKEN_KEY = 'wr_admin_api_token';

function isDeployedApp() {
  const h = window.location.hostname;
  return h && !['localhost', '127.0.0.1'].includes(h);
}

function isAdminContext() {
  try {
    return new URLSearchParams(window.location.search).get('admin') === '1' || !isDeployedApp();
  } catch {
    return !isDeployedApp();
  }
}

function isRemoteStorageEnabled() {
  return isDeployedApp();
}

function getWorkspaceId() {
  return REVIEW_WORKSPACE;
}

function getApiToken() {
  if (!isAdminContext()) return '';
  return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function setAdminApiToken(token) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function getStaffChwName() {
  return sessionStorage.getItem(CHW_NAME_KEY) || '';
}

function setStaffChwName(name) {
  const val = String(name || '').trim();
  if (val) sessionStorage.setItem(CHW_NAME_KEY, val);
  return val;
}

function getAdminViewKey() {
  try {
    return new URLSearchParams(window.location.search).get('key') || '';
  } catch {
    return '';
  }
}

async function remoteFetch(path, options = {}, { includeAdminKey = false } = {}) {
  const ws = getWorkspaceId();
  const headers = { ...(options.headers || {}) };
  const token = getApiToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let url = `/api/workspace/${path}?ws=${encodeURIComponent(ws)}`;
  if (includeAdminKey) {
    const key = getAdminViewKey();
    if (key) url += `&key=${encodeURIComponent(key)}`;
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = data?.error || (typeof data === 'string' ? data : res.statusText);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return data;
}

function queueRemoteSync(fn, label = 'sync') {
  if (!isAdminContext()) return;
  Promise.resolve()
    .then(fn)
    .catch((err) => console.warn(`Remote ${label} failed:`, err.message || err));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function pullRemoteMappings() {
  return remoteFetch('mappings', { method: 'GET' });
}

async function pushRemoteMappings(store) {
  return remoteFetch('mappings', {
    method: 'PUT',
    body: JSON.stringify(store),
  });
}

async function uploadRemotePdfTemplate(mappingId, arrayBuffer) {
  return remoteFetch(`pdf-template?mappingId=${encodeURIComponent(mappingId)}`, {
    method: 'PUT',
    body: JSON.stringify({ pdfBase64: arrayBufferToBase64(arrayBuffer) }),
  });
}

async function downloadRemotePdfTemplate(mappingId) {
  const ws = getWorkspaceId();
  const res = await fetch(
    `/api/workspace/pdf-template?ws=${encodeURIComponent(ws)}&mappingId=${encodeURIComponent(mappingId)}`
  );
  if (!res.ok) return null;
  return res.arrayBuffer();
}

async function submitForReview(payload) {
  if (!isDeployedApp()) {
    throw new Error('Submit for review is available on the deployed app only.');
  }
  const ws = getWorkspaceId();
  const res = await fetch(`/api/workspace/submit-review?ws=${encodeURIComponent(ws)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error(data?.error || 'Submit failed');
  return data;
}

async function listReviewSubmissions() {
  return remoteFetch('exports', { method: 'GET' }, { includeAdminKey: true });
}

function reviewDownloadUrl(exportId) {
  const ws = getWorkspaceId();
  const key = getAdminViewKey();
  let url = `/api/workspace/exports?ws=${encodeURIComponent(ws)}&id=${encodeURIComponent(exportId)}`;
  if (key) url += `&key=${encodeURIComponent(key)}`;
  return url;
}

async function initReviewWorkspace() {
  if (!isDeployedApp()) return null;
  try {
    const mappings = await pullRemoteMappings();
    if (mappings?.items?.length && typeof saveJson === 'function' && typeof WR_STORAGE !== 'undefined') {
      saveJson(WR_STORAGE.mappingsKey, {
        activeId: mappings.activeId ?? null,
        items: mappings.items,
      });
      return { mappings: true };
    }
  } catch (err) {
    console.warn('Could not load shared mappings:', err.message);
  }
  return { mappings: false };
}

function applyChwUiMode() {
  if (!isDeployedApp() || isAdminContext()) return;
  ['staff-admin-nav', 'staff-admin-nav-items'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

window.isDeployedApp = isDeployedApp;
window.isAdminContext = isAdminContext;
window.isRemoteStorageEnabled = isRemoteStorageEnabled;
window.getWorkspaceId = getWorkspaceId;
window.getApiToken = getApiToken;
window.setAdminApiToken = setAdminApiToken;
window.getStaffChwName = getStaffChwName;
window.setStaffChwName = setStaffChwName;
window.getAdminViewKey = getAdminViewKey;
window.queueRemoteSync = queueRemoteSync;
window.pullRemoteMappings = pullRemoteMappings;
window.pushRemoteMappings = pushRemoteMappings;
window.uploadRemotePdfTemplate = uploadRemotePdfTemplate;
window.downloadRemotePdfTemplate = downloadRemotePdfTemplate;
window.submitForReview = submitForReview;
window.listReviewSubmissions = listReviewSubmissions;
window.reviewDownloadUrl = reviewDownloadUrl;
window.initReviewWorkspace = initReviewWorkspace;
window.applyChwUiMode = applyChwUiMode;

// Legacy aliases (admin wizard)
window.initRemoteStorage = initReviewWorkspace;
window.listRemoteExports = async () => (await listReviewSubmissions())?.items || [];
window.arrayBufferToBase64 = arrayBufferToBase64;
