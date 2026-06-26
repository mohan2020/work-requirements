/**
 * Registry of app questionnaire fields → official PDF AcroForm field names.
 * Used by form-mapping.html for one-time mapping review and by pdf-export for fill.
 */
const FORM_PDF_MAPPINGS = {
  PA_1663: {
    /** App field id → PDF AcroForm name */
    appToPdf: typeof PA_1663_PDF_FIELDS !== 'undefined' ? PA_1663_PDF_FIELDS : {},
    /** PDF fields filled at export but not tied to a questionnaire input */
    systemPdfFields: {
      DATE: 'Auto: patient signature date (today)',
      DATE_2: 'Auto: patient section date',
      DATE_5: 'Auto: provider exam date',
      CITY: 'Derived at export (default Philadelphia)',
      STATE: 'Derived at export (default PA)',
      'ZIP CODE': 'Derived from address when available',
    },
    /** PDF fields expected to be filled manually (not in EHR) */
    manualPdfFields: {
      'SSN 1': 'Patient SSN — manual / CAO record',
      'SSN 2': 'Patient SSN — manual / CAO record',
      'SSN 3': 'Patient SSN — manual / CAO record',
      'SIGNATURE PUBLIC ASSISTANCE APPLICANTRECIPIENT': 'Patient wet signature',
      SIGNATURE: 'Provider wet signature (or EHR digital overlay)',
      RESET: 'PDF form reset button — not data',
    },
    /** DHS admin/metadata fields on the official form — skip in gap analysis */
    skipPdfFields: ['CO', 'RECORD NUMBER', 'CAT', 'CSLD', 'DIST', 'RECORD NAME', 'WORKER', 'RETURN TO:', 'RESET'],
  },
  PA_MF: {
    appToPdf: {},
    systemPdfFields: {},
    manualPdfFields: {},
    skipPdfFields: [],
  },
};

function getSchemaAppFields(schemaId) {
  const schema = FORM_SCHEMAS[schemaId];
  if (!schema) return [];
  const fields = [];
  schema.sections.forEach((section) => {
    section.fields.forEach((field) => {
      fields.push({
        id: field.id,
        label: field.label,
        type: field.type,
        required: !!field.required,
        section: section.title,
        role: section.role,
      });
    });
  });
  return fields;
}

function invertAppToPdf(appToPdf) {
  const pdfToApp = {};
  Object.entries(appToPdf || {}).forEach(([appId, pdfName]) => {
    pdfToApp[pdfName] = appId;
  });
  return pdfToApp;
}

async function loadPdfLibForMapper() {
  if (window.PDFLib) return window.PDFLib;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    s.onload = () => resolve(window.PDFLib);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function extractPdfAcroFields(templatePath) {
  const { PDFDocument } = await loadPdfLibForMapper();
  const res = await fetch(templatePath);
  if (!res.ok) throw new Error(`Cannot load ${templatePath} (${res.status})`);
  const bytes = await res.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  return form.getFields().map((f) => ({
    name: f.getName(),
    type: f.constructor.name.replace('PDF', ''),
  }));
}

async function loadFormsManifest() {
  const res = await fetch('assets/forms-manifest.json');
  if (!res.ok) throw new Error('Cannot load assets/forms-manifest.json');
  return res.json();
}

function buildMappingReport(manifestEntry, pdfFields) {
  const schemaId = manifestEntry.schemaId || manifestEntry.id;
  const mappingConfig = FORM_PDF_MAPPINGS[schemaId] || { appToPdf: {}, systemPdfFields: {}, manualPdfFields: {}, skipPdfFields: [] };
  const appFields = getSchemaAppFields(schemaId);
  const pdfToApp = invertAppToPdf(mappingConfig.appToPdf);

  const rows = (pdfFields || []).map((pdf) => {
    const name = pdf.name;
    if (mappingConfig.skipPdfFields.includes(name)) {
      return { pdfField: name, pdfType: pdf.type, status: 'skip', appFieldId: null, appLabel: '—', note: 'DHS admin/metadata field' };
    }
    if (mappingConfig.manualPdfFields[name]) {
      return { pdfField: name, pdfType: pdf.type, status: 'manual', appFieldId: null, appLabel: '—', note: mappingConfig.manualPdfFields[name] };
    }
    if (mappingConfig.systemPdfFields[name]) {
      return { pdfField: name, pdfType: pdf.type, status: 'system', appFieldId: '(auto)', appLabel: mappingConfig.systemPdfFields[name], note: 'Filled at export' };
    }
    const appId = pdfToApp[name];
    if (appId) {
      const app = appFields.find((f) => f.id === appId);
      return {
        pdfField: name,
        pdfType: pdf.type,
        status: 'mapped',
        appFieldId: appId,
        appLabel: app?.label || appId,
        note: app?.required ? 'Required in questionnaire' : 'Optional in questionnaire',
      };
    }
    return { pdfField: name, pdfType: pdf.type, status: 'unmapped_pdf', appFieldId: null, appLabel: '—', note: '⚠ No app mapping — needs manual fill or new mapping' };
  });

  const mappedPdfNames = new Set(rows.filter((r) => r.status === 'mapped').map((r) => r.pdfField));
  const appOnly = appFields
    .filter((app) => {
      const pdfName = mappingConfig.appToPdf[app.id];
      return !pdfName || !pdfFields?.some((p) => p.name === pdfName);
    })
    .map((app) => ({
      appFieldId: app.id,
      appLabel: app.label,
      section: app.section,
      required: app.required,
      status: mappingConfig.appToPdf[app.id] ? 'app_mapped_pdf_missing' : 'app_only',
      note: mappingConfig.appToPdf[app.id]
        ? 'Mapped in code but PDF field not found in template — re-scan after template update'
        : manifestEntry.templatePath
          ? 'Collected in app questionnaire; not yet mapped to PDF export'
          : 'No official PDF template — questionnaire only',
    }));

  const stats = {
    pdfTotal: pdfFields?.length || 0,
    mapped: rows.filter((r) => r.status === 'mapped').length,
    system: rows.filter((r) => r.status === 'system').length,
    manual: rows.filter((r) => r.status === 'manual').length,
    unmappedPdf: rows.filter((r) => r.status === 'unmapped_pdf').length,
    skip: rows.filter((r) => r.status === 'skip').length,
    appTotal: appFields.length,
    appOnly: appOnly.length,
    appRequired: appFields.filter((f) => f.required).length,
  };

  return { schemaId, rows, appOnly, appFields, stats, mappingConfig };
}

async function analyzeAllFormsFromManifest() {
  const manifest = await loadFormsManifest();
  const results = [];

  for (const entry of manifest.forms) {
    let pdfFields = [];
    if (entry.templatePath) {
      try {
        pdfFields = await extractPdfAcroFields(entry.templatePath);
      } catch (err) {
        results.push({ entry, error: err.message, report: null });
        continue;
      }
    }
    results.push({
      entry,
      pdfFields,
      report: buildMappingReport(entry, pdfFields),
    });
  }
  return { manifest, results, scannedAt: new Date().toISOString() };
}

window.FORM_PDF_MAPPINGS = FORM_PDF_MAPPINGS;
window.getSchemaAppFields = getSchemaAppFields;
window.extractPdfAcroFields = extractPdfAcroFields;
window.loadFormsManifest = loadFormsManifest;
window.buildMappingReport = buildMappingReport;
window.analyzeAllFormsFromManifest = analyzeAllFormsFromManifest;
