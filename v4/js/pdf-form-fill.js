/**
 * Fill official DHS PDF templates from wizard mappings + live patient EHR data.
 * Used by the staff drawer, FHIR workspace, and PDF export — not HTML questionnaires.
 */
let formsManifestCache = null;

async function loadFormsManifestCached() {
  if (formsManifestCache) return formsManifestCache;
  try {
    const res = await fetch('assets/forms-manifest.json');
    if (res.ok) formsManifestCache = await res.json();
  } catch (_) {
    /* offline / file:// */
  }
  formsManifestCache = formsManifestCache || { forms: [] };
  return formsManifestCache;
}

function getManifestFormEntry(formId) {
  const fromOfficial = typeof OFFICIAL_FORMS !== 'undefined' ? OFFICIAL_FORMS[formId] : null;
  const manifest = formsManifestCache?.forms?.find((f) => f.schemaId === formId || f.id === formId);
  return {
    formId,
    templatePath: manifest?.templatePath || fromOfficial?.templatePath || null,
    title: manifest?.title || FORM_SCHEMAS?.[formId]?.title || formId,
    status: manifest?.status || fromOfficial?.status || 'unknown',
  };
}

function mappingMatchesForm(mapping, formId) {
  if (!mapping) return false;
  const entry = getManifestFormEntry(formId);
  if (!entry.templatePath) return false;
  if (mapping.templatePath && mapping.templatePath === entry.templatePath) return true;
  if (mapping.pdfFileName && entry.templatePath.includes(mapping.pdfFileName.replace(/\.pdf$/i, ''))) return true;
  return formId === 'PA_1663' && (mapping.pdfFileName || '').includes('1663');
}

function getWizardMappingForForm(formId) {
  if (typeof getActiveMapping !== 'function') return null;
  const active = getActiveMapping();
  if (active && mappingMatchesForm(active, formId)) return active;
  if (typeof getAllMappings === 'function') {
    const store = getAllMappings();
    const match = store.items?.find((m) => mappingMatchesForm(m, formId));
    if (match) return match;
  }
  return null;
}

function hasWizardMappingForForm(formId) {
  const mapping = getWizardMappingForForm(formId);
  if (!mapping?.fields?.length) return false;
  return mapping.fields.some((m) => m.source === 'ehr' || m.source === 'manual');
}

function shouldUseOfficialPdfViewer(formId) {
  const entry = getManifestFormEntry(formId);
  if (!entry.templatePath) return false;
  if (formId === 'PA_1663') return true;
  return hasWizardMappingForForm(formId);
}

async function loadOfficialTemplateBytes(formId) {
  await loadFormsManifestCached();
  const entry = getManifestFormEntry(formId);
  if (!entry.templatePath) return null;

  const wizardMapping = getWizardMappingForForm(formId);
  if (wizardMapping?.id && typeof getPdfBlob === 'function') {
    const stored = await getPdfBlob(wizardMapping.id);
    if (stored) return stored;
  }

  const res = await fetch(entry.templatePath);
  if (!res.ok) throw new Error(`Could not load official template: ${entry.templatePath}`);
  return res.arrayBuffer();
}

const SKIP_ACRO_PDF_FIELDS = new Set([
  'CO', 'RECORD NUMBER', 'CAT', 'CSLD', 'DIST', 'RECORD NAME', 'WORKER', 'RETURN TO:', 'RESET',
]);

function getAcroFieldStore(patientId, formId) {
  if (typeof getFormState !== 'function') return {};
  const state = getFormState(patientId, formId);
  if (!state._acroFields) state._acroFields = {};
  return state._acroFields;
}

function saveAcroFieldValue(patientId, formId, pdfField, value) {
  if (!pdfField) return;
  getAcroFieldStore(patientId, formId)[pdfField] = value;
}

function getLegacyPdfFieldValue(pdfFieldName, patient, formId) {
  if (formId !== 'PA_1663' || typeof buildPA1663FieldValues !== 'function') return '';
  const values = buildPA1663FieldValues(patient, getFormState(patient.id, formId));
  return values[pdfFieldName] ?? '';
}

function resolveAcroFieldValue(pdfFieldName, mapping, patient, formId) {
  const stored = getAcroFieldStore(patient.id, formId)[pdfFieldName];
  if (stored !== undefined && stored !== null && String(stored).trim() !== '') return stored;
  if (mapping) {
    const mapped = resolveMappingPatientValue(mapping, patient, formId);
    if (mapped !== undefined && mapped !== null && String(mapped).trim() !== '') return mapped;
  }
  return getLegacyPdfFieldValue(pdfFieldName, patient, formId);
}

function applyPageHeightsToMappings(mappings, pageHeights) {
  if (!pageHeights?.length) return mappings;
  return mappings.map((m) => {
    if (m.pageIndex == null || !pageHeights[m.pageIndex]) return m;
    return { ...m, pageHeight: pageHeights[m.pageIndex] };
  });
}

