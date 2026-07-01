/**
 * Official PDF form viewer — fit-to-width PDF.js background + aligned field overlays.
 * AcroForm widgets (SSN, ZIP, signatures, etc.) and custom wizard overlays share one coordinate scale.
 */
const officialPdfViewerState = {
  patientId: null,
  formId: null,
  hostEl: null,
  scale: 1,
  mountGen: 0,
};

function unmountOfficialPdfViewer() {
  const host = officialPdfViewerState.hostEl;
  if (host && window.PDFMapViewer?.destroy) {
    PDFMapViewer.destroy(host.querySelector('#official-pdf-canvas-host'));
  }
  officialPdfViewerState.patientId = null;
  officialPdfViewerState.formId = null;
  officialPdfViewerState.hostEl = null;
  officialPdfViewerState.scale = 1;
}

function fieldCss(mapping, scale) {
  const pageHeight = mapping.pageHeight || 792;
  return PDFMapViewer.rectToCss(mapping.rect, pageHeight, scale);
}

function buildOverlayEditor(mapping, patientId, formId, patient, scale, options = {}) {
  const { isCustom = false } = options;
  if (!mapping?.rect) return null;

  const pageHeight = mapping.pageHeight || 792;
  const css = PDFMapViewer.rectToCss(mapping.rect, pageHeight, scale);
  const isCheck = mapping.fieldType === 'checkbox' || mapping.pdfType === 'CheckBox';
  const isSignature = mapping.pdfType === 'Signature';
  const fmt = typeof resolveFieldFormat === 'function' ? resolveFieldFormat(mapping) : { fontSize: 8, textAlign: 'left' };

  const prefilled = isCustom
    ? resolveMappingPatientValue(mapping, patient, formId)
    : resolveAcroFieldValue(mapping.pdfField, mapping, patient, formId);

  const wrap = document.createElement('div');
  wrap.className = [
    'official-form-field',
    isCustom ? 'custom' : 'acro',
    isCheck ? 'check' : '',
    mapping.fieldType === 'textarea' ? 'textarea' : '',
    isSignature ? 'signature' : '',
  ].filter(Boolean).join(' ');
  wrap.title = mapping.pdfField || mapping.label || 'Form field';
  wrap.dataset.fieldName = mapping.pdfField || '';
  Object.assign(wrap.style, css);

  const persist = (value) => {
    if (isCustom) {
      saveCustomFieldValue(patientId, formId, customFieldKey(mapping), value);
    } else {
      saveAcroFieldValue(patientId, formId, mapping.pdfField, value);
    }
    updateOfficialPdfProgress(patientId, formId);
  };

  if (isCheck) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!prefilled;
    input.addEventListener('change', () => persist(input.checked));
    wrap.appendChild(input);
    return wrap;
  }

  if (isSignature) {
    const sigUrl = typeof resolveCapturedSignatureForPdfField === 'function'
      ? resolveCapturedSignatureForPdfField(patientId, formId, mapping.pdfField)
      : null;
    if (sigUrl) {
      const img = document.createElement('img');
      img.src = sigUrl;
      img.alt = 'Captured signature';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
      img.style.background = '#fff';
      wrap.appendChild(img);
      return wrap;
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.value = prefilled || '';
    input.placeholder = 'Sign here';
    input.style.fontSize = `${Math.max(7, fmt.fontSize)}px`;
    input.addEventListener('input', () => persist(input.value));
    wrap.appendChild(input);
    return wrap;
  }

  if (mapping.fieldType === 'textarea' || (mapping.rect.height > 28 && !isCustom && mapping.pdfType === 'TextField' && mapping.rect.width > 120)) {
    const ta = document.createElement('textarea');
    ta.value = prefilled || '';
    ta.placeholder = mapping.manualLabel || '';
    ta.style.fontSize = `${Math.max(7, fmt.fontSize)}px`;
    ta.style.textAlign = fmt.textAlign || 'left';
    ta.addEventListener('input', () => persist(ta.value));
    wrap.appendChild(ta);
    return wrap;
  }

  const input = document.createElement('input');
  input.type = mapping.fieldType === 'date' ? 'date' : 'text';
  input.value = prefilled || '';
  input.placeholder = mapping.manualLabel || '';
  input.style.fontSize = `${Math.max(6, Math.min(fmt.fontSize, mapping.rect.height * scale * 0.75))}px`;
  input.style.textAlign = fmt.textAlign || 'left';
  input.addEventListener('input', () => persist(input.value));
  wrap.appendChild(input);
  return wrap;
}

function mountFormFieldOverlays(canvasHost, mappings, acroEntries, patientId, formId, patient, scale) {
  if (!canvasHost) return { acro: 0, custom: 0 };

  let acroCount = 0;
  let customCount = 0;

  acroEntries.forEach((mapping) => {
    const layer = canvasHost.querySelector(`.official-form-layer[data-page="${mapping.pageIndex}"]`);
    if (!layer) return;
    const el = buildOverlayEditor(mapping, patientId, formId, patient, scale, { isCustom: false });
    if (el) {
      layer.appendChild(el);
      acroCount += 1;
    }
  });

  mappings.filter((m) => m.isCustom && m.source !== 'skip' && m.rect).forEach((mapping) => {
    const layer = canvasHost.querySelector(`.official-form-layer[data-page="${mapping.pageIndex}"]`);
    if (!layer) return;
    const el = buildOverlayEditor(mapping, patientId, formId, patient, scale, { isCustom: true });
    if (el) {
      layer.appendChild(el);
      customCount += 1;
    }
  });

  return { acro: acroCount, custom: customCount };
}

