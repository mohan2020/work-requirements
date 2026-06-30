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
  selectedFieldIdx: null,
  ehrComboSearch: '',
  showSaveSummary: false,
  fieldWidgetsByName: null,
  pageHeights: [],
  pdfViewerReady: false,
  editorFocusFromPdf: false,
  placingCustomField: false,
  pendingCustomType: 'text',
  dismissedCustomIds: new Set(),
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
  wizardState.pdfViewerReady = false;
  wizardState.dismissedCustomIds = loadDismissedCustomIds(templatePath);

  wizardState.extractedFields = await extractPdfAcroFieldsFromBytes(bytes);
  wizardState.mappings = buildInitialMappings(wizardState.extractedFields);
  wizardState.mappings = enrichMappingsWithWidgets(wizardState.mappings, wizardState.fieldWidgetsByName);
  wizardState.mappings = autoSkipTinyAcroFields(wizardState.mappings);
  wizardState.mappings = mergeCustomOverlays(
    wizardState.mappings,
    wizardState.templatePath,
    wizardState.pageHeights,
    wizardState.dismissedCustomIds
  );
  wizardState.selectedFieldIdx = wizardState.mappings.findIndex((m) => m.source === 'unmapped');
  if (wizardState.selectedFieldIdx < 0) wizardState.selectedFieldIdx = 0;
  renderWizard();
}

async function extractPdfAcroFieldsFromBytes(bytes) {
  const { PDFDocument } = await loadPdfLibForMapper();
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  wizardState.fieldWidgetsByName = await PDFMapViewer.extractFieldWidgets(bytes);
  wizardState.pageHeights = wizardState.fieldWidgetsByName.pageHeights || [];
  return form.getFields().map((f) => {
    const name = f.getName();
    const type = f.constructor.name.replace('PDF', '');
    let value = '';
    try {
      if (type === 'TextField') value = form.getTextField(name).getText() || '';
      else if (type === 'CheckBox') value = form.getCheckBox(name).isChecked() ? 'Checked' : 'Unchecked';
      else if (type === 'Dropdown') value = form.getDropdown(name).getSelected()?.join(', ') || '';
      else if (type === 'RadioGroup') value = form.getRadioGroup(name).getSelected() || '';
    } catch (_) { /* non-text fields */ }
    return { name, type, value };
  });
}

function enrichMappingsWithWidgets(mappings, widgetsByName) {
  if (!widgetsByName) return mappings;
  return mappings.map((m) => {
    const w = widgetsByName.get(m.pdfField)?.[0];
    if (!w) return m;
    return { ...m, rect: w.rect, pageIndex: w.pageIndex, pageHeight: w.pageHeight };
  });
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
      pdfValue: pdf.value || '',
      source: isAdmin ? 'skip' : isSignature ? 'manual' : suggested ? 'ehr' : 'unmapped',
      ehrFieldId: isAdmin || isSignature ? null : suggested,
      manualLabel: isSignature ? 'Signature capture' : null,
      textAlign: 'left',
      fontSize: pdf.type === 'TextField' ? 8 : undefined,
    };
  });
}

function getMappingStats() {
  const total = wizardState.mappings.length;
  const mapped = wizardState.mappings.filter((m) => m.source === 'ehr' || m.source === 'manual').length;
  const skip = wizardState.mappings.filter((m) => m.source === 'skip').length;
  return { total, mapped, skip, unmapped: total - mapped - skip };
}

function refreshMapStep() {
  const host = $('#wizard-step-host');
  if (host && wizardState.step === 2) {
    wizardState.pdfViewerReady = false;
    host.innerHTML = renderMapStep();
    bindStepEvents();
  }
}

/** Update editor, field list, PDF hotspots, and progress without reloading the PDF canvas. */
function updateMapInteractiveUI() {
  if (wizardState.step !== 2) return;
  const progress = $('#map-progress-inner');
  const editor = $('#map-editor-host');
  const list = $('#map-field-list');
  const mapPane = $('.map-pane');
  if (mapPane) mapPane.classList.toggle('editor-focus', wizardState.editorFocusFromPdf);
  if (progress) progress.innerHTML = renderMapProgressInner();
  if (editor) editor.innerHTML = renderMapEditorPanel();
  if (list) list.innerHTML = renderMapFieldListItems();
  bindMapStepEvents();
  bindComboSearch();
  updatePdfHotspotsIfReady();
}

