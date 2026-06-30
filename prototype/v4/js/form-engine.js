/**
 * Form state, pre-fill, HTML rendering, and persistence for exemption questionnaires.
 */
const formResponses = {};

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function deriveIcdList(patient) {
  if (!patient.icdCodes?.length) return '';
  return patient.icdCodes
    .map(({ code, desc }) => (desc ? `${code} — ${desc}` : code))
    .join('\n');
}

function deriveImpairmentFlags(patient) {
  const flags = { impairment_smi: false, impairment_sud: false, impairment_oncology: false, impairment_comorbidity: false };
  (patient.icdCodes || []).forEach(({ code }) => {
    const c = String(code).toUpperCase();
    if (/^F(20|31|33)/.test(c)) flags.impairment_smi = true;
    if (/^F(10|11)/.test(c)) flags.impairment_sud = true;
    if (/^C/.test(c) || c === 'N18.6' || /^I50/.test(c)) flags.impairment_oncology = true;
  });
  if (patient.exemptionStatus === 'ELIGIBLE_TIER_2') flags.impairment_comorbidity = true;
  if (patient.checkboxOverrides) {
    if (patient.checkboxOverrides.smi !== undefined) flags.impairment_smi = patient.checkboxOverrides.smi;
    if (patient.checkboxOverrides.sud !== undefined) flags.impairment_sud = patient.checkboxOverrides.sud;
    if (patient.checkboxOverrides.oncology !== undefined) flags.impairment_oncology = patient.checkboxOverrides.oncology;
    if (patient.checkboxOverrides.comorbidity !== undefined) flags.impairment_comorbidity = patient.checkboxOverrides.comorbidity;
  }
  return flags;
}