async function updateOfficialPdfProgress(patientId, formId) {
  const progress = document.querySelector('.staff-form-progress');
  if (!progress || typeof getOfficialPdfCompletionAsync !== 'function') return;
  const completion = await getOfficialPdfCompletionAsync(patientId, formId);
  progress.innerHTML = `
    <span><strong>${completion.filled}</strong> of <strong>${completion.total}</strong> fields complete</span>
    <div class="bar"><div class="bar-fill" style="width:${completion.percent}%"></div></div>
    <span>${completion.percent}%</span>`;
}

async function mountOfficialPdfViewer(hostEl, patientId, formId) {
  if (!hostEl) return;
  const mountGen = ++officialPdfViewerState.mountGen;
  unmountOfficialPdfViewer();
  officialPdfViewerState.hostEl = hostEl;
  officialPdfViewerState.mountGen = mountGen;

  hostEl.innerHTML = '<div class="official-pdf-loading"><span>Loading official form…</span></div>';

  try {
    await loadFormsManifestCached();
    if (mountGen !== officialPdfViewerState.mountGen) return;

    const patient = patientRegistry.find((p) => p.id === patientId);
    if (!patient) throw new Error('Patient not found');

    const templateBytes = await loadOfficialTemplateBytes(formId);
    if (mountGen !== officialPdfViewerState.mountGen) return;

    const mappings = await getResolvedMappingsForForm(formId);
    if (mountGen !== officialPdfViewerState.mountGen) return;

    const widgetsByName = await PDFMapViewer.extractFieldWidgets(templateBytes);
    const acroEntries = getViewerAcroFieldEntries(mappings, widgetsByName);
    const customCount = mappings.filter((m) => m.isCustom && m.source !== 'skip').length;
    const entry = getManifestFormEntry(formId);
    const completion = await getOfficialPdfCompletionAsync(patientId, formId);
    const mappingNote = hasWizardMappingForForm(formId)
      ? 'Positions from Form mapping wizard.'
      : 'Default field map — save mapping in Form mapping to customize.';

    hostEl.innerHTML = `
      <div class="official-pdf-shell">
        <div class="official-pdf-toolbar">
          <div class="official-pdf-meta">
            <span class="official-pdf-badge">Official DHS PDF</span>
            <span class="official-pdf-title">${entry.title}</span>
            <span class="official-pdf-custom-count">${acroEntries.length} PDF · ${customCount} custom</span>
          </div>
          <div class="official-pdf-toolbar-actions">
            <button type="button" class="staff-btn-secondary official-pdf-btn" onclick="downloadFilledOfficialPdf('${patientId}','${formId}')">
              ${typeof staffIcon === 'function' ? staffIcon('download', 14) : ''} Download PDF
            </button>
          </div>
        </div>
        <div class="official-pdf-canvas-host" id="official-pdf-canvas-host"></div>
        <p class="official-pdf-hint">
          White boxes are official PDF fields (SSN, ZIP, signatures, etc.). Purple boxes are custom positioned fields
          (Employability, examination results, etc.). Scroll vertically through all pages. ${mappingNote}
        </p>
      </div>`;

    const canvasHost = hostEl.querySelector('#official-pdf-canvas-host');
    const { scale } = await PDFMapViewer.mountPagesAtScale(canvasHost, templateBytes, 'fit-width');
    if (mountGen !== officialPdfViewerState.mountGen) return;

    officialPdfViewerState.scale = scale;

    const mounted = mountFormFieldOverlays(canvasHost, mappings, acroEntries, patientId, formId, patient, scale);
    if (mountGen !== officialPdfViewerState.mountGen) return;

    officialPdfViewerState.patientId = patientId;
    officialPdfViewerState.formId = formId;

    if (canvasHost) canvasHost.scrollTop = 0;

    const progress = document.querySelector('.staff-form-progress');
    if (progress) {
      progress.innerHTML = `
        <span><strong>${completion.filled}</strong> of <strong>${completion.total}</strong> fields complete</span>
        <div class="bar"><div class="bar-fill" style="width:${completion.percent}%"></div></div>
        <span>${completion.percent}%</span>`;
    }

    if (window.lucide) lucide.createIcons();

    if (mounted.custom === 0 && customCount > 0) {
      const hint = hostEl.querySelector('.official-pdf-hint');
      if (hint) hint.innerHTML += ' <em>Custom fields missing coordinates — re-save in Form mapping wizard.</em>';
    }
  } catch (err) {
    console.error('Official PDF viewer failed', err);
    hostEl.innerHTML = `
      <div class="official-pdf-error">
        <p><strong>Could not load official PDF</strong></p>
        <p>${err.message || 'Template missing or blocked — serve over HTTP (not file://).'}</p>
      </div>`;
  }
}

function openOfficialPdfInNewTab() {
  const pid = officialPdfViewerState.patientId;
  const fid = officialPdfViewerState.formId;
  if (pid && fid) downloadFilledOfficialPdf(pid, fid);
}

async function refreshOfficialPdfViewer(patientId, formId) {
  const host = document.getElementById('staff-official-pdf-host')
    || document.getElementById('fhir-official-pdf-host');
  if (!host) return;
  await mountOfficialPdfViewer(host, patientId, formId);
}

window.unmountOfficialPdfViewer = unmountOfficialPdfViewer;
window.mountOfficialPdfViewer = mountOfficialPdfViewer;
window.openOfficialPdfInNewTab = openOfficialPdfInNewTab;
window.refreshOfficialPdfViewer = refreshOfficialPdfViewer;