function bindComboSearch() {
  const comboSearch = $('#ehr-combo-search');
  if (!comboSearch) return;
  comboSearch.oninput = (e) => {
    wizardState.ehrComboSearch = e.target.value;
    const editor = $('#map-editor-host');
    if (editor) editor.innerHTML = renderMapEditorPanel();
    bindMapStepEvents();
    bindComboSearch();
    const input = $('#ehr-combo-search');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  };
}

function onPdfFieldSelect(idx, { fromPdf = false } = {}) {
  if (fromPdf) wizardState.editorFocusFromPdf = true;
  selectPdfField(idx, { fromPdf });
}

function selectPdfField(idx, { fromPdf = false } = {}) {
  wizardState.selectedFieldIdx = idx;
  wizardState.ehrComboSearch = '';
  if (fromPdf) wizardState.editorFocusFromPdf = true;
  updateMapInteractiveUI();
  const row = document.querySelector(`.field-list-item[data-idx="${idx}"]`);
  row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const host = $('#map-pdf-interactive-host');
  if (host && wizardState.mappings[idx]) {
    PDFMapViewer.scrollToField(host, wizardState.mappings, wizardState.mappings[idx].pdfField);
  }
}

function showAllPdfFields() {
  wizardState.editorFocusFromPdf = false;
  updateMapInteractiveUI();
}

async function ensureInteractivePdfViewer() {
  const host = $('#map-pdf-interactive-host');
  if (!host || !wizardState.pdfBytes || wizardState.step !== 2) return;

  if (wizardState.pdfViewerReady && host.querySelector('.pdf-pages-scroll')) {
    updatePdfHotspotsIfReady();
    return;
  }

  try {
    await PDFMapViewer.mount(
      host,
      wizardState.pdfBytes,
      wizardState.mappings,
      wizardState.fieldWidgetsByName || new Map(),
      wizardState.selectedFieldIdx,
      onPdfFieldSelect,
      onCustomFieldRectChange
    );
    wizardState.pdfViewerReady = true;
  } catch (err) {
    console.error('PDF viewer mount failed:', err);
    host.innerHTML = '<div class="pdf-load-error"><p>Could not render interactive PDF. Try reloading the page.</p></div>';
  }
}

function updatePdfHotspotsIfReady() {
  const host = $('#map-pdf-interactive-host');
  if (!host || !wizardState.pdfViewerReady || !wizardState.fieldWidgetsByName) return;
  PDFMapViewer.updateHotspots(
    host,
    wizardState.mappings,
    wizardState.fieldWidgetsByName,
    wizardState.selectedFieldIdx,
    onPdfFieldSelect,
    onCustomFieldRectChange
  );
  PDFMapViewer.bindDrawMode(host, wizardState.placingCustomField, handleCustomFieldPlaced);
}

function onCustomFieldRectChange(idx, rect, { live = false } = {}) {
  const m = wizardState.mappings[idx];
  if (!m?.isCustom || !rect) return;
  m.rect = {
    x: Math.round(rect.x * 10) / 10,
    y: Math.round(rect.y * 10) / 10,
    width: Math.max(8, Math.round(rect.width * 10) / 10),
    height: Math.max(8, Math.round(rect.height * 10) / 10),
  };
  syncCustomLayoutInputs(idx);
  if (live) return;
  updatePdfHotspotsIfReady();
}

function syncCustomLayoutInputs(idx) {
  const m = wizardState.mappings[idx];
  const panel = $('.custom-layout-controls');
  if (!m?.isCustom || !panel || +panel.dataset.idx !== idx) return;
  const set = (key, val) => {
    const el = panel.querySelector(`[data-layout="${key}"]`);
    if (el) el.value = val;
  };
  set('pageIndex', m.pageIndex + 1);
  set('x', Math.round(m.rect.x));
  set('y', Math.round(m.rect.y));
  set('width', Math.round(m.rect.width));
  set('height', Math.round(m.rect.height));
}

