/**
 * SMART on FHIR clinician workflow — same exemption forms as staff outreach,
 * pre-filled from shared form state, saved to chart, clinician sign-off.
 */
const fhirFormState = { activeFormId: 'PA_MF' };

const FHIR_FORMS = [
  { id: 'PA_MF', label: 'Medical Frailty Attestation' },
  { id: 'PA_1663', label: 'PA 1663 — Employability Assessment' },
];

function initPatientFormWorkflow(patient) {
  if (!patient.formWorkflow) {
    patient.formWorkflow = {
      PA_MF: { savedToChart: false, clinicianSigned: false, patientSigned: false },
      PA_1663: { savedToChart: false, clinicianSigned: false, patientSigned: false },
    };
  }
  return patient.formWorkflow;
}

function getFormWorkflowStatus(patientId, formId) {
  const patient = patientRegistry.find((p) => p.id === patientId);
  if (!patient) return null;
  const wf = initPatientFormWorkflow(patient)[formId];
  const completion = getFormCompletion(patientId, formId);
  const draft = typeof loadLatestDraft === 'function' ? loadLatestDraft(patientId, formId) : null;
  return {
    ...wf,
    completion,
    hasChwDraft: !!draft,
    chwDraftAt: draft?.savedAt || null,
  };
}

function formWorkflowLabel(patientId, formId) {
  const status = getFormWorkflowStatus(patientId, formId);
  if (!status) return '—';
  const pct = status.completion.percent;
  if (status.clinicianSigned) return `${pct}% · signed`;
  if (status.savedToChart) return `${pct}% · in chart`;
  if (status.hasChwDraft) return `${pct}% · CHW draft`;
  return `${pct}%`;
}

function setFhirActiveForm(formId) {
  fhirFormState.activeFormId = formId;
  const patient = patientRegistry.find((p) => p.id === currentPatientFHIRId);
  if (patient) renderFHIRAppContent(patient);
}

function fhirLoadPatientForms(patientId) {
  ['PA_MF', 'PA_1663'].forEach((fid) => {
    if (typeof applyDraftToFormState === 'function') applyDraftToFormState(patientId, fid);
  });
}

function fhirSaveToChart(patientId, formId) {
  if (typeof captureFhirSignaturesToFormState === 'function') {
    captureFhirSignaturesToFormState(patientId, formId);
  }
  const completion = getFormCompletion(patientId, formId);
  saveFormSubmission(patientId, formId, getFormState(patientId, formId), {
    percentComplete: completion.percent,
    savedBy: 'clinician',
    label: FORM_SCHEMAS[formId]?.shortTitle || formId,
  });
  finalizeFormSubmission(patientId, formId);

  const patient = patientRegistry.find((p) => p.id === patientId);
  if (patient) {
    initPatientFormWorkflow(patient);
    patient.formWorkflow[formId].savedToChart = true;
  }

  syncFormToPatient(patientId, formId);
  showToast(
    'Saved to patient chart',
    `${FORM_SCHEMAS[formId].shortTitle} stored as DocumentReference (${completion.percent}% complete).`,
    'success'
  );
  renderFHIRAppContent(patient);
  if (typeof filterRegistryWorklist === 'function') filterRegistryWorklist();
}