function getCustomFieldStore(patientId, formId) {
  if (typeof getFormState !== 'function') return {};
  const state = getFormState(patientId, formId);
  if (!state._customFields) state._customFields = {};
  return state._customFields;
}

function getCustomFieldValue(patientId, formId, key) {
  if (!key) return undefined;
  return getCustomFieldStore(patientId, formId)[key];
}

function saveCustomFieldValue(patientId, formId, key, value) {
  if (!key) return;
  getCustomFieldStore(patientId, formId)[key] = value;
}

function customFieldKey(mapping) {
  return mapping.customId || mapping.pdfField;
}

function enrichMappingsWithWidgets(mappings, widgetsByName, pageHeights = []) {
  if (!widgetsByName) return mappings;
  return mappings.map((m) => {
    const pageHeight = m.pageIndex != null && pageHeights[m.pageIndex]
      ? pageHeights[m.pageIndex]
      : m.pageHeight;
    if (m.isCustom && m.rect) {
      return pageHeight ? { ...m, pageHeight } : m;
    }
    const w = widgetsByName.get(m.pdfField)?.[0];
    if (!w) return pageHeight ? { ...m, pageHeight } : m;
    return { ...m, rect: w.rect, pageIndex: w.pageIndex, pageHeight: w.pageHeight || pageHeight };
  });
}

async function getResolvedMappingsForForm(formId) {
  await loadFormsManifestCached();
  const entry = getManifestFormEntry(formId);
  const templatePath = entry.templatePath;
  if (!templatePath) return [];

  const wizard = getWizardMappingForForm(formId);
  let mappings = wizard?.fields?.length
    ? JSON.parse(JSON.stringify(wizard.fields))
    : [];

  /* Saved wizard rows may lack geometry — restore from bundled template defs by customId/pdfField */
  if (templatePath && typeof getCustomOverlaysForTemplate === 'function') {
    const templateDefs = getCustomOverlaysForTemplate(templatePath);
    const byCustomId = new Map(templateDefs.map((d) => [d.customId, d]));
    const byPdfField = new Map(templateDefs.map((d) => [d.pdfField, d]));
    mappings = mappings.map((m) => {
      if (!m.isCustom || m.rect) return m;
      const def = (m.customId && byCustomId.get(m.customId)) || byPdfField.get(m.pdfField);
      if (!def) return m;
      return {
        ...m,
        pageIndex: m.pageIndex ?? def.pageIndex,
        rect: m.rect || { ...def.rect },
        fieldType: m.fieldType || def.fieldType,
        pageHeight: m.pageHeight,
      };
    });
  }

  let pageHeights = [];
  let widgetsByName = null;
  try {
    const bytes = await loadOfficialTemplateBytes(formId);
    if (bytes && window.PDFMapViewer?.extractFieldWidgets) {
      widgetsByName = await PDFMapViewer.extractFieldWidgets(bytes);
      pageHeights = widgetsByName.pageHeights || [];
      mappings = enrichMappingsWithWidgets(mappings, widgetsByName, pageHeights);
    }
  } catch (err) {
    console.warn('Could not enrich mappings from PDF widgets', err);
  }

  if (typeof mergeCustomOverlays === 'function') {
    const dismissed = typeof loadDismissedCustomIds === 'function'
      ? loadDismissedCustomIds(templatePath)
      : new Set();
    mappings = mergeCustomOverlays(mappings, templatePath, pageHeights, dismissed);
  }

  mappings = applyPageHeightsToMappings(mappings, pageHeights);

  return mappings;
}

/** All interactive AcroForm widgets to render on the official PDF (mapped + manual). */
function getViewerAcroFieldEntries(mappings, widgetsByName) {
  const entries = [];
  const seen = new Set();

  mappings.filter((m) => !m.isCustom && m.source !== 'skip').forEach((m) => {
    const widgets = widgetsByName?.get(m.pdfField) || [];
    const widget = widgets[0];
    if (!widget?.rect) return;
    seen.add(m.pdfField);
    entries.push({
      ...m,
      pageIndex: m.pageIndex ?? widget.pageIndex,
      rect: m.rect || widget.rect,
      pageHeight: m.pageHeight || widget.pageHeight,
      pdfType: m.pdfType || widget.type,
    });
  });

  if (widgetsByName) {
    widgetsByName.forEach((widgets, name) => {
      if (seen.has(name) || SKIP_ACRO_PDF_FIELDS.has(name)) return;
      const widget = widgets[0];
      if (!widget?.rect || widget.type === 'Button') return;
      entries.push({
        pdfField: name,
        pdfType: widget.type,
        source: 'manual',
        pageIndex: widget.pageIndex,
        rect: widget.rect,
        pageHeight: widget.pageHeight,
        isCustom: false,
      });
    });
  }

  return entries;
}