function applyFieldFormatFromPanel(idx) {
  const m = wizardState.mappings[idx];
  const panel = document.querySelector(`.field-format-controls[data-idx="${idx}"]`);
  if (!m || !panel || !fieldSupportsTextFormat(m)) return;
  const textAlign = panel.querySelector('[data-format="textAlign"]')?.value || 'left';
  const fontSize = panel.querySelector('[data-format="fontSize"]')?.value;
  m.textAlign = textAlign;
  m.fontSize = Math.min(14, Math.max(5, +fontSize || getDefaultFontSize(m.fieldType || 'text')));
  updateMapInteractiveUI();
}

function applyCustomLayoutFromPanel(idx) {
  const m = wizardState.mappings[idx];
  const panel = document.querySelector(`.custom-layout-controls[data-idx="${idx}"]`);
  if (!m?.isCustom || !panel) return;
  const pageIndex = Math.max(0, (+panel.querySelector('[data-layout="pageIndex"]')?.value || 1) - 1);
  const x = +panel.querySelector('[data-layout="x"]')?.value || 0;
  const y = +panel.querySelector('[data-layout="y"]')?.value || 0;
  const width = Math.max(8, +panel.querySelector('[data-layout="width"]')?.value || 40);
  const height = Math.max(8, +panel.querySelector('[data-layout="height"]')?.value || 16);
  m.pageIndex = Math.min(pageIndex, Math.max(0, wizardState.pageHeights.length - 1));
  m.pageHeight = wizardState.pageHeights[m.pageIndex] || 792;
  m.rect = { x, y, width, height };
  updateMapInteractiveUI();
}

function deleteCustomField(idx) {
  const m = wizardState.mappings[idx];
  if (!m?.isCustom) return;
  if (!confirm(`Delete custom field "${m.pdfField}"?`)) return;

  if (m.customId && m.customId.startsWith('pa1663.')) {
    wizardState.dismissedCustomIds.add(m.customId);
    saveDismissedCustomIds(wizardState.templatePath, wizardState.dismissedCustomIds);
  }

  wizardState.mappings.splice(idx, 1);
  if (wizardState.selectedFieldIdx > idx) {
    wizardState.selectedFieldIdx -= 1;
  } else if (wizardState.selectedFieldIdx === idx) {
    wizardState.selectedFieldIdx = Math.min(idx, wizardState.mappings.length - 1);
    if (wizardState.selectedFieldIdx < 0) wizardState.selectedFieldIdx = null;
  }
  updateMapInteractiveUI();
  showWizardToast('Custom field removed', m.pdfField);
}

function deleteAllCustomFields() {
  const custom = wizardState.mappings.filter((m) => m.isCustom);
  if (!custom.length) return;
  if (!confirm(`Remove all ${custom.length} custom overlay fields? AcroForm fields are kept.`)) return;

  custom.forEach((m) => {
    if (m.customId && m.customId.startsWith('pa1663.')) {
      wizardState.dismissedCustomIds.add(m.customId);
    }
  });
  saveDismissedCustomIds(wizardState.templatePath, wizardState.dismissedCustomIds);
  wizardState.mappings = wizardState.mappings.filter((m) => !m.isCustom);
  wizardState.selectedFieldIdx = wizardState.mappings.findIndex((m) => m.source === 'unmapped');
  if (wizardState.selectedFieldIdx < 0) wizardState.selectedFieldIdx = 0;
  updateMapInteractiveUI();
  showWizardToast('Custom fields removed', `${custom.length} overlay(s) deleted.`);
}

function toggleCustomFieldMode() {
  wizardState.placingCustomField = !wizardState.placingCustomField;
  const host = $('#map-pdf-interactive-host');
  const btn = $('#btn-add-custom-field');
  if (btn) {
    btn.classList.toggle('active', wizardState.placingCustomField);
    btn.textContent = wizardState.placingCustomField ? 'Cancel drawing' : '+ Add custom field';
  }
  if (host) PDFMapViewer.bindDrawMode(host, wizardState.placingCustomField, handleCustomFieldPlaced);
}