function fhirClinicianSignOff(patientId, formId) {
  const patient = patientRegistry.find((p) => p.id === patientId);
  if (!patient) return;

  if (typeof captureFhirSignaturesToFormState === 'function') {
    captureFhirSignaturesToFormState(patientId, formId);
  }

  const state = getFormState(patientId, formId);
  if (!state.providerSignatureDataUrl) {
    showToast('Signature required', 'Draw your provider signature before signing off.', 'info');
    return;
  }
  const sigUrl = state.providerSignatureDataUrl;

  const completion = getFormCompletion(patientId, formId);
  state.providerSigned = true;
  state.attestationDate = todayISO();
  if (sigUrl) state.providerSignatureDataUrl = sigUrl;

  saveFormSubmission(patientId, formId, state, {
    percentComplete: completion.percent,
    savedBy: 'clinician',
    signed: true,
    label: FORM_SCHEMAS[formId]?.shortTitle || formId,
  });
  finalizeFormSubmission(patientId, formId);
  syncFormToPatient(patientId, formId);

  initPatientFormWorkflow(patient);
  patient.formWorkflow[formId].savedToChart = true;
  patient.formWorkflow[formId].clinicianSigned = true;
  patient.isSigned = true;

  if (formId === 'PA_MF') {
    patient.exemptionStatus = 'EXEMPT_COMPLETED';
    patient.outreachStatus = 'COMPLETED_COMPASS';
  }

  showToast('Provider attestation signed', `${FORM_SCHEMAS[formId].shortTitle} signed and saved to patient chart.`, 'success');

  setTimeout(() => {
    showToast('HIO transmission queued', 'Signed attestation queued for P3N / DHS ex-parte review (prototype).', 'info');
    renderFHIRAppContent(patient);
    if (typeof updateDashboardMetrics === 'function') updateDashboardMetrics();
    if (typeof filterRegistryWorklist === 'function') filterRegistryWorklist();
  }, 900);
}

function renderFhirProblemList(patient) {
  const rows = (patient.icdCodes || []).map(({ code, desc }) => `
    <div class="flex flex-col bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1 text-xs">
      <span class="font-mono font-bold text-slate-700">${code}</span>
      <p class="text-[10px] text-slate-500">${desc || 'Active problem list entry'}</p>
    </div>`).join('');

  return `
    <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
        <h4 class="font-bold text-slate-900 text-xs flex items-center space-x-2">
          <i class="fa-solid fa-list-check text-sky-600"></i>
          <span>Active Problem List</span>
        </h4>
        <span class="text-[10px] text-slate-400 font-mono">ICD-10 · EHR</span>
      </div>
      <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
        ${rows || '<p class="text-xs text-slate-400">No active diagnoses on file.</p>'}
      </div>
      ${patient.exemptionStatus === 'ELIGIBLE_TIER_2' ? `
        <div class="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2 mt-4">
          <p class="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Tier 2 utilization</p>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="bg-white p-2 rounded border border-slate-200">
              <span class="text-slate-400 block text-[10px]">ED visits (12mo)</span>
              <span class="text-base font-bold text-slate-800">${patient.utilization12mo}</span>
            </div>
            <div class="bg-white p-2 rounded border border-slate-200">
              <span class="text-slate-400 block text-[10px]">Active Rx</span>
              <span class="text-base font-bold text-slate-800">${patient.medCount}</span>
            </div>
          </div>
        </div>` : ''}
    </div>`;
}