function resolveMappingPatientValue(mapping, patient, formId) {
  if (!mapping || mapping.source === 'skip') return '';

  const fieldKey = customFieldKey(mapping);
  const stored = patient?.id ? getCustomFieldValue(patient.id, formId, fieldKey) : undefined;
  if (stored !== undefined && stored !== null && String(stored).trim() !== '') {
    return stored;
  }

  if (mapping.source === 'unmapped') return '';
  if (mapping.source === 'ehr' && mapping.ehrFieldId) {
    return resolveEhrPatientValue(mapping.ehrFieldId, patient, formId) || '';
  }
  if (mapping.source === 'manual') return '';
  return '';
}

function getMappingsForFill(formId) {
  const wizard = getWizardMappingForForm(formId);
  if (wizard?.fields?.length) return wizard.fields;
  return null;
}

async function getMappingsForFillAsync(formId) {
  return getResolvedMappingsForForm(formId);
}

function fillAcroFormFromMappings(form, mappings, patient, formId) {
  const acroStore = getAcroFieldStore(patient.id, formId);
  const allNames = new Set([
    ...mappings.filter((m) => !m.isCustom && m.source !== 'skip').map((m) => m.pdfField),
    ...Object.keys(acroStore),
  ]);

  allNames.forEach((pdfFieldName) => {
    if (SKIP_ACRO_PDF_FIELDS.has(pdfFieldName)) return;
    const mapping = mappings.find((m) => m.pdfField === pdfFieldName);
    let value = acroStore[pdfFieldName];
    if (value === undefined || value === null || String(value).trim() === '') {
      value = resolveAcroFieldValue(pdfFieldName, mapping, patient, formId);
    }
    if (value === undefined || value === null || String(value).trim() === '') return;

    const pdfType = mapping?.pdfType;
    if (pdfType === 'Signature' || pdfType === 'Button') return;

    try {
      if (pdfType === 'CheckBox') {
        if (value === true || value === 'true' || value === 'Yes' || value === '1' || value === 'Checked') {
          form.getCheckBox(pdfFieldName).check();
        }
      } else {
        const tf = form.getTextField(pdfFieldName);
        const fmt = mapping && typeof resolveFieldFormat === 'function' ? resolveFieldFormat(mapping) : { fontSize: 8 };
        try { tf.setFontSize(fmt.fontSize); } catch (_) { /* some fields reject font changes */ }
        tf.setText(String(value).substring(0, 2000));
      }
    } catch (err) {
      console.warn('Official PDF fill skip:', pdfFieldName, err.message);
    }
  });
}

async function fillLegacyPA1663(doc, patientId) {
  const patient = patientRegistry.find((p) => p.id === patientId);
  if (!patient || typeof buildPA1663FieldValues !== 'function') return;
  const form = doc.getForm();
  const state = getFormState(patientId, 'PA_1663');
  const values = buildPA1663FieldValues(patient, state);
  Object.entries(values).forEach(([fieldName, value]) => {
    if (typeof safeSetTextField === 'function') safeSetTextField(form, fieldName, value);
  });
}

async function buildFilledOfficialPdf(patientId, formId, options = {}) {
  const { flatten = false, drawCustomOnPdf = true } = options;
  const patient = patientRegistry.find((p) => p.id === patientId);
  if (!patient) throw new Error('Patient not found');

  await loadFormsManifestCached();
  const templateBytes = await loadOfficialTemplateBytes(formId);
  if (!templateBytes) throw new Error('No official PDF template for this form');

  const PDFLib = typeof loadPdfLibForMapper === 'function'
    ? await loadPdfLibForMapper()
    : await loadPdfLib();
  const { PDFDocument, StandardFonts } = PDFLib;
  const doc = await PDFDocument.load(templateBytes.slice(0));
  const form = doc.getForm();

  const mappings = await getResolvedMappingsForForm(formId);
  const hasMappedAcro = mappings.some((m) => !m.isCustom && m.source !== 'skip')
    || Object.keys(getAcroFieldStore(patientId, formId)).length > 0;

  if (hasMappedAcro || formId === 'PA_1663') {
    fillAcroFormFromMappings(form, mappings, patient, formId);
  }

  if (drawCustomOnPdf && typeof drawCustomOverlaysOnPdf === 'function' && mappings.some((m) => m.isCustom)) {
    const prevPreview = window.resolveMappingPreviewValue;
    window.resolveMappingPreviewValue = (m) => resolveMappingPatientValue(m, patient, formId);
    try {
      await drawCustomOverlaysOnPdf(doc, mappings);
    } finally {
      window.resolveMappingPreviewValue = prevPreview;
    }
  }

  if (patient.signatureDataUrl && formId === 'PA_1663') {
    try {
      const pngBytes = await fetch(patient.signatureDataUrl).then((r) => r.arrayBuffer());
      const png = await doc.embedPng(pngBytes);
      const pages = doc.getPages();
      const page = pages[pages.length - 1];
      page.drawImage(png, { x: 120, y: 80, width: 140, height: 40 });
    } catch (err) {
      console.warn('Could not embed patient signature on official PDF', err);
    }
  }

  try {
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    form.updateFieldAppearances(helvetica);
  } catch (_) {
    /* optional */
  }

  if (flatten) form.flatten();
  return doc.save();
}