function handleCustomFieldPlaced({ pageIndex, pageHeight, rect }) {
  wizardState.placingCustomField = false;
  const btn = $('#btn-add-custom-field');
  if (btn) {
    btn.classList.remove('active');
    btn.textContent = '+ Add custom field';
  }

  const label = prompt(
    'Label for this custom field (shown in the field list):',
    'Custom data field'
  );
  if (label === null) return;

  const typePick = prompt(
    'Field type: text, textarea, date, or checkbox',
    wizardState.pendingCustomType || 'text'
  );
  const fieldType = (typePick || 'text').toLowerCase();
  const allowed = ['text', 'textarea', 'date', 'checkbox'];
  const safeType = allowed.includes(fieldType) ? fieldType : 'text';

  const overlay = createUserCustomOverlay({
    label,
    fieldType: safeType,
    pageIndex,
    rect,
    pageHeight,
  });
  wizardState.mappings.push(overlay);
  wizardState.selectedFieldIdx = wizardState.mappings.length - 1;
  wizardState.editorFocusFromPdf = true;
  updateMapInteractiveUI();
  showWizardToast('Custom field added', `${label} — map it to an EHR or manual source.`);
}

function getMappingTargetLabel(m) {
  if (m.source === 'ehr' && m.ehrFieldId) {
    const f = getAllEhrFields().find((x) => x.id === m.ehrFieldId);
    return f ? `${f.category}: ${f.label}` : m.ehrFieldId;
  }
  if (m.source === 'manual') return m.manualLabel || 'Manual entry';
  if (m.source === 'skip') return 'Skip (admin / metadata)';
  return 'Not mapped';
}

