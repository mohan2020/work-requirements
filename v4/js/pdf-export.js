/**
 * PDF export — fills OFFICIAL DHS templates only. Does not generate synthetic form PDFs.
 */
const OFFICIAL_FORMS = {
  PA_1663: {
    templatePath: 'assets/PA_1663_official.pdf',
    filename: (patient) => `PA_1663_official_${patient.name.replace(/\s+/g, '_')}.pdf`,
    officialUrl:
      'https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/docs/documents/ma-response-forms/Employability%20Assessment%20Form.pdf',
  },
  PA_MF: {
    templatePath: null,
    officialUrl:
      'https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/medicaid/hr1-related/2026-05-may-pa-medical-frailty-overview-presentation.pdf',
    status: 'not_published',
    note:
      'Pennsylvania DHS has not published an official Medical Frailty attestation PDF for HR1 work requirements. PA plans to verify frailty primarily via claims/EHR data (P3N). Use the HTML questionnaire to collect data; when DHS publishes the official form, add its template to assets/.',
  },
};

async function loadPdfLib() {
  if (window.PDFLib) return window.PDFLib;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    s.onload = () => resolve(window.PDFLib);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function fetchOfficialTemplate(formId) {
  const meta = OFFICIAL_FORMS[formId];
  if (!meta?.templatePath) return null;
  const res = await fetch(meta.templatePath);
  if (!res.ok) throw new Error(`Could not load official template: ${meta.templatePath}`);
  return res.arrayBuffer();
}

async function exportOfficialPA1663(patientId) {
  return downloadFilledOfficialPdf(patientId, 'PA_1663');
}

async function downloadFilledOfficialPdf(patientId, formId) {
  const patient = patientRegistry.find((p) => p.id === patientId);
  if (!patient) return;

  const entry = typeof getManifestFormEntry === 'function'
    ? getManifestFormEntry(formId)
    : { title: FORM_SCHEMAS?.[formId]?.title || formId };

  showToast('Loading Official Form', `Filling DHS ${entry.title} with pre-populated data...`, 'info');

  try {
    const bytes = typeof buildFilledOfficialPdf === 'function'
      ? await buildFilledOfficialPdf(patientId, formId)
      : await buildLegacyPA1663Bytes(patientId);

    const filename = OFFICIAL_FORMS[formId]?.filename?.(patient)
      || `official_${formId}_${patient.name.replace(/\s+/g, '_')}.pdf`;
    downloadPdfBlob(bytes, filename);

    showToast(
      'Official PDF ready',
      'Downloaded the official DHS form with EHR-mapped fields pre-filled. Complete signatures and remaining fields on the PDF before submission.',
      'success'
    );
  } catch (err) {
    console.error(err);
    showToast('Export failed', err.message || 'Could not generate official PDF.', 'info');
  }
}

async function buildLegacyPA1663Bytes(patientId) {
  const patient = patientRegistry.find((p) => p.id === patientId);
  if (!patient) throw new Error('Patient not found');

  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  const templateBytes = await fetchOfficialTemplate('PA_1663');
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();
  const state = getFormState(patientId, 'PA_1663');
  const values = buildPA1663FieldValues(patient, state);

  Object.entries(values).forEach(([fieldName, value]) => safeSetTextField(form, fieldName, value));

  if (patient.signatureDataUrl || getFormState(patientId, 'PA_1663').patientSignatureDataUrl) {
    const state = getFormState(patientId, 'PA_1663');
    const sigUrl = state.patientSignatureDataUrl || patient.signatureDataUrl;
    try {
      const pngBytes = await fetch(sigUrl).then((r) => r.arrayBuffer());
      const png = await pdfDoc.embedPng(pngBytes);
      const pages = pdfDoc.getPages();
      const page = pages[pages.length - 1];
      page.drawImage(png, { x: 120, y: 80, width: 140, height: 40 });
      page.drawText('Digitally captured in Penn Medicine EHR', {
        x: 120,
        y: 70,
        size: 7,
        color: rgb(0.4, 0.4, 0.4),
      });
    } catch (err) {
      console.warn('Could not embed signature on official PDF', err);
    }
  }

  try {
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    form.updateFieldAppearances(helvetica);
  } catch (_) {
    /* appearance update optional */
  }

  return pdfDoc.save();
}

function downloadPdfBlob(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportFormPDF(patientId, formId) {
  if (typeof shouldUseOfficialPdfViewer === 'function' && shouldUseOfficialPdfViewer(formId)) {
    return downloadFilledOfficialPdf(patientId, formId);
  }
  if (formId === 'PA_1663') {
    return exportOfficialPA1663(patientId);
  }

  if (formId === 'PA_MF') {
    const meta = OFFICIAL_FORMS.PA_MF;
    showToast(
      'No Official PDF Available',
      meta.note,
      'info'
    );
    window.open(meta.officialUrl, '_blank');
    return;
  }
}

async function exportAllOfficialForms(patientId) {
  await exportOfficialPA1663(patientId);
  const mf = OFFICIAL_FORMS.PA_MF;
  showToast('Medical Frailty Form', mf.note, 'info');
}

window.OFFICIAL_FORMS = OFFICIAL_FORMS;
window.exportFormPDF = exportFormPDF;
window.exportOfficialPA1663 = exportOfficialPA1663;
window.downloadFilledOfficialPdf = downloadFilledOfficialPdf;
window.exportAllOfficialForms = exportAllOfficialForms;
