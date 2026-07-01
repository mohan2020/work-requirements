/**
 * Medical Frailty HTML form — document-style renderer for PA_MF.
 * Used when no official DHS PDF exists; styled to align with the official PDF viewer shell.
 */
function shouldUseHtmlFormViewer(formId) {
  return formId === 'PA_MF';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paMfFieldAttr(patientId, formId, fieldId) {
  return `data-field="${fieldId}" oninput="handleFormFieldChange('${patientId}', '${formId}', '${fieldId}', this)" onchange="handleFormFieldChange('${patientId}', '${formId}', '${fieldId}', this)"`;
}

function renderPaMfTextField(patientId, formId, field, state, readonly) {
  const val = escapeHtml(state[field.id] ?? field.defaultValue ?? '');
  const req = field.required ? ' <span class="req">*</span>' : '';
  const disabled = readonly ? 'disabled' : '';
  const inputType = field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text';
  return `
    <div class="pa-mf-field">
      <label>${field.label}${req}</label>
      <input type="${inputType}" value="${val}" ${disabled} ${paMfFieldAttr(patientId, formId, field.id)}>
    </div>`;
}

function renderPaMfTextarea(patientId, formId, field, state, readonly) {
  const val = escapeHtml(state[field.id] ?? '');
  const req = field.required ? ' <span class="req">*</span>' : '';
  const disabled = readonly ? 'disabled' : '';
  return `
    <div class="pa-mf-field">
      <label>${field.label}${req}</label>
      <textarea rows="${field.rows || 4}" ${disabled} ${paMfFieldAttr(patientId, formId, field.id)}>${val}</textarea>
    </div>`;
}

function renderPaMfCheckbox(patientId, formId, field, state, readonly) {
  const checked = state[field.id] ? 'checked' : '';
  const disabled = readonly ? 'disabled' : '';
  return `
    <label class="pa-mf-cert-check">
      <input type="checkbox" ${checked} ${disabled} ${paMfFieldAttr(patientId, formId, field.id)}>
      <span>${field.label}</span>
    </label>`;
}

const PA_MF_IMPAIRMENT_COPY = {
  impairment_smi: {
    title: 'Severe Mental Illness (SMI)',
    desc: 'Impairment stemming from diagnosed Serious Mental Illness (e.g. Schizophrenia, Bipolar, Recurrent Severe Major Depression).',
  },
  impairment_sud: {
    title: 'Substance Use Disorder (SUD)',
    desc: 'Active diagnosis or treatment for severe substance use requiring continuous medical supervision or rehabilitation.',
  },
  impairment_oncology: {
    title: 'Active Oncology / End-Stage Organ Disease',
    desc: 'Malignant neoplasm under active treatment, or progressive organ failure (ESRD, advanced heart failure).',
  },
  impairment_comorbidity: {
    title: 'Complex Comorbidities & High Utilization (Tier 2)',
    desc: 'Clinical judgment confirms impairment from multiple co-occurring chronic illnesses or high-acuity care patterns.',
  },
};

function renderPaMfImpairmentChecklist(patientId, formId, fields, state, readonly) {
  const disabled = readonly ? 'disabled' : '';
  const items = fields
    .filter((f) => f.type === 'checkbox' && PA_MF_IMPAIRMENT_COPY[f.id])
    .map((field) => {
      const copy = PA_MF_IMPAIRMENT_COPY[field.id];
      const checked = state[field.id] ? 'checked' : '';
      return `
        <label class="pa-mf-check-item">
          <input type="checkbox" ${checked} ${disabled} ${paMfFieldAttr(patientId, formId, field.id)}>
          <div>
            <strong>${copy.title}</strong>
            <span>${copy.desc}</span>
          </div>
        </label>`;
    })
    .join('');

  return `
    <div class="pa-mf-checklist">
      <p class="pa-mf-checklist-title">Clinical impairment categories (check all that apply)</p>
      ${items}
    </div>`;
}

function renderPaMfSectionA(patientId, formId, section, state, readonly) {
  const byId = Object.fromEntries(section.fields.map((f) => [f.id, f]));
  return `
    <div class="pa-mf-section-banner">${section.title}</div>
    <p class="pa-mf-section-desc">${section.description}</p>
    <div class="pa-mf-field-row pa-mf-field-row--3">
      ${renderPaMfTextField(patientId, formId, byId.patientName, state, readonly)}
      ${renderPaMfTextField(patientId, formId, byId.dob, state, readonly)}
      ${renderPaMfTextField(patientId, formId, byId.medicaidId, state, readonly)}
    </div>
    <div class="pa-mf-field-row">
      ${renderPaMfTextField(patientId, formId, byId.address, state, readonly)}
      ${renderPaMfTextField(patientId, formId, byId.phone, state, readonly)}
    </div>
    ${renderPaMfTextField(patientId, formId, byId.email, state, readonly)}
    ${renderPaMfTextarea(patientId, formId, byId.patientConditions, state, readonly)}
    <div class="pa-mf-field-row">
      ${renderPaMfTextField(patientId, formId, byId.treatingProviderName, state, readonly)}
      ${renderPaMfTextField(patientId, formId, byId.treatingProviderPhone, state, readonly)}
    </div>
    ${renderPaMfCheckbox(patientId, formId, byId.patientSignatureAck, state, readonly)}`;
}

function renderPaMfSectionB(patientId, formId, section, state, readonly) {
  const byId = Object.fromEntries(section.fields.map((f) => [f.id, f]));
  return `
    <div class="pa-mf-section-banner">${section.title}</div>
    <p class="pa-mf-section-desc">${section.description}</p>
    ${renderPaMfImpairmentChecklist(patientId, formId, section.fields, state, readonly)}
    ${renderPaMfTextarea(patientId, formId, byId.clinicalJustification, state, readonly)}
    <div class="pa-mf-field-row pa-mf-field-row--3">
      ${renderPaMfTextField(patientId, formId, byId.providerName, state, readonly)}
      ${renderPaMfTextField(patientId, formId, byId.providerNpi, state, readonly)}
      ${renderPaMfTextField(patientId, formId, byId.providerTitle, state, readonly)}
    </div>
    ${renderPaMfTextField(patientId, formId, byId.attestationDate, state, readonly)}
    <div class="pa-mf-attestation-box">
      <strong>Provider attestation:</strong> By signing this form, the licensed provider certifies that the patient's
      physical or mental condition significantly impairs their capacity to meet the 80-hour monthly work or community
      engagement requirement under Pennsylvania Medicaid HR1 rules.
    </div>`;
}

function renderMedicalFrailtyHtmlForm(patientId, formId, options = {}) {
  const schema = FORM_SCHEMAS[formId];
  const patient = patientRegistry.find((p) => p.id === patientId);
  if (!patient || !schema || formId !== 'PA_MF') return '';

  const state = getFormState(patientId, formId);
  const completion = getFormCompletion(patientId, formId);
  const readonly = options.readonly
    || (patient.exemptionStatus === 'EXEMPT_COMPLETED' && formId === 'PA_MF');

  const sectionA = schema.sections.find((s) => s.id === 'section_a');
  const sectionB = schema.sections.find((s) => s.id === 'section_b');

  const sectionAHtml = sectionA ? renderPaMfSectionA(patientId, formId, sectionA, state, readonly) : '';
  const sectionBHtml = sectionB ? renderPaMfSectionB(patientId, formId, sectionB, state, readonly) : '';

  const footerActions = readonly
    ? ''
    : `
      <div class="pa-mf-form-footer">
        <button type="button" class="pa-mf-btn-print" onclick="printMedicalFrailtyForm('${patientId}', '${formId}')">
          <i class="fa-solid fa-print"></i> Print
        </button>
        <button type="button" class="pa-mf-btn-reset" onclick="resetFormPrefill('${patientId}', '${formId}')">
          <i class="fa-solid fa-rotate-left"></i> Reset to EHR pre-fill
        </button>
      </div>`;

  return `
    <div class="pa-mf-form-shell" data-form-id="${formId}" data-patient-id="${patientId}">
      <div class="pa-mf-form-toolbar">
        <div class="pa-mf-form-meta">
          <span class="pa-mf-form-badge pa-mf-form-badge--draft">HTML form — draft structure</span>
          <span class="pa-mf-form-title">${schema.title}</span>
          <span class="pa-mf-form-pct">${completion.percent}% pre-filled</span>
        </div>
        <a href="${schema.officialUrl}" target="_blank" rel="noopener"
          style="font-size:11px;color:#0284c7;text-decoration:none;white-space:nowrap;">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> PA DHS reference
        </a>
      </div>
      <div class="pa-mf-form-scroll">
        <div class="pa-mf-form-page">
          <header class="pa-mf-form-header">
            <h2>Commonwealth of Pennsylvania · Department of Human Services</h2>
            <h3>Medical Frailty Self-Declaration and Provider Attestation</h3>
          </header>
          <p class="pa-mf-form-notice">
            <strong>Note:</strong> Pennsylvania DHS has not published an official Medical Frailty attestation PDF for
            HR1 work requirements. This HTML form follows the draft structure in project specifications. Exemption may
            also proceed via claims/EHR data (P3N) when clinical records are sufficient.
          </p>
          ${sectionAHtml}
          ${sectionBHtml}
        </div>
      </div>
      ${footerActions}
      <p class="pa-mf-form-hint">
        EHR-mapped fields are pre-filled below. Complete remaining fields and capture signatures before submitting
        for review or saving to chart.
      </p>
    </div>`;
}

function printMedicalFrailtyForm(patientId, formId) {
  const host = document.querySelector(`.pa-mf-form-shell[data-form-id="${formId}"][data-patient-id="${patientId}"]`);
  if (!host) {
    if (typeof printFormQuestionnaire === 'function') printFormQuestionnaire(patientId, formId);
    return;
  }
  const page = host.querySelector('.pa-mf-form-page');
  if (!page) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${FORM_SCHEMAS[formId].title}</title>
    <style>
      body { font-family: Georgia, serif; padding: 24px; font-size: 11px; color: #1e293b; }
      .pa-mf-section-banner { background: #1e293b; color: #fff; padding: 6px 10px; margin: 16px 0 8px; font-size: 10px; font-weight: bold; }
      .pa-mf-field { margin-bottom: 10px; }
      .pa-mf-field label { font-size: 9px; font-weight: bold; text-transform: uppercase; color: #64748b; }
      input, textarea { border: none; border-bottom: 1px solid #94a3b8; width: 100%; font-size: 11px; }
      textarea { border: 1px solid #cbd5e1; padding: 4px; }
      .pa-mf-checklist { border: 1px solid #cbd5e1; padding: 10px; margin: 10px 0; }
      .pa-mf-form-notice, .pa-mf-attestation-box { font-size: 10px; padding: 8px; border: 1px solid #fcd34d; background: #fffbeb; }
    </style></head><body>`);
  w.document.write(`<h2 style="text-align:center">${FORM_SCHEMAS[formId].title}</h2>`);
  w.document.write(page.innerHTML);
  w.document.write('</body></html>');
  w.document.close();
  w.print();
}

function refreshMedicalFrailtyFormHosts(patientId, formId) {
  const html = renderMedicalFrailtyHtmlForm(patientId, formId, {
    readonly: false,
    roleFilter: typeof currentFormRoleFilter !== 'undefined' ? currentFormRoleFilter : null,
  });
  ['staff-html-form-host', 'fhir-html-form-host'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function updatePaMfFormProgress(patientId, formId) {
  if (formId !== 'PA_MF') return;
  const completion = getFormCompletion(patientId, formId);
  const shell = document.querySelector(`.pa-mf-form-shell[data-patient-id="${patientId}"][data-form-id="${formId}"]`);
  const pct = shell?.querySelector('.pa-mf-form-pct');
  if (pct) pct.textContent = `${completion.percent}% pre-filled`;

  const progress = document.querySelector('.staff-form-progress');
  if (progress && typeof staffState !== 'undefined' && staffState.selectedFormId === formId) {
    progress.innerHTML = `
      <span><strong>${completion.filled}</strong> of <strong>${completion.total}</strong> fields</span>
      <div class="bar"><div class="bar-fill" style="width:${completion.percent}%"></div></div>
      <span>${completion.percent}%</span>`;
  }
}

window.shouldUseHtmlFormViewer = shouldUseHtmlFormViewer;
window.updatePaMfFormProgress = updatePaMfFormProgress;
window.renderMedicalFrailtyHtmlForm = renderMedicalFrailtyHtmlForm;
window.printMedicalFrailtyForm = printMedicalFrailtyForm;
window.refreshMedicalFrailtyFormHosts = refreshMedicalFrailtyFormHosts;