function renderMappingSummaryTable() {
  if (!wizardState.mappings.length) {
    return '<p style="color:var(--muted-foreground);">No fields to summarize yet.</p>';
  }
  const rows = wizardState.mappings.map((m) => {
    const status = m.source === 'unmapped' ? 'unmapped' : m.source === 'skip' ? 'skip' : 'mapped';
    const sample = m.source === 'ehr' ? resolveEhrSampleValue(m.ehrFieldId) : '—';
    return `
      <tr class="summary-row ${status}">
        <td class="mono pdf-col">${m.pdfField}</td>
        <td><span class="type-pill">${m.pdfType}</span></td>
        <td class="pdf-val">${m.pdfValue ? m.pdfValue : '<span class="muted">(empty)</span>'}</td>
        <td>${getMappingTargetLabel(m)}</td>
        <td class="sample-col">${sample}</td>
      </tr>`;
  }).join('');

  const stats = getMappingStats();
  return `
    <div class="summary-stats">
      <span><strong>${stats.mapped}</strong> mapped</span>
      <span><strong>${stats.skip}</strong> skipped</span>
      <span><strong>${stats.unmapped}</strong> remaining</span>
    </div>
    <div class="summary-table-wrap">
      <table class="summary-table">
        <thead>
          <tr>
            <th>PDF field</th>
            <th>Type</th>
            <th>PDF value</th>
            <th>Maps to</th>
            <th>Example fill</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderEhrCombobox(idx) {
  const m = wizardState.mappings[idx];
  if (!m || m.source === 'skip') return '';

  const q = wizardState.ehrComboSearch.toLowerCase();
  const options = getAllEhrFields().filter((f) =>
    !q || f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
  );

  const selected = m.source === 'ehr' && m.ehrFieldId
    ? getAllEhrFields().find((f) => f.id === m.ehrFieldId)
    : null;

  return `
    <div class="combo-wrap" id="ehr-combo">
      <label class="combo-label">Map to EHR / app field</label>
      ${selected ? `
        <div class="combo-selected">
          <span><strong>${selected.category}</strong> · ${selected.label}</span>
          <button type="button" class="combo-clear" onclick="clearEhrSelection(${idx})">Change</button>
        </div>` : `
        <input type="search" class="search-input combo-search" id="ehr-combo-search"
          placeholder="Search available fields — name, MRN, diagnosis…" value="${wizardState.ehrComboSearch}" autocomplete="off">
        <ul class="combo-list" id="ehr-combo-list">
          ${options.length ? options.map((f) => `
            <li>
              <button type="button" class="combo-option" onclick="pickEhrField(${idx}, '${f.id}')">
                <span class="opt-label">${f.label}</span>
                <span class="opt-meta mono">${f.category} · ${f.id}</span>
                <span class="opt-sample">${f.sample}</span>
              </button>
            </li>`).join('') : '<li class="combo-empty">No matching fields</li>'}
        </ul>`}
      ${m.source === 'manual' ? `
        <label class="combo-label" style="margin-top:12px;">Manual entry label</label>
        <input type="text" class="search-input" style="margin:0;max-width:none;" value="${m.manualLabel || ''}"
          placeholder="e.g. Patient signature, SSN segment 1"
          oninput="updateMapping(${idx}, 'manualLabel', this.value)">` : ''}
    </div>`;
}

function pickEhrField(idx, fieldId) {
  const m = wizardState.mappings[idx];
  if (!m) return;
  m.source = 'ehr';
  m.ehrFieldId = fieldId;
  wizardState.ehrComboSearch = '';
  updateMapInteractiveUI();
}

function clearEhrSelection(idx) {
  const m = wizardState.mappings[idx];
  if (!m) return;
  m.source = 'unmapped';
  m.ehrFieldId = null;
  wizardState.ehrComboSearch = '';
  updateMapInteractiveUI();
}

function setMappingSource(idx, source) {
  const m = wizardState.mappings[idx];
  if (!m) return;
  m.source = source;
  if (source === 'manual' && !m.manualLabel) m.manualLabel = 'Staff entry at form fill';
  if (source === 'ehr' && !m.ehrFieldId) m.ehrFieldId = null;
  if (source === 'skip') { m.ehrFieldId = null; m.manualLabel = null; }
  if (source === 'unmapped') { m.ehrFieldId = null; m.manualLabel = null; }
  updateMapInteractiveUI();
}

function updateMapping(idx, key, value) {
  const m = wizardState.mappings[idx];
  if (!m) return;
  m[key] = value;
  if (key === 'source') {
    if (value === 'ehr' && !m.ehrFieldId) m.ehrFieldId = null;
    if (value === 'manual' && !m.manualLabel) m.manualLabel = 'Staff entry at form fill';
    if (value === 'skip') { m.ehrFieldId = null; m.manualLabel = null; }
    if (value === 'unmapped') { m.ehrFieldId = null; m.manualLabel = null; }
  }
  updateMapInteractiveUI();
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
    if (m.isCustom) return;
    if (m.source !== 'ehr' && m.source !== 'manual') return;
    let value = resolveMappingPreviewValue(m);
    if (!value && m.source === 'manual') value = m.manualLabel ? `[${m.manualLabel}]` : '(manual entry)';

    if (!value || m.pdfType === 'Signature' || m.pdfType === 'Button') return;
    try {
      if (m.pdfType === 'CheckBox') {
        form.getCheckBox(m.pdfField).check();
      } else if (m.pdfType === 'TextField') {
        const tf = form.getTextField(m.pdfField);
        const { fontSize } = resolveFieldFormat(m);
        try { tf.setFontSize(fontSize); } catch (_) { /* some fields reject font changes */ }
        tf.setText(String(value).substring(0, 2000));
      } else {
        form.getTextField(m.pdfField).setText(String(value).substring(0, 2000));
      }
    } catch (err) {
      console.warn('Preview fill skip:', m.pdfField, err.message);
    }
  });

  await drawCustomOverlaysOnPdf(doc, wizardState.mappings);

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
  wizardState.showSaveSummary = true;

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
  if (wizardState.step !== 2) {
    wizardState.pdfViewerReady = false;
    PDFMapViewer.destroy($('#map-pdf-interactive-host'));
  }
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

function renderMapProgressInner() {
  const stats = getMappingStats();
  const pct = stats.total ? Math.round(((stats.mapped + stats.skip) / stats.total) * 100) : 0;
  return `
    <span><strong>${stats.mapped}</strong> mapped · <strong>${stats.skip}</strong> skipped · <strong>${stats.unmapped}</strong> remaining</span>
    <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    <span>${pct}%</span>`;
}

function renderFieldFormatControls(sel, selected) {
  if (!fieldSupportsTextFormat(selected)) return '';
  const fmt = resolveFieldFormat(selected);
  const alignOpts = TEXT_ALIGN_OPTIONS.map((o) =>
    `<option value="${o.id}"${fmt.textAlign === o.id ? ' selected' : ''}>${o.label}</option>`
  ).join('');
  return `
      <div class="field-format-controls" data-idx="${sel}">
        <span class="editor-kicker">Text formatting</span>
        <p class="format-hint">Adjust alignment and font size so sample text fits the field in preview and export.</p>
        <div class="format-grid">
          <label>Alignment
            <select data-format="textAlign">${alignOpts}</select>
          </label>
          <label>Font size (pt)
            <input type="number" data-format="fontSize" min="5" max="14" step="1" value="${fmt.fontSize}">
          </label>
        </div>
      </div>`;
}

function renderMapEditorPanel() {
  const sel = wizardState.selectedFieldIdx;
  const selected = sel !== null ? wizardState.mappings[sel] : null;

  if (!selected) {
    return `
      <div class="map-editor empty">
        <div class="empty-icon">↑</div>
        <h3>Select a PDF field</h3>
        <p>Click a field on the PDF or choose a row from the list to map it.</p>
      </div>`;
  }

  const backBtn = wizardState.editorFocusFromPdf
    ? `<button type="button" class="btn sm ghost editor-back" data-action="show-all-fields">← All PDF fields</button>`
    : '';

  const customNote = selected.isCustom
    ? `<p class="custom-field-note">Custom overlay — drag the <strong>⋮⋮</strong> grip on the PDF to move, corner handle to resize, or edit coordinates below. Type: <strong>${selected.fieldType || 'text'}</strong></p>`
    : '';

  const customLayout = selected.isCustom && selected.rect ? `
      <div class="custom-layout-controls" data-idx="${sel}">
        <span class="editor-kicker">Position &amp; size (PDF points)</span>
        <div class="layout-grid">
          <label>Page <input type="number" data-layout="pageIndex" min="1" max="${wizardState.pageHeights.length || 4}" value="${selected.pageIndex + 1}"></label>
          <label>X <input type="number" data-layout="x" step="1" value="${Math.round(selected.rect.x)}"></label>
          <label>Y <input type="number" data-layout="y" step="1" value="${Math.round(selected.rect.y)}"></label>
          <label>W <input type="number" data-layout="width" min="8" step="1" value="${Math.round(selected.rect.width)}"></label>
          <label>H <input type="number" data-layout="height" min="8" step="1" value="${Math.round(selected.rect.height)}"></label>
        </div>
        <div class="custom-actions">
          <button type="button" class="btn sm secondary" data-action="apply-layout" data-idx="${sel}">Apply coordinates</button>
          <button type="button" class="btn sm ghost danger" data-action="delete-custom" data-idx="${sel}">Delete field</button>
        </div>
      </div>` : '';

  const valueBlock = selected.isCustom
    ? `<p class="pdf-value-display muted">Custom placement at page ${selected.pageIndex + 1} — value is drawn at export time.</p>`
    : `<p class="pdf-value-display">${selected.pdfValue ? selected.pdfValue : '<span class="muted">(empty — fillable field)</span>'}</p>`;

  const previewVal = resolveMappingPreviewValue(selected);
  const previewBlock = selected.source === 'ehr' && selected.ehrFieldId ? `
        <div class="map-editor-block">
          <span class="editor-kicker">Example fill (demo patient)</span>
          <p class="pdf-value-display sample">${resolveEhrSampleValue(selected.ehrFieldId)}</p>
        </div>` : (selected.source === 'manual' && previewVal ? `
        <div class="map-editor-block">
          <span class="editor-kicker">Preview value</span>
          <p class="pdf-value-display sample">${selected.fieldType === 'checkbox' ? '✓ Checked when filled' : previewVal}</p>
        </div>` : '');

  return `
    <div class="map-editor">
      ${backBtn}
      ${customNote}
      ${customLayout}
      ${renderFieldFormatControls(sel, selected)}
      <div class="map-editor-head">
        <div>
          <span class="editor-kicker">${selected.isCustom ? 'Custom field' : 'PDF field'}</span>
          <h3 class="mono">${selected.pdfField}</h3>
        </div>
        <span class="type-pill${selected.isCustom ? ' custom' : ''}">${selected.pdfType}</span>
      </div>
      <div class="map-editor-block">
        <span class="editor-kicker">Value in PDF</span>
        ${valueBlock}
      </div>
      <div class="source-toggle">
        <button type="button" class="src-btn ${selected.source === 'ehr' ? 'active' : ''}" data-action="src" data-idx="${sel}" data-source="ehr">EHR field</button>
        <button type="button" class="src-btn ${selected.source === 'manual' ? 'active' : ''}" data-action="src" data-idx="${sel}" data-source="manual">Manual entry</button>
        <button type="button" class="src-btn ${selected.source === 'skip' ? 'active' : ''}" data-action="src" data-idx="${sel}" data-source="skip">Skip</button>
      </div>
      ${selected.source === 'skip'
        ? '<p class="skip-note">This field is admin/metadata and will not be filled from the EHR.</p>'
        : renderEhrCombobox(sel)}
      ${previewBlock}
    </div>`;
}

function renderMapFieldListItems() {
  const sel = wizardState.selectedFieldIdx;
  return wizardState.mappings.map((m, i) => {
    const status = m.source === 'unmapped' ? 'unmapped' : m.source === 'skip' ? 'skip' : 'mapped';
    const target = getMappingTargetLabel(m);
    const icon = status === 'mapped' ? '✓' : status === 'skip' ? '—' : '○';
    const customTag = m.isCustom ? '<span class="fl-custom">custom</span>' : '';
    return `
      <button type="button" class="field-list-item ${status}${sel === i ? ' active' : ''}${m.isCustom ? ' custom' : ''}" data-idx="${i}" data-action="select-field">
        <span class="fl-status">${icon}</span>
        <span class="fl-main">
          <span class="fl-name mono">${m.pdfField}${customTag}</span>
          <span class="fl-target">${target}${m.fieldType ? ` · ${m.fieldType}` : ''}</span>
        </span>
      </button>`;
  }).join('');
}

function renderMapStep() {
  if (!wizardState.mappings.length) {
    return `<div class="card card-body"><p>Upload a PDF first.</p><button class="btn primary" onclick="setStep(1)">Go to upload</button></div>`;
  }

  return `
    <div class="mapping-progress" id="map-progress-inner">${renderMapProgressInner()}</div>
    <div class="map-workspace">
      <div class="pdf-pane">
        ${wizardState.pdfUrl ? `
        <div class="pdf-viewer-wrap map-pdf-stable">
          <div class="pdf-toolbar">
            <span class="fname">${wizardState.pdfFileName}</span>
            <span class="badge green">${wizardState.extractedFields.length} acro + ${wizardState.mappings.filter((m) => m.isCustom).length} custom</span>
            <button type="button" class="btn sm secondary${wizardState.placingCustomField ? ' active' : ''}" id="btn-add-custom-field" onclick="toggleCustomFieldMode()">${wizardState.placingCustomField ? 'Cancel drawing' : '+ Add custom field'}</button>
            ${wizardState.mappings.some((m) => m.isCustom) ? `<button type="button" class="btn sm ghost danger" onclick="deleteAllCustomFields()">Remove all custom</button>` : ''}
          </div>
          <div id="map-pdf-interactive-host" class="pdf-interactive-host${wizardState.placingCustomField ? ' draw-mode' : ''}"></div>
          <p class="pdf-pane-hint">${wizardState.placingCustomField ? 'Drag on the PDF to place a new custom field.' : 'Custom fields (purple): drag ⋮⋮ to move, corner handle to resize. Select one to delete or fine-tune coordinates.'}</p>
        </div>` : `
        <div class="card card-body pdf-placeholder">
          <p>No PDF preview loaded.</p>
          <button type="button" class="btn secondary" onclick="setStep(1)">Upload PDF</button>
        </div>`}
      </div>
      <div class="map-pane${wizardState.editorFocusFromPdf ? ' editor-focus' : ''}">
        <div class="field-list-panel field-list-primary">
          <div class="field-list-head">
            <span>PDF fields — click to map</span>
            <span class="field-list-count">${wizardState.mappings.length} total</span>
          </div>
          <div class="field-list" id="map-field-list">${renderMapFieldListItems()}</div>
        </div>
        <div id="map-editor-host">${renderMapEditorPanel()}</div>
      </div>
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
      <div class="card-head"><h3>Save this mapping</h3><p>Review all field mappings, then save with version history</p></div>
      <div class="card-body">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:20px;">
          <div style="flex:1;min-width:240px;">
            <label style="font-size:12px;font-weight:600;color:var(--muted-foreground);display:block;margin-bottom:6px;">Mapping name</label>
            <input type="text" id="mapping-name-input" class="search-input" style="margin:0;max-width:none;"
              value="${wizardState.mappingName || wizardState.pdfFileName || ''}" placeholder="e.g. PA 1663 — Employability Assessment">
          </div>
          <button type="button" class="btn primary" onclick="saveCurrentMapping()">Save mapping</button>
        </div>
        ${wizardState.showSaveSummary ? '<div class="save-success-banner">Mapping saved — summary below reflects the active configuration.</div>' : ''}
        ${renderMappingSummaryTable()}
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

  const comboSearch = $('#ehr-combo-search');
  if (comboSearch) bindComboSearch();

  bindMapStepEvents();

  if (wizardState.step === 2 && wizardState.pdfBytes) {
    ensureInteractivePdfViewer();
  }

  const genBtn = $('#btn-gen-preview');
  if (genBtn) genBtn.onclick = runPreview;
}