function renderFhirExemptionFormsPanel(patient) {
  initPatientFormWorkflow(patient);
  const formId = fhirFormState.activeFormId || 'PA_MF';
  const wf = getFormWorkflowStatus(patient.id, formId);
  const isLocked = wf.clinicianSigned || patient.exemptionStatus === 'EXEMPT_COMPLETED';

  const formTabs = FHIR_FORMS.map((f) => {
    const st = getFormWorkflowStatus(patient.id, f.id);
    const active = formId === f.id ? 'form-tab-active text-sky-700' : 'text-slate-500 hover:text-slate-700';
    const badge = st.clinicianSigned ? ' <i class="fa-solid fa-circle-check text-emerald-600"></i>' : '';
    return `<button type="button" onclick="setFhirActiveForm('${f.id}')"
      class="px-4 py-2.5 text-xs font-semibold ${active}">${f.label}${badge}</button>`;
  }).join('');

  const chwBanner = wf.hasChwDraft ? `
    <div class="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-900 mb-4">
      <i class="fa-solid fa-user-nurse mr-1"></i>
      <strong>CHW partial draft loaded</strong> — pre-filled from outreach on
      ${wf.chwDraftAt ? new Date(wf.chwDraftAt).toLocaleString() : 'recent session'}.
      Review patient sections, complete provider attestation, then save to chart.
    </div>` : '';

  const statusChips = `
    <div class="flex flex-wrap gap-2 mb-4">
      <span class="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-700">${wf.completion.percent}% fields complete</span>
      ${wf.savedToChart ? '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-sky-100 text-sky-800">In patient chart</span>' : ''}
      ${wf.patientSigned ? '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-violet-100 text-violet-800">Patient signed</span>' : ''}
      ${wf.clinicianSigned ? '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">Clinician signed</span>' : ''}
    </div>`;

  const state = getFormState(patient.id, formId);
  const patientSigBlock = !isLocked && typeof renderSignaturePadHtml === 'function'
    ? renderSignaturePadHtml({
      canvasId: 'sig-pad-patient',
      label: '<i class="fa-solid fa-pen-nib text-violet-600 mr-1"></i>Patient signature',
      hint: 'Patient signs here (mouse or stylus)',
      stroke: '#7c3aed',
      variant: 'fhir',
    })
    : (wf.patientSigned ? `
    <div class="bg-violet-50 border border-violet-200 rounded-lg p-4 mt-4 text-center text-violet-800 text-xs">
      <i class="fa-solid fa-circle-check text-violet-600 text-lg mb-1"></i>
      <p class="font-bold">Patient signature captured</p>
    </div>` : '');

  const signatureBlock = !isLocked ? `
    ${patientSigBlock}
    ${typeof renderSignaturePadHtml === 'function' ? renderSignaturePadHtml({
      canvasId: 'sig-pad-clinician',
      label: '<i class="fa-solid fa-pen-nib text-sky-600 mr-1"></i>Provider signature',
      hint: 'Draw signature with mouse or stylus',
      stroke: '#0284c7',
      variant: 'fhir',
    }) : ''}` : `
    <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mt-4 text-center text-emerald-800 text-xs">
      <i class="fa-solid fa-circle-check text-emerald-600 text-lg mb-1"></i>
      <p class="font-bold">Provider attestation signed · saved to chart</p>
    </div>`;

  const actions = !isLocked ? `
    <div class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200">
      <button type="button" onclick="fhirSaveToChart('${patient.id}','${formId}')"
        class="text-xs bg-slate-700 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-lg transition">
        <i class="fa-solid fa-file-medical mr-1"></i> Save to patient chart
      </button>
      ${formId === 'PA_1663' ? `
      <button type="button" onclick="exportFormPDF('${patient.id}','PA_1663')"
        class="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-lg transition">
        <i class="fa-solid fa-file-pdf mr-1"></i> Download official PA 1663
      </button>` : ''}
      <button type="button" onclick="fhirClinicianSignOff('${patient.id}','${formId}')"
        class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-lg transition">
        <i class="fa-solid fa-signature mr-1"></i> Sign provider attestation
      </button>
    </div>` : '';

  const useOfficialPdf = typeof shouldUseOfficialPdfViewer === 'function'
    && shouldUseOfficialPdfViewer(formId);

  const questionnaireHost = useOfficialPdf
    ? `<div id="fhir-official-pdf-host" class="staff-official-pdf-host fhir-official-pdf-host"></div>`
    : `<div id="fhir-form-questionnaire-host">
          ${renderFormQuestionnaire(patient.id, formId, { readonly: isLocked })}
        </div>`;

  const pdfNotice = useOfficialPdf ? `
    <div class="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-900 mb-4">
      <i class="fa-solid fa-file-pdf mr-1"></i>
      <strong>Official DHS PDF</strong> — EHR-mapped fields are pre-filled below.
      Complete remaining fields and signatures on the form before saving to chart.
    </div>` : '';

  return `
    <div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div class="flex border-b border-slate-200 bg-slate-50 overflow-x-auto">${formTabs}</div>
      <div class="p-4">
        ${chwBanner}
        ${statusChips}
        ${pdfNotice}
        ${questionnaireHost}
        ${signatureBlock}
        ${actions}
      </div>
    </div>`;
}