function getOfficialPdfCompletion(patientId, formId) {
  const patient = patientRegistry.find((p) => p.id === patientId);
  const mappings = getMappingsForFill(formId);
  if (!mappings?.length) {
    return typeof getFormCompletion === 'function'
      ? getFormCompletion(patientId, formId)
      : { filled: 0, total: 0, percent: 0 };
  }

  const mappable = mappings.filter((m) => m.source === 'ehr' || (m.isCustom && m.source !== 'skip'));
  const manual = mappings.filter((m) => m.source === 'manual' && m.pdfType !== 'Signature' && !m.isCustom);
  const total = mappable.length + manual.length;
  let filled = 0;

  mappable.forEach((m) => {
    const val = resolveMappingPatientValue(m, patient, formId);
    if (val !== undefined && val !== null && String(val).trim() !== '') filled += 1;
  });

  mappable.forEach((m) => {
    if (m.source === 'manual' && m.isCustom) {
      const val = getCustomFieldValue(patientId, formId, customFieldKey(m));
      if (val !== undefined && val !== null && String(val).trim() !== '') filled += 1;
    }
  });

  return {
    filled,
    total: total || mappable.length,
    percent: total ? Math.round((filled / total) * 100) : (mappable.length ? Math.round((filled / mappable.length) * 100) : 0),
    prefilledFromEhr: filled,
    manualRemaining: manual.length + mappable.filter((m) => m.isCustom && m.source === 'manual').length,
  };
}

async function getOfficialPdfCompletionAsync(patientId, formId) {
  const patient = patientRegistry.find((p) => p.id === patientId);
  const mappings = await getResolvedMappingsForForm(formId);
  if (!mappings.length) {
    return typeof getFormCompletion === 'function'
      ? getFormCompletion(patientId, formId)
      : { filled: 0, total: 0, percent: 0, customFieldCount: 0 };
  }

  const trackable = mappings.filter((m) => {
    if (m.source === 'skip') return false;
    if (m.isCustom) return true;
    return m.source === 'ehr' || (m.source === 'manual' && m.pdfType !== 'Signature');
  });

  let filled = 0;
  trackable.forEach((m) => {
    const val = resolveMappingPatientValue(m, patient, formId);
    if (m.fieldType === 'checkbox' || m.pdfType === 'CheckBox') {
      if (val) filled += 1;
    } else if (val !== undefined && val !== null && String(val).trim() !== '') {
      filled += 1;
    }
  });

  const customFieldCount = mappings.filter((m) => m.isCustom && m.source !== 'skip').length;
  const total = trackable.length;

  return {
    filled,
    total: total || 1,
    percent: total ? Math.round((filled / total) * 100) : 0,
    prefilledFromEhr: filled,
    manualRemaining: trackable.filter((m) => m.source === 'manual' || m.source === 'unmapped').length,
    customFieldCount,
  };
}

window.loadFormsManifestCached = loadFormsManifestCached;
window.getManifestFormEntry = getManifestFormEntry;
window.getWizardMappingForForm = getWizardMappingForForm;
window.hasWizardMappingForForm = hasWizardMappingForForm;
window.shouldUseOfficialPdfViewer = shouldUseOfficialPdfViewer;
window.buildFilledOfficialPdf = buildFilledOfficialPdf;
window.getOfficialPdfCompletion = getOfficialPdfCompletion;
window.getOfficialPdfCompletionAsync = getOfficialPdfCompletionAsync;
window.getResolvedMappingsForForm = getResolvedMappingsForForm;
window.getMappingsForFillAsync = getMappingsForFillAsync;
window.resolveMappingPatientValue = resolveMappingPatientValue;
window.getCustomFieldValue = getCustomFieldValue;
window.saveCustomFieldValue = saveCustomFieldValue;
window.customFieldKey = customFieldKey;
window.getAcroFieldStore = getAcroFieldStore;
window.saveAcroFieldValue = saveAcroFieldValue;
window.resolveAcroFieldValue = resolveAcroFieldValue;
window.getViewerAcroFieldEntries = getViewerAcroFieldEntries;
window.SKIP_ACRO_PDF_FIELDS = SKIP_ACRO_PDF_FIELDS;
