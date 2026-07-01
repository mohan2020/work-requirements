/**
 * Persist form field mappings (with versions) and per-patient form submissions.
 * Uses localStorage for metadata; IndexedDB for PDF blobs when available.
 */
const WR_STORAGE = {
  mappingsKey: 'wr_form_mappings_v1',
  submissionsKey: 'wr_form_submissions_v1',
  pdfDbName: 'wr_mapping_pdfs',
  pdfStoreName: 'templates',
};

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function syncMappingsToRemote() {
  if (typeof isAdminContext === 'function' && !isAdminContext()) return;
  if (typeof queueRemoteSync !== 'function' || typeof pushRemoteMappings !== 'function') return;
  queueRemoteSync(() => pushRemoteMappings(getAllMappings()), 'mappings');
}

function syncSubmissionsToRemote() {
  /* CHW drafts stay local — only explicit Submit for review uploads to server */
}

/* ── Mapping versions ── */

function getAllMappings() {
  return loadJson(WR_STORAGE.mappingsKey, { activeId: null, items: [] });
}

function getMappingById(id) {
  const store = getAllMappings();
  return store.items.find((m) => m.id === id) || null;
}

function getActiveMapping() {
  const store = getAllMappings();
  if (!store.activeId) return store.items[0] || null;
  return store.items.find((m) => m.id === store.activeId) || store.items[0] || null;
}

function saveMappingVersion(payload) {
  const store = getAllMappings();
  const now = new Date().toISOString();
  const existing = payload.id ? store.items.find((m) => m.id === payload.id) : null;

  if (existing) {
    existing.name = payload.name || existing.name;
    existing.pdfFileName = payload.pdfFileName || existing.pdfFileName;
    existing.templatePath = payload.templatePath || existing.templatePath;
    existing.fields = payload.fields || existing.fields;
    existing.updatedAt = now;
    existing.version = (existing.version || 1) + 1;
    existing.history = existing.history || [];
    existing.history.unshift({
      version: existing.version,
      savedAt: now,
      fieldCount: (existing.fields || []).filter((f) => f.source === 'ehr' || f.source === 'manual').length,
      snapshot: JSON.parse(JSON.stringify(existing.fields)),
    });
    existing.history = existing.history.slice(0, 20);
  } else {
    const id = `map_${Date.now()}`;
    const item = {
      id,
      name: payload.name || 'Untitled mapping',
      pdfFileName: payload.pdfFileName || '',
      templatePath: payload.templatePath || null,
      fields: payload.fields || [],
      version: 1,
      createdAt: now,
      updatedAt: now,
      history: [],
    };
    store.items.unshift(item);
    if (!store.activeId) store.activeId = id;
  }

  saveJson(WR_STORAGE.mappingsKey, store);
  syncMappingsToRemote();
  return existing || store.items[0];
}

function setActiveMapping(id) {
  const store = getAllMappings();
  if (store.items.some((m) => m.id === id)) {
    store.activeId = id;
    saveJson(WR_STORAGE.mappingsKey, store);
    syncMappingsToRemote();
  }
}

function deleteMapping(id) {
  const store = getAllMappings();
  store.items = store.items.filter((m) => m.id !== id);
  if (store.activeId === id) store.activeId = store.items[0]?.id || null;
  saveJson(WR_STORAGE.mappingsKey, store);
  syncMappingsToRemote();
}

function restoreMappingVersion(mappingId, historyIndex) {
  const mapping = getMappingById(mappingId);
  if (!mapping?.history?.[historyIndex]) return null;
  mapping.fields = JSON.parse(JSON.stringify(mapping.history[historyIndex].snapshot));
  mapping.updatedAt = new Date().toISOString();
  mapping.version = (mapping.version || 1) + 1;
  saveMappingVersion(mapping);
  return mapping;
}

/* ── PDF blob storage (IndexedDB) ── */

function openPdfDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(WR_STORAGE.pdfDbName, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(WR_STORAGE.pdfStoreName);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storePdfBlob(mappingId, arrayBuffer, options = {}) {
  const { skipRemote = false } = options;
  let stored = false;
  try {
    const db = await openPdfDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(WR_STORAGE.pdfStoreName, 'readwrite');
      tx.objectStore(WR_STORAGE.pdfStoreName).put(arrayBuffer, mappingId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    stored = true;
  } catch (err) {
    console.warn('IndexedDB unavailable for PDF storage', err);
  }

  if (!skipRemote && typeof uploadRemotePdfTemplate === 'function' && typeof isRemoteStorageEnabled === 'function' && isRemoteStorageEnabled()) {
    try {
      await uploadRemotePdfTemplate(mappingId, arrayBuffer);
      stored = true;
    } catch (err) {
      console.warn('Remote PDF template upload failed', err);
    }
  }

  return stored;
}

async function getPdfBlob(mappingId) {
  try {
    const db = await openPdfDb();
    const local = await new Promise((resolve, reject) => {
      const tx = db.transaction(WR_STORAGE.pdfStoreName, 'readonly');
      const req = tx.objectStore(WR_STORAGE.pdfStoreName).get(mappingId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (local) return local;
  } catch {
    /* fall through to remote */
  }

  if (typeof downloadRemotePdfTemplate === 'function' && typeof isRemoteStorageEnabled === 'function' && isRemoteStorageEnabled()) {
    try {
      const remote = await downloadRemotePdfTemplate(mappingId);
      if (remote) {
        await storePdfBlob(mappingId, remote, { skipRemote: true });
        return remote;
      }
    } catch (err) {
      console.warn('Remote PDF template fetch failed', err);
    }
  }

  return null;
}

/* ── Per-patient form submissions ── */

function getAllSubmissions() {
  return loadJson(WR_STORAGE.submissionsKey, {});
}

function getPatientSubmissions(patientId) {
  const all = getAllSubmissions();
  return all[patientId] || [];
}

function saveFormSubmission(patientId, formId, state, meta = {}) {
  const all = getAllSubmissions();
  if (!all[patientId]) all[patientId] = [];

  const entry = {
    id: `sub_${Date.now()}`,
    formId,
    savedAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state)),
    meta: {
      percentComplete: meta.percentComplete ?? null,
      label: meta.label || FORM_SCHEMAS?.[formId]?.shortTitle || formId,
      ...meta,
    },
  };

  /* Update latest draft for this form, keep history */
  const existingIdx = all[patientId].findIndex((s) => s.formId === formId && s.meta?.isDraft);
  if (existingIdx >= 0) {
    entry.meta.isDraft = true;
    entry.id = all[patientId][existingIdx].id;
    all[patientId][existingIdx] = entry;
  } else {
    entry.meta.isDraft = true;
    all[patientId].unshift(entry);
  }

  /* Cap history per patient */
  all[patientId] = all[patientId].slice(0, 50);
  saveJson(WR_STORAGE.submissionsKey, all);
  syncSubmissionsToRemote();
  return entry;
}

function finalizeFormSubmission(patientId, formId) {
  const all = getAllSubmissions();
  const list = all[patientId] || [];
  const draft = list.find((s) => s.formId === formId && s.meta?.isDraft);
  if (draft) {
    draft.meta.isDraft = false;
    draft.meta.finalizedAt = new Date().toISOString();
    saveJson(WR_STORAGE.submissionsKey, all);
    syncSubmissionsToRemote();
  }
  return draft;
}

function loadLatestDraft(patientId, formId) {
  const list = getPatientSubmissions(patientId);
  return list.find((s) => s.formId === formId && s.meta?.isDraft) || null;
}

function applyDraftToFormState(patientId, formId) {
  const draft = loadLatestDraft(patientId, formId);
  if (!draft?.state || typeof formResponses === 'undefined') return false;
  const key = `${patientId}:${formId}`;
  formResponses[key] = { ...draft.state };
  return true;
}

window.WR_STORAGE = WR_STORAGE;
window.getAllMappings = getAllMappings;
window.getMappingById = getMappingById;
window.getActiveMapping = getActiveMapping;
window.saveMappingVersion = saveMappingVersion;
window.setActiveMapping = setActiveMapping;
window.deleteMapping = deleteMapping;
window.restoreMappingVersion = restoreMappingVersion;
window.storePdfBlob = storePdfBlob;
window.getPdfBlob = getPdfBlob;
window.getAllSubmissions = getAllSubmissions;
window.getPatientSubmissions = getPatientSubmissions;
window.saveFormSubmission = saveFormSubmission;
window.finalizeFormSubmission = finalizeFormSubmission;
window.loadLatestDraft = loadLatestDraft;
window.applyDraftToFormState = applyDraftToFormState;