function mountFhirOfficialPdfIfNeeded(patient) {
  const formId = fhirFormState.activeFormId || 'PA_MF';
  if (typeof shouldUseOfficialPdfViewer !== 'function' || !shouldUseOfficialPdfViewer(formId)) return Promise.resolve();
  const host = document.getElementById('fhir-official-pdf-host');
  if (host && patient) return mountOfficialPdfViewer(host, patient.id, formId);
  return Promise.resolve();
}

function renderFHIRAppContent(patient) {
  const container = document.getElementById('fhir-app-viewport');
  if (!container) return;

  fhirLoadPatientForms(patient.id);

  let statusBadge = '';
  if (patient.exemptionStatus === 'ELIGIBLE_TIER_1') {
    statusBadge = '<span class="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-full border border-emerald-200 uppercase tracking-wider">Eligible: Tier 1</span>';
  } else if (patient.exemptionStatus === 'ELIGIBLE_TIER_2') {
    statusBadge = '<span class="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full border border-amber-200 uppercase tracking-wider">Eligible: Tier 2</span>';
  } else if (patient.exemptionStatus === 'EXEMPT_COMPLETED') {
    statusBadge = '<span class="bg-sky-100 text-sky-800 text-xs font-bold px-3 py-1.5 rounded-full border border-sky-200 uppercase tracking-wider">Exemption completed</span>';
  } else {
    statusBadge = '<span class="bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-full border border-slate-200 uppercase tracking-wider">Unassessed</span>';
  }

  container.innerHTML = `
    <div class="bg-slate-100 border border-slate-300 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4 mb-4">
      <div class="flex items-center space-x-2 text-slate-600 text-xs">
        <span class="bg-sky-600 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase">Clinician workspace</span>
        <i class="fa-solid fa-angle-right"></i>
        <span>Medicaid exemption forms — same questionnaires as CHW outreach</span>
      </div>
      <span class="text-xs text-slate-500 font-medium">Pre-fill · save to chart · sign</span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div class="lg:col-span-4 space-y-6">
        <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 relative overflow-hidden">
          <div class="absolute top-0 left-0 w-2 h-full bg-sky-600"></div>
          <div class="flex justify-between items-start">
            <div>
              <h3 class="text-xl font-extrabold text-slate-900">${patient.name}</h3>
              <p class="text-xs text-slate-500">Medicaid ID: <span class="font-mono font-semibold">${patient.medicaidId}</span></p>
            </div>
            ${statusBadge}
          </div>
          <div class="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-100 text-xs">
            <div>
              <span class="text-slate-400 block uppercase font-bold tracking-wider text-[10px]">CAO</span>
              <span class="font-semibold text-slate-700">${patient.caoOffice}</span>
            </div>
            <div>
              <span class="text-slate-400 block uppercase font-bold tracking-wider text-[10px]">Redetermination due</span>
              <span class="font-semibold text-red-600">${new Date(patient.dueDate).toLocaleDateString('en-US')}</span>
            </div>
          </div>
        </div>
        ${renderFhirProblemList(patient)}
      </div>
      <div class="lg:col-span-8">
        ${renderFhirExemptionFormsPanel(patient)}
      </div>
    </div>`;

  setTimeout(() => {
    if (typeof destroyAllSignaturePads === 'function') destroyAllSignaturePads();
    if (typeof initSignaturePads === 'function') initSignaturePads(container);
    const formId = fhirFormState.activeFormId || 'PA_MF';
    if (typeof restoreFhirSignatures === 'function') restoreFhirSignatures(patient.id, formId);
    void mountFhirOfficialPdfIfNeeded(patient);
  }, 100);
}

window.fhirFormState = fhirFormState;
window.initPatientFormWorkflow = initPatientFormWorkflow;
window.getFormWorkflowStatus = getFormWorkflowStatus;
window.formWorkflowLabel = formWorkflowLabel;
window.setFhirActiveForm = setFhirActiveForm;
window.fhirSaveToChart = fhirSaveToChart;
window.fhirClinicianSignOff = fhirClinicianSignOff;
window.renderFHIRAppContent = renderFHIRAppContent;