function prefillFormData(patient, formId) {
  const flags = deriveImpairmentFlags(patient);
  const icdList = deriveIcdList(patient);
  const base = {
    patientName: patient.name,
    dob: patient.dob,
    medicaidId: patient.medicaidId,
    phone: patient.phone || '',
    address: `${patient.caoOffice || 'Philadelphia, PA'}`,
    email: '',
    patientConditions: patient.rationale || '',
    patientStatement: patient.rationale || '',
    treatingProviderName: 'Siobhan Mita, MD',
    treatingProviderPhone: '(215) 662-4000',
    clinicalJustification: patient.physicianNotes || '',
    diagnosisList: icdList,
    examinationFindings: [
      patient.physicianNotes || '',
      patient.exemptionStatus === 'ELIGIBLE_TIER_2'
        ? `Utilization (12mo): ${patient.utilization12mo} ED visits. Active medications: ${patient.medCount}.`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    providerName: 'Siobhan Mita, MD',
    providerNpi: '1234567890',
    providerTitle: 'MD',
    attestationDate: todayISO(),
    examDate: todayISO(),
    employabilityStatus: patient.exemptionStatus === 'UNASSESSED' ? 'employable' : 'temp_12mo',
    disabilityBeginDate: '',
    disabilityEndDate: patient.dueDate || '',
    patientSignatureAck: false,
    ...flags,
  };
  if (formId === 'PA_MF') {
    return base;
  }
  return base;
}

function getFormState(patientId, formId) {
  const key = `${patientId}:${formId}`;
  if (!formResponses[key]) {
    const patient = patientRegistry.find((p) => p.id === patientId);
    if (!patient) return {};
    formResponses[key] = prefillFormData(patient, formId);
    formResponses[key]._meta = { prefilledAt: new Date().toISOString(), formId, patientId };
  }
  return formResponses[key];
}

function saveFormField(patientId, formId, fieldId, value) {
  const state = getFormState(patientId, formId);
  state[fieldId] = value;
  syncFormToPatient(patientId, formId);
}

function syncFormToPatient(patientId, formId) {
  const patient = patientRegistry.find((p) => p.id === patientId);
  const state = getFormState(patientId, formId);
  if (!patient) return;
  if (formId === 'PA_MF') {
    patient.physicianNotes = state.clinicalJustification || patient.physicianNotes;
    patient.checkboxOverrides = patient.checkboxOverrides || {};
    patient.checkboxOverrides.smi = !!state.impairment_smi;
    patient.checkboxOverrides.sud = !!state.impairment_sud;
    patient.checkboxOverrides.oncology = !!state.impairment_oncology;
    patient.checkboxOverrides.comorbidity = !!state.impairment_comorbidity;
  }
}

function getFormCompletion(patientId, formId) {
  const schema = FORM_SCHEMAS[formId];
  const state = getFormState(patientId, formId);
  let total = 0;
  let filled = 0;
  schema.sections.forEach((section) => {
    section.fields.forEach((field) => {
      if (field.type === 'checkbox' && !field.required) return;
      total += 1;
      const val = state[field.id];
      if (field.type === 'checkbox') {
        if (val) filled += 1;
      } else if (val !== undefined && val !== null && String(val).trim() !== '') {
        filled += 1;
      }
    });
  });
  return { filled, total, percent: total ? Math.round((filled / total) * 100) : 0 };
}

function renderFormField(patientId, formId, field, state, options = {}) {
  const { readonly = false, roleFilter = null } = options;
  const schema = FORM_SCHEMAS[formId];
  const section = schema.sections.find((s) => s.fields.some((f) => f.id === field.id));
  if (roleFilter && section && section.role !== roleFilter) return '';

  const val = state[field.id] ?? field.defaultValue ?? '';
  const disabled = readonly ? 'disabled' : '';
  const onChange = `onchange="handleFormFieldChange('${patientId}', '${formId}', '${field.id}', this)"`;
  const onInput = `oninput="handleFormFieldChange('${patientId}', '${formId}', '${field.id}', this)"`;

  if (field.type === 'textarea') {
    return `
      <div class="form-field space-y-1">
        <label class="block text-[11px] font-bold text-slate-700">${field.label}${field.required ? ' <span class="text-rose-500">*</span>' : ''}</label>
        <textarea data-field="${field.id}" rows="${field.rows || 3}" ${disabled} ${onInput}
          class="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-sky-500 focus:border-sky-500 resize-none">${val}</textarea>
      </div>`;
  }
  if (field.type === 'checkbox') {
    const checked = val ? 'checked' : '';
    return `
      <label class="flex items-start space-x-3 cursor-pointer form-field">
        <input type="checkbox" data-field="${field.id}" ${checked} ${disabled} ${onChange}
          class="mt-0.5 rounded text-sky-600 h-4 w-4 border-slate-300">
        <span class="text-xs text-slate-700">${field.label}</span>
      </label>`;
  }
  if (field.type === 'radio') {
    return `
      <div class="form-field space-y-2">
        <p class="text-[11px] font-bold text-slate-700">${field.label}${field.required ? ' <span class="text-rose-500">*</span>' : ''}</p>
        <div class="space-y-2">
          ${field.options
            .map(
              (opt) => `
            <label class="flex items-start space-x-2 cursor-pointer">
              <input type="radio" name="${formId}_${field.id}" value="${opt.value}" ${val === opt.value ? 'checked' : ''} ${disabled} ${onChange}
                class="mt-0.5 text-sky-600 border-slate-300">
              <span class="text-xs text-slate-700">${opt.label}</span>
            </label>`
            )
            .join('')}
        </div>
      </div>`;
  }
  const inputType = field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text';
  return `
    <div class="form-field space-y-1">
      <label class="block text-[11px] font-bold text-slate-700">${field.label}${field.required ? ' <span class="text-rose-500">*</span>' : ''}</label>
      <input type="${inputType}" data-field="${field.id}" value="${val}" ${disabled} ${onInput}
        class="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:ring-sky-500 focus:border-sky-500">
    </div>`;
}

function renderFormQuestionnaire(patientId, formId, options = {}) {
  const schema = FORM_SCHEMAS[formId];
  const patient = patientRegistry.find((p) => p.id === patientId);
  if (!patient || !schema) return '';
  const state = getFormState(patientId, formId);
  const completion = getFormCompletion(patientId, formId);
  const isLocked = patient.exemptionStatus === 'EXEMPT_COMPLETED' && formId === 'PA_MF';

  const sectionsHtml = schema.sections
    .map((section) => {
      const fieldsHtml = section.fields
        .map((field) =>
          renderFormField(patientId, formId, field, state, {
            ...options,
            readonly: isLocked || options.readonly,
          })
        )
        .join('');
      const roleBadge =
        section.role === 'patient'
          ? '<span class="bg-violet-100 text-violet-800 text-[9px] font-bold px-2 py-0.5 rounded uppercase">Patient / CHW</span>'
          : '<span class="bg-sky-100 text-sky-800 text-[9px] font-bold px-2 py-0.5 rounded uppercase">Clinician</span>';
      return `
        <div class="form-section bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div class="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
            <div>
              <h4 class="font-bold text-sm text-slate-900">${section.title}</h4>
              <p class="text-[10px] text-slate-500 mt-0.5">${section.description}</p>
            </div>
            ${roleBadge}
          </div>
          <div class="p-4 space-y-4">${fieldsHtml}</div>
        </div>`;
    })
    .join('');

  return `
    <div class="form-questionnaire space-y-4" data-form-id="${formId}" data-patient-id="${patientId}">
      <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-800 text-white rounded-xl px-4 py-3">
        <div>
          <p class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">${schema.dhsFormNumber}</p>
          <h3 class="font-bold text-sm">${schema.title}</h3>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] bg-emerald-600/30 text-emerald-300 px-2 py-1 rounded font-bold">${completion.percent}% pre-filled</span>
          <a href="${schema.officialUrl}" target="_blank" rel="noopener" class="text-[10px] text-sky-300 hover:underline">
            <i class="fa-solid fa-arrow-up-right-from-square mr-1"></i>Official reference
          </a>
        </div>
      </div>
      ${sectionsHtml}
      <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
        ${formId === 'PA_1663' ? `
        <button type="button" onclick="exportFormPDF('${patientId}', '${formId}')"
          class="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-4 rounded-lg transition flex items-center gap-1.5">
          <i class="fa-solid fa-file-pdf"></i> Download Official PA 1663 (Pre-filled)
        </button>` : `
        <button type="button" onclick="exportFormPDF('${patientId}', '${formId}')"
          class="text-xs bg-slate-400 text-white font-bold py-2 px-4 rounded-lg transition flex items-center gap-1.5 cursor-not-allowed" title="No official DHS PDF published yet">
          <i class="fa-solid fa-file-pdf"></i> Official PDF Not Yet Published
        </button>
        <p class="w-full text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
          <i class="fa-solid fa-circle-info mr-1"></i>
          PA DHS has not released an official Medical Frailty attestation PDF for HR1 work requirements.
          Use this questionnaire to collect data; exemption may proceed via claims/P3N ex-parte when clinical data is sufficient.
        </p>`}
        <button type="button" onclick="printFormQuestionnaire('${patientId}', '${formId}')"
          class="text-xs bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg transition flex items-center gap-1.5">
          <i class="fa-solid fa-print"></i> Print
        </button>
        <button type="button" onclick="resetFormPrefill('${patientId}', '${formId}')"
          class="text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold py-2 px-4 rounded-lg transition flex items-center gap-1.5">
          <i class="fa-solid fa-rotate-left"></i> Reset to EHR Pre-fill
        </button>
      </div>
    </div>`;
}

function handleFormFieldChange(patientId, formId, fieldId, el) {
  let value;
  if (el.type === 'checkbox') value = el.checked;
  else if (el.type === 'radio') {
    if (!el.checked) return;
    value = el.value;
  } else value = el.value;
  saveFormField(patientId, formId, fieldId, value);
  if (typeof updateFormCompletionBadge === 'function') updateFormCompletionBadge(patientId);
}

function resetFormPrefill(patientId, formId) {
  delete formResponses[`${patientId}:${formId}`];
  const container = document.getElementById('form-questionnaire-host');
  if (container) {
    container.innerHTML = renderFormQuestionnaire(patientId, formId, { roleFilter: currentFormRoleFilter });
    showToast('Form Reset', 'Questionnaire re-populated from EHR clinical data.', 'info');
  }
  if (activeRunMode === 'fhir' && currentPatientFHIRId === patientId) {
    renderFHIRAppContent(patientRegistry.find((p) => p.id === patientId));
  }
}

function printFormQuestionnaire(patientId, formId) {
  const host = document.querySelector(`[data-form-id="${formId}"][data-patient-id="${patientId}"]`);
  if (!host) return;
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>${FORM_SCHEMAS[formId].title}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;font-size:12px} .form-section{margin-bottom:24px;border:1px solid #ccc;padding:16px}
    h3{font-size:14px} label{font-weight:bold;display:block;margin-top:12px}</style></head><body>`);
  w.document.write(`<h2>${FORM_SCHEMAS[formId].title}</h2>`);
  w.document.write(host.innerHTML);
  w.document.write('</body></html>');
  w.document.close();
  w.print();
}

window.formResponses = formResponses;
window.getFormState = getFormState;
window.saveFormField = saveFormField;
window.renderFormQuestionnaire = renderFormQuestionnaire;
window.handleFormFieldChange = handleFormFieldChange;
window.resetFormPrefill = resetFormPrefill;
window.printFormQuestionnaire = printFormQuestionnaire;
window.getFormCompletion = getFormCompletion;
window.prefillFormData = prefillFormData;
window.todayISO = todayISO;
