/**
 * Form Mapping Wizard — step navigation, PDF extract, map, preview, save.
 */
const WIZARD_STEPS = [
  { id: 'catalog', label: 'EHR fields', desc: 'Available clinical data' },
  { id: 'upload', label: 'Upload PDF', desc: 'Official form template' },
  { id: 'map', label: 'Map fields', desc: 'Connect PDF to EHR' },
  { id: 'preview', label: 'Preview', desc: 'Sample filled PDF' },
  { id: 'save', label: 'Save mapping', desc: 'Versions & history' },
];

const wizardState = {
  step: 0,
  pdfFileName: '',
  pdfBytes: null,
  pdfUrl: null,
  templatePath: null,
  extractedFields: [],
  mappings: [],
  mappingName: '',
  mappingId: null,
  searchCatalog: '',
};

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return [...document.querySelectorAll(sel)]; }

function setStep(idx) {
  wizardState.step = idx;
  renderWizard();
}

function nextStep() {
  if (wizardState.step < WIZARD_STEPS.length - 1) {
    if (validateStep(wizardState.step)) setStep(wizardState.step + 1);
  }
}

function prevStep() {
  if (wizardState.step > 0) setStep(wizardState.step - 1);
}

function validateStep(idx) {
  if (idx === 1 && !wizardState.pdfBytes && !wizardState.templatePath) {
    alert('Upload a PDF or select a bundled template to continue.');
    return false;
  }
  if (idx === 2 && wizardState.extractedFields.length === 0) {
    alert('No PDF fields extracted. Go back and upload a fillable PDF.');
    return false;
  }
  return true;
}

function revokePdfUrl() {
  if (wizardState.pdfUrl) {
    URL.revokeObjectURL(wizardState.pdfUrl);
    wizardState.pdfUrl = null;
  }
}

async function setPdfFromBytes(bytes, fileName, templatePath = null) {
  revokePdfUrl();
  wizardState.pdfBytes = bytes;
  wizardState.pdfFileName = fileName;
  wizardState.templatePath = templatePath;
  wizardState.pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));

  wizardState.extractedFields = await extractPdfAcroFieldsFromBytes(bytes);
  wizardState.mappings = buildInitialMappings(wizardState.extractedFields);
  renderWizard();
}

async function extractPdfAcroFieldsFromBytes(bytes) {
  const { PDFDocument } = await loadPdfLibForMapper();
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  return form.getFields().map((f) => ({
    name: f.getName(),
    type: f.constructor.name.replace('PDF', ''),
  }));
}

function buildInitialMappings(pdfFields) {
  const ehrFields = getAllEhrFields();
  const active = getActiveMapping();

  return pdfFields.map((pdf) => {
    const existing = active?.fields?.find((m) => m.pdfField === pdf.name);
    if (existing) return { ...existing, pdfType: pdf.type };

    /* Heuristic auto-match by name similarity */
    const lower = pdf.name.toLowerCase();
    let suggested = null;
    if (lower.includes('name') && !lower.includes('print') && !lower.includes('provider')) suggested = 'patient.name';
    else if (lower.includes('birth')) suggested = 'patient.dob';
    else if (lower.includes('address') && !lower.includes('_2')) suggested = 'patient.address';
    else if (lower.includes('telephone') || lower.includes('phone')) suggested = 'patient.phone';
    else if (lower.includes('city')) suggested = 'patient.city';
    else if (lower.includes('state') && !lower.includes('ment')) suggested = 'patient.state';
    else if (lower.includes('zip')) suggested = 'patient.zip';
    else if (lower.includes('signature')) suggested = 'manual.patientSignature';
    else if (lower.includes('ssn')) suggested = 'manual.custom';
    else if (lower.includes('date')) suggested = 'system.today';
    else if (lower.includes('provider') && lower.includes('name')) suggested = 'provider.name';
    else if (lower.includes('provider no') || lower.includes('npi')) suggested = 'provider.npi';

    const isAdmin = ['CO', 'RECORD NUMBER', 'CAT', 'CSLD', 'DIST', 'RECORD NAME', 'WORKER', 'RETURN TO:', 'RESET'].includes(pdf.name);
    const isSignature = pdf.type === 'Signature' || lower.includes('signature');

    return {
      pdfField: pdf.name,
      pdfType: pdf.type,
      source: isAdmin ? 'skip' : isSignature ? 'manual' : suggested ? 'ehr' : 'unmapped',
      ehrFieldId: isAdmin || isSignature ? null : suggested,
      manualLabel: isSignature ? 'Signature capture' : null,
    };
  });
}