function bindMapStepEvents() {
  const editorHost = $('#map-editor-host');
  if (editorHost && !editorHost.dataset.bound) {
    editorHost.dataset.bound = '1';
    editorHost.addEventListener('click', (e) => {
      const srcBtn = e.target.closest('[data-action="src"]');
      if (srcBtn) {
        e.preventDefault();
        setMappingSource(+srcBtn.dataset.idx, srcBtn.dataset.source);
        return;
      }
      const backBtn = e.target.closest('[data-action="show-all-fields"]');
      if (backBtn) {
        e.preventDefault();
        showAllPdfFields();
        return;
      }
      const delBtn = e.target.closest('[data-action="delete-custom"]');
      if (delBtn) {
        e.preventDefault();
        deleteCustomField(+delBtn.dataset.idx);
        return;
      }
      const applyBtn = e.target.closest('[data-action="apply-layout"]');
      if (applyBtn) {
        e.preventDefault();
        applyCustomLayoutFromPanel(+applyBtn.dataset.idx);
      }
    });
    editorHost.addEventListener('change', (e) => {
      const formatInput = e.target.closest('[data-format]');
      if (formatInput) {
        const panel = formatInput.closest('.field-format-controls');
        if (panel) applyFieldFormatFromPanel(+panel.dataset.idx);
        return;
      }
      const input = e.target.closest('[data-layout]');
      if (!input) return;
      const panel = input.closest('.custom-layout-controls');
      if (!panel) return;
      applyCustomLayoutFromPanel(+panel.dataset.idx);
    });
  }

  const list = $('#map-field-list');
  if (list && !list.dataset.bound) {
    list.dataset.bound = '1';
    list.addEventListener('click', (e) => {
      const row = e.target.closest('[data-action="select-field"]');
      if (row) {
        e.preventDefault();
        selectPdfField(+row.dataset.idx);
      }
    });
  }
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
  wizardState.fieldWidgetsByName = null;
  wizardState.pdfViewerReady = false;
  wizardState.editorFocusFromPdf = false;
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
      wizardState.extractedFields = (pa1663?.fields || []).map((f) => ({
        name: f.name,
        type: f.type.replace('Field', ''),
        value: '',
      }));
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

window.pickEhrField = pickEhrField;
window.clearEhrSelection = clearEhrSelection;
window.setMappingSource = setMappingSource;
window.selectPdfField = selectPdfField;
window.showAllPdfFields = showAllPdfFields;
window.toggleCustomFieldMode = toggleCustomFieldMode;
window.deleteCustomField = deleteCustomField;
window.deleteAllCustomFields = deleteAllCustomFields;
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