function getMappingStats() {
  const total = wizardState.mappings.length;
  const mapped = wizardState.mappings.filter((m) => m.source === 'ehr' || m.source === 'manual').length;
  const skip = wizardState.mappings.filter((m) => m.source === 'skip').length;
  return { total, mapped, skip, unmapped: total - mapped - skip };
}

function updateMapping(idx, key, value) {
  const m = wizardState.mappings[idx];
  if (!m) return;
  m[key] = value;
  if (key === 'source') {
    if (value === 'ehr' && !m.ehrFieldId) m.ehrFieldId = getAllEhrFields()[0]?.id;
    if (value === 'manual' && !m.manualLabel) m.manualLabel = 'Staff entry';
    if (value === 'skip') { m.ehrFieldId = null; m.manualLabel = null; }
    if (value === 'unmapped') { m.ehrFieldId = null; m.manualLabel = null; }
  }
  renderMapStep();
}

async function loadBundledTemplate(path, name) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Cannot load ${path}`);
  const bytes = await res.arrayBuffer();
  await setPdfFromBytes(bytes, name, path);
}

async function handleFileUpload(file) {
  if (!file || file.type !== 'application/pdf') {
    alert('Please upload a PDF file.');
    return;
  }
  const bytes = await file.arrayBuffer();
  await setPdfFromBytes(bytes, file.name, null);
}

async function generatePreviewPdf() {
  if (!wizardState.pdfBytes) return null;
  const { PDFDocument } = await loadPdfLibForMapper();
  const doc = await PDFDocument.load(wizardState.pdfBytes.slice(0));
  const form = doc.getForm();

  wizardState.mappings.forEach((m) => {
    if (m.source !== 'ehr' && m.source !== 'manual') return;
    let value = '';
    if (m.source === 'ehr') value = resolveEhrSampleValue(m.ehrFieldId);
    else if (m.source === 'manual') value = m.manualLabel ? `[${m.manualLabel}]` : '(manual entry)';

    if (!value || m.pdfType === 'Signature' || m.pdfType === 'Button') return;
    try {
      if (m.pdfType === 'CheckBox') {
        form.getCheckBox(m.pdfField).check();
      } else {
        form.getTextField(m.pdfField).setText(String(value).substring(0, 2000));
      }
    } catch (err) {
      console.warn('Preview fill skip:', m.pdfField, err.message);
    }
  });

  const out = await doc.save();
  return URL.createObjectURL(new Blob([out], { type: 'application/pdf' }));
}

async function saveCurrentMapping() {
  const name = $('#mapping-name-input')?.value?.trim() || wizardState.mappingName || wizardState.pdfFileName || 'Untitled mapping';
  const payload = {
    id: wizardState.mappingId,
    name,
    pdfFileName: wizardState.pdfFileName,
    templatePath: wizardState.templatePath,
    fields: wizardState.mappings,
  };
  const saved = saveMappingVersion(payload);
  wizardState.mappingId = saved.id;
  wizardState.mappingName = saved.name;

  if (wizardState.pdfBytes) {
    await storePdfBlob(saved.id, wizardState.pdfBytes);
  }
  renderWizard();
  showWizardToast('Mapping saved', `Version ${saved.version} stored locally.`);
}

function showWizardToast(title, msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#16203A;color:#fff;padding:14px 18px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:999;font-size:13px;max-width:320px;';
  el.innerHTML = `<b style="display:block;margin-bottom:4px;">${title}</b>${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ── Renderers ── */

function renderWizard() {
  renderSidebar();
  renderTopbar();
  renderStepContent();
  renderFooter();
}

function renderSidebar() {
  const nav = $('#wizard-nav');
  if (!nav) return;
  nav.innerHTML = WIZARD_STEPS.map((s, i) => {
    const cls = ['wizard-step'];
    if (i === wizardState.step) cls.push('active');
    else if (i < wizardState.step) cls.push('done');
    return `
      <button type="button" class="${cls.join(' ')}" onclick="setStep(${i})">
        <span class="step-num">${i < wizardState.step ? '✓' : i + 1}</span>
        <span class="step-text"><b>${s.label}</b><span>${s.desc}</span></span>
      </button>`;
  }).join('');
}

function renderTopbar() {
  const title = $('#wizard-title');
  const sub = $('#wizard-subtitle');
  const step = WIZARD_STEPS[wizardState.step];
  if (title) title.textContent = step.label;
  if (sub) sub.textContent = `Step ${wizardState.step + 1} of ${WIZARD_STEPS.length} — ${step.desc}`;
}

function renderStepContent() {
  const host = $('#wizard-step-host');
  if (!host) return;
  const fns = [renderCatalogStep, renderUploadStep, renderMapStep, renderPreviewStep, renderSaveStep];
  host.innerHTML = fns[wizardState.step]();
  bindStepEvents();
}

function renderFooter() {
  const prev = $('#btn-prev');
  const next = $('#btn-next');
  if (prev) prev.disabled = wizardState.step === 0;
  if (next) {
    next.textContent = wizardState.step === WIZARD_STEPS.length - 1 ? 'Done' : 'Continue';
    next.onclick = wizardState.step === WIZARD_STEPS.length - 1
      ? () => { window.location.href = 'index.html'; }
      : nextStep;
  }
}

function renderCatalogStep() {
  const q = wizardState.searchCatalog.toLowerCase();
  const cats = EHR_FIELD_CATALOG.categories.map((cat) => {
    const fields = cat.fields.filter((f) =>
      !q || f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q) || f.fhir.toLowerCase().includes(q)
    );
    if (!fields.length) return '';
    return `
      <div class="card">
        <div class="cat-header"><h4>${cat.label}</h4><span class="badge gray">${fields.length} fields</span></div>
        <div class="cat-fields">
          ${fields.map((f) => `
            <div class="field-row">
              <div>
                <div class="label">${f.label}</div>
                <div class="fhir mono">${f.fhir}</div>
                <div class="fhir">ID: ${f.id} · ${f.type}</div>
              </div>
              <div class="sample-wrap">
                <span class="sample-label">Example value</span>
                <span class="sample mono" title="Demo only — real values come from the EHR at launch">${f.sample}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');

  const total = getAllEhrFields().length;
  return `
    <div class="card card-body" style="margin-bottom:20px;">
      <p style="margin:0;font-size:14px;color:var(--muted-foreground);">
        These fields resolve from the EHR via SMART on FHIR at launch — demographics, problem list, coverage, and provider context.
        Most exemption forms should map to this catalog rather than re-entering data manually.
        <strong style="color:var(--heading);font-weight:600;">Example value</strong> pills show demo data only; in production they are filled from the active patient context.
      </p>
    </div>
    <input type="search" class="search-input" id="catalog-search" placeholder="Search fields — name, MRN, diagnosis…" value="${wizardState.searchCatalog}">
    <p style="font-size:12px;color:var(--muted-foreground);margin:-12px 0 16px;">${total} fields across ${EHR_FIELD_CATALOG.categories.length} categories</p>
    <div class="catalog-grid">${cats}</div>`;
}

function renderUploadStep() {
  const hasPdf = !!wizardState.pdfUrl;
  return `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-head">
        <h3>Upload official form PDF</h3>
        <p>Drop a fillable AcroForm PDF, or choose a bundled DHS template below.</p>
      </div>
      <div class="card-body upload-step-layout">
        ${hasPdf ? `
          <div class="pdf-viewer-wrap" style="min-height:auto;">
            <div class="pdf-toolbar">
              <span class="fname">${wizardState.pdfFileName}</span>
              <span class="badge green">${wizardState.extractedFields.length} fields detected</span>
              <button type="button" class="btn sm secondary" onclick="clearPdf()">Replace PDF</button>
            </div>
            <iframe src="${wizardState.pdfUrl}" title="PDF preview"></iframe>
          </div>` : `
          <div class="upload-zone" id="upload-zone" role="button" tabindex="0" aria-label="Upload PDF file">
            <input type="file" id="pdf-file-input" accept="application/pdf">
            <div class="upload-icon">PDF</div>
            <h4>Drop your PDF here</h4>
            <p>Official DHS fillable form required — drag and drop, or click anywhere in this box to browse.</p>
            <span class="btn primary upload-btn">Choose PDF file</span>
          </div>`}

        <div class="upload-divider">or use bundled template</div>

        <div class="template-pick">
          <span class="template-pick-label">Templates already in the project:</span>
          <button type="button" class="template-chip" onclick="pickTemplate('assets/PA_1663_official.pdf','PA_1663_official.pdf')">PA 1663 — Employability Assessment</button>
          <button type="button" class="template-chip" onclick="pickTemplateFromInventory()">Load field inventory only (no PDF preview)</button>
        </div>
      </div>
    </div>`;
}

function renderMapStep() {
  if (!wizardState.mappings.length) {
    return `<div class="card card-body"><p>Upload a PDF first.</p><button class="btn primary" onclick="setStep(1)">Go to upload</button></div>`;
  }

  const stats = getMappingStats();
  const pct = stats.total ? Math.round(((stats.mapped + stats.skip) / stats.total) * 100) : 0;
  const rows = wizardState.mappings.map((m, i) => {
    const cls = m.source === 'skip' ? 'skip' : m.source === 'unmapped' ? 'unmapped' : 'mapped';
    const previewVal = m.source === 'ehr' ? resolveEhrSampleValue(m.ehrFieldId)
      : m.source === 'manual' ? (m.manualLabel || 'Manual entry at form fill')
      : m.source === 'skip' ? 'Admin / metadata — not filled'
      : 'Not mapped yet';

    const targetControl = m.source === 'ehr' ? `
            <select id="tgt-${i}" data-idx="${i}" class="map-ehr">
              <option value="">— Select —</option>
              ${getAllEhrFields().map((f) =>
                `<option value="${f.id}" ${m.ehrFieldId === f.id ? 'selected' : ''}>${f.category}: ${f.label}</option>`
              ).join('')}
            </select>` : m.source === 'manual' ? `
            <input type="text" id="tgt-${i}" data-idx="${i}" class="map-manual" value="${m.manualLabel || ''}" placeholder="e.g. Patient SSN segment 1">` : `
            <input type="text" disabled value="—" style="opacity:.5">`;

    return `
      <div class="mapping-row ${cls}">
        <div class="mapping-row-head">
          <span class="pdf-name">${m.pdfField}</span>
          <span class="pdf-type">${m.pdfType}</span>
        </div>
        <div class="mapping-controls">
          <label for="src-${i}">Source</label>
          <select id="src-${i}" data-idx="${i}" class="map-source">
            <option value="ehr" ${m.source === 'ehr' ? 'selected' : ''}>EHR field</option>
            <option value="manual" ${m.source === 'manual' ? 'selected' : ''}>Manual entry</option>
            <option value="skip" ${m.source === 'skip' ? 'selected' : ''}>Skip (admin/metadata)</option>
            <option value="unmapped" ${m.source === 'unmapped' ? 'selected' : ''}>Unmapped</option>
          </select>
          <label for="tgt-${i}">${m.source === 'ehr' ? 'EHR field' : m.source === 'manual' ? 'Label' : 'Target'}</label>
          ${targetControl}
        </div>
        <div class="mapping-preview-val"><strong>Example value (demo patient):</strong> ${previewVal}</div>
      </div>`;
  }).join('');

  return `
    <div class="mapping-progress">
      <span><strong>${stats.mapped}</strong> mapped · <strong>${stats.skip}</strong> skipped · <strong>${stats.unmapped}</strong> remaining</span>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span>${pct}%</span>
    </div>
    <div class="pdf-split">
      ${wizardState.pdfUrl ? `
      <div class="pdf-viewer-wrap">
        <div class="pdf-toolbar">
          <span class="fname">${wizardState.pdfFileName}</span>
          <a href="${wizardState.pdfUrl}" target="_blank" class="btn sm ghost">Open full screen</a>
        </div>
        <iframe src="${wizardState.pdfUrl}" title="PDF while mapping"></iframe>
      </div>` : `
      <div class="card card-body" style="min-height:320px;display:flex;align-items:center;justify-content:center;text-align:center;">
        <div>
          <p style="color:var(--muted-foreground);margin-bottom:12px;">No PDF loaded — field list extracted from inventory.</p>
          <button type="button" class="btn secondary" onclick="setStep(1)">Upload PDF to preview while mapping</button>
        </div>
      </div>`}
      <div class="mapping-list">${rows}</div>
    </div>`;
}

function renderPreviewStep() {
  return `
    <div class="preview-grid">
      <div class="card">
        <div class="card-head"><h3>Sample fill summary</h3><p>Uses Jane Doe demo patient values from EHR catalog</p></div>
        <div class="card-body preview-summary" id="preview-summary">
          <p style="color:var(--muted-foreground);">Click "Generate preview" to fill the PDF with sample data.</p>
        </div>
        <div style="padding:0 20px 20px;display:flex;gap:10px;">
          <button type="button" class="btn primary" id="btn-gen-preview">Generate preview</button>
          <a id="preview-download" class="btn secondary hidden" download="sample-filled.pdf">Download filled PDF</a>
        </div>
      </div>
      <div class="pdf-viewer-wrap" id="preview-pdf-wrap" style="min-height:640px;">
        <div class="pdf-toolbar"><span class="fname">Filled preview</span></div>
        <div style="padding:40px;text-align:center;color:var(--muted-foreground);" id="preview-placeholder">
          Preview will appear here after generation.
        </div>
      </div>
    </div>`;
}

function renderSaveStep() {
  const store = getAllMappings();
  const versions = store.items;

  return `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-head"><h3>Save this mapping</h3><p>Stored locally with version history — active mapping used when filling patient forms</p></div>
      <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
        <div style="flex:1;min-width:240px;">
          <label style="font-size:12px;font-weight:600;color:var(--muted-foreground);display:block;margin-bottom:6px;">Mapping name</label>
          <input type="text" id="mapping-name-input" class="search-input" style="margin:0;max-width:none;"
            value="${wizardState.mappingName || wizardState.pdfFileName || ''}" placeholder="e.g. PA 1663 — Employability Assessment">
        </div>
        <button type="button" class="btn primary" onclick="saveCurrentMapping()">Save mapping</button>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Saved mappings</h3><p>${versions.length} mapping(s) · click to load</p></div>
      <div class="card-body version-list" id="version-list">
        ${versions.length ? versions.map((v) => `
          <div class="version-item ${store.activeId === v.id ? 'active' : ''}">
            <div class="meta">
              <b>${v.name}</b>
              <span>v${v.version} · ${v.fields?.length || 0} fields · updated ${new Date(v.updatedAt).toLocaleString()}</span>
            </div>
            <button type="button" class="btn sm secondary" onclick="loadSavedMapping('${v.id}')">Load</button>
            <button type="button" class="btn sm ghost" onclick="activateMapping('${v.id}')">Set active</button>
          </div>`).join('') : '<p style="color:var(--muted-foreground);">No saved mappings yet.</p>'}
      </div>
    </div>`;
}

function bindStepEvents() {
  const search = $('#catalog-search');
  if (search) {
    search.oninput = (e) => {
      wizardState.searchCatalog = e.target.value;
      const host = $('#wizard-step-host');
      if (host) host.innerHTML = renderCatalogStep();
      bindStepEvents();
    };
  }

  const zone = $('#upload-zone');
  const input = $('#pdf-file-input');
  if (zone && input) {
    zone.onclick = () => input.click();
    zone.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    input.onchange = (e) => handleFileUpload(e.target.files[0]);
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
    zone.ondragleave = () => zone.classList.remove('dragover');
    zone.ondrop = (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      handleFileUpload(e.dataTransfer.files[0]);
    };
  }

  $$('.map-source').forEach((el) => {
    el.onchange = () => updateMapping(+el.dataset.idx, 'source', el.value);
  });
  $$('.map-ehr').forEach((el) => {
    el.onchange = () => updateMapping(+el.dataset.idx, 'ehrFieldId', el.value);
  });
  $$('.map-manual').forEach((el) => {
    el.oninput = () => updateMapping(+el.dataset.idx, 'manualLabel', el.value);
  });

  const genBtn = $('#btn-gen-preview');
  if (genBtn) genBtn.onclick = runPreview;
}

async function runPreview() {
  const url = await generatePreviewPdf();
  if (!url) return;
  const wrap = $('#preview-pdf-wrap');
  wrap.innerHTML = `
    <div class="pdf-toolbar"><span class="fname">Filled preview — Jane Doe sample</span></div>
    <iframe src="${url}" title="Filled PDF preview"></iframe>`;

  const dl = $('#preview-download');
  if (dl) { dl.href = url; dl.classList.remove('hidden'); }

  const stats = getMappingStats();
  $('#preview-summary').innerHTML = `
    <dl>
      <dt>Template</dt><dd>${wizardState.pdfFileName}</dd>
      <dt>Fields mapped</dt><dd>${stats.mapped} of ${stats.total}</dd>
      <dt>Sample patient</dt><dd>Jane Doe · MRN 100-200-300</dd>
    </dl>`;
}

function clearPdf() {
  revokePdfUrl();
  wizardState.pdfBytes = null;
  wizardState.pdfFileName = '';
  wizardState.templatePath = null;
  wizardState.extractedFields = [];
  wizardState.mappings = [];
  renderWizard();
}

async function pickTemplate(path, name) {
  try {
    await loadBundledTemplate(path, name);
    showWizardToast('Template loaded', `${wizardState.extractedFields.length} AcroForm fields extracted.`);
  } catch (err) {
    alert(`Could not load template: ${err.message}\n\nPlace the official PDF at ${path} or upload manually.`);
  }
}

async function pickTemplateFromInventory() {
  try {
    const res = await fetch('assets/form-field-inventory.json');
    const inv = await res.json();
    const pa1663 = inv.forms?.PA_1663;
    if (pa1663?.templatePath) {
      await pickTemplate(pa1663.templatePath, 'PA_1663_official.pdf');
    } else {
      wizardState.extractedFields = (pa1663?.fields || []).map((f) => ({ name: f.name, type: f.type.replace('Field', '') }));
      wizardState.mappings = buildInitialMappings(wizardState.extractedFields);
      wizardState.pdfFileName = 'PA_1663_official.pdf (fields only — upload PDF to preview)';
      renderWizard();
      showWizardToast('Field inventory loaded', 'Upload the PDF to see it while mapping.');
    }
  } catch (err) {
    alert('Could not load inventory: ' + err.message);
  }
}

async function loadSavedMapping(id) {
  const m = getMappingById(id);
  if (!m) return;
  wizardState.mappingId = m.id;
  wizardState.mappingName = m.name;
  wizardState.mappings = JSON.parse(JSON.stringify(m.fields));
  wizardState.pdfFileName = m.pdfFileName;

  const blob = await getPdfBlob(id);
  if (blob) {
    await setPdfFromBytes(blob, m.pdfFileName, m.templatePath);
    wizardState.mappings = JSON.parse(JSON.stringify(m.fields));
  } else if (m.templatePath) {
    try {
      await loadBundledTemplate(m.templatePath, m.pdfFileName);
      wizardState.mappings = JSON.parse(JSON.stringify(m.fields));
    } catch (_) { /* fields still load */ }
  }

  wizardState.extractedFields = wizardState.mappings.map((f) => ({ name: f.pdfField, type: f.pdfType }));
  setStep(2);
  showWizardToast('Mapping loaded', m.name);
}

function initWizard() {
  const active = getActiveMapping();
  if (active) {
    wizardState.mappingId = active.id;
    wizardState.mappingName = active.name;
  }
  renderWizard();
}

window.setStep = setStep;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.clearPdf = clearPdf;
window.pickTemplate = pickTemplate;
window.pickTemplateFromInventory = pickTemplateFromInventory;
window.saveCurrentMapping = saveCurrentMapping;
window.loadSavedMapping = loadSavedMapping;
window.renderSaveStep = renderSaveStep;
window.renderMapStep = renderMapStep;

function activateMapping(id) {
  setActiveMapping(id);
  renderWizard();
}
window.activateMapping = activateMapping;

document.addEventListener('DOMContentLoaded', initWizard);
