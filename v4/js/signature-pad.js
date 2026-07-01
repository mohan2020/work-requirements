/**
 * Reusable canvas signature pads — staff outreach, FHIR clinician workspace.
 */
const sigPadInstances = new Map();

function getSigPadPrompt(canvasId) {
  return document.getElementById(`${canvasId}-prompt`);
}

function isSignaturePadEmpty(canvasId) {
  const inst = sigPadInstances.get(canvasId);
  if (!inst) return true;
  const prompt = getSigPadPrompt(canvasId);
  return prompt ? !prompt.classList.contains('hidden') : true;
}

function getSignatureDataUrl(canvasId) {
  if (isSignaturePadEmpty(canvasId)) return null;
  const inst = sigPadInstances.get(canvasId);
  return inst?.canvas?.toDataURL('image/png') || null;
}

function clearSignaturePad(canvasId) {
  const inst = sigPadInstances.get(canvasId);
  if (!inst) return;
  inst.ctx.clearRect(0, 0, inst.canvas.width, inst.canvas.height);
  const prompt = getSigPadPrompt(canvasId);
  if (prompt) prompt.classList.remove('hidden');
}

function clearClinicianSignature() {
  clearSignaturePad('sig-pad-clinician');
}

function resizeSignaturePad(canvasId) {
  const inst = sigPadInstances.get(canvasId);
  if (!inst) return;
  const { canvas, ctx, strokeStyle, lineWidth } = inst;
  const rect = canvas.getBoundingClientRect();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = rect.width;
  canvas.height = rect.height;
  ctx.putImageData(imageData, 0, 0);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
}

function bindSignaturePad(canvasId, strokeStyle = '#0284c7') {
  const canvas = document.getElementById(canvasId);
  if (!canvas || sigPadInstances.has(canvasId)) return;

  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';

  const inst = { canvas, ctx, strokeStyle, lineWidth: 2.5, drawing: false };
  sigPadInstances.set(canvasId, inst);

  const getPos = (e) => {
    const bounds = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    return {
      x: ((clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const start = (e) => {
    inst.drawing = true;
    const prompt = getSigPadPrompt(canvasId);
    if (prompt) prompt.classList.add('hidden');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e) => {
    if (!inst.drawing) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stop = () => {
    inst.drawing = false;
  };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stop);
  canvas.addEventListener('mouseout', stop);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); start(e.touches[0]); });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e.touches[0]); });
  canvas.addEventListener('touchend', stop);
}

function restoreSignaturePad(canvasId, dataUrl) {
  if (!dataUrl) return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!sigPadInstances.has(canvasId)) bindSignaturePad(canvasId);
  const inst = sigPadInstances.get(canvasId);
  if (!inst) return;

  const img = new Image();
  img.onload = () => {
    inst.ctx.clearRect(0, 0, inst.canvas.width, inst.canvas.height);
    inst.ctx.drawImage(img, 0, 0, inst.canvas.width, inst.canvas.height);
    const prompt = getSigPadPrompt(canvasId);
    if (prompt) prompt.classList.add('hidden');
  };
  img.src = dataUrl;
}

function initSignaturePads(root) {
  const scope = root || document;
  scope.querySelectorAll('canvas[data-sig-pad]').forEach((canvas) => {
    const stroke = canvas.dataset.sigStroke || '#0284c7';
    bindSignaturePad(canvas.id, stroke);
  });
}

/** @deprecated use initSignaturePads — kept for FHIR load path */
function initSignaturePad() {
  initSignaturePads();
}

function destroyAllSignaturePads() {
  sigPadInstances.clear();
}

function captureSignaturesToFormState(patientId, formId, padIds = {}) {
  const state = getFormState(patientId, formId);
  const patient = patientRegistry.find((p) => p.id === patientId);
  const { patientPad, providerPad } = padIds;

  if (patientPad) {
    const padSig = getSignatureDataUrl(patientPad);
    if (padSig) persistStaffSignature(patientId, formId, 'patient', padSig);
  }
  if (providerPad) {
    const padSig = getSignatureDataUrl(providerPad);
    if (padSig) persistStaffSignature(patientId, formId, 'provider', padSig);
  }

  return {
    patientSig: state.patientSignatureDataUrl || patient?.signatureDataUrl || null,
    providerSig: state.providerSignatureDataUrl || null,
  };
}

function captureFhirSignaturesToFormState(patientId, formId) {
  return captureSignaturesToFormState(patientId, formId, {
    patientPad: 'sig-pad-patient',
    providerPad: 'sig-pad-clinician',
  });
}

const staffSigModalState = {
  role: null,
  patientId: null,
  formId: null,
  stroke: '#0284c7',
};

const STAFF_SIG_MODAL_CANVAS = 'staff-sig-modal-canvas';

function renderSignaturePadHtml({
  canvasId,
  label,
  hint = 'Draw signature with mouse or stylus',
  stroke = '#0284c7',
  clearLabel = 'Clear',
  variant = 'staff',
}) {
  if (variant === 'fhir' || variant === 'modal') {
    return `
      <div class="bg-white border border-slate-200 rounded-xl p-4 mt-4 space-y-3">
        <div class="flex justify-between items-center">
          <span class="text-[10px] font-bold text-slate-800 uppercase tracking-wider">${label}</span>
          <button type="button" onclick="clearSignaturePad('${canvasId}')" class="text-rose-600 text-[10px] font-semibold hover:underline">${clearLabel}</button>
        </div>
        <div class="border border-slate-300 rounded bg-slate-50 h-28 relative overflow-hidden">
          <canvas id="${canvasId}" data-sig-pad data-sig-stroke="${stroke}"
            class="absolute inset-0 w-full h-full cursor-crosshair"></canvas>
          <div id="${canvasId}-prompt" class="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-[10px]">${hint}</div>
        </div>
      </div>`;
  }

  return '';
}

function getStaffSignatureDataUrl(patientId, formId, role) {
  const state = getFormState(patientId, formId);
  const patient = patientRegistry.find((p) => p.id === patientId);
  if (role === 'patient') {
    return state.patientSignatureDataUrl || patient?.signatureDataUrl || null;
  }
  return state.providerSignatureDataUrl || null;
}

function persistStaffSignature(patientId, formId, role, dataUrl) {
  const state = getFormState(patientId, formId);
  const patient = patientRegistry.find((p) => p.id === patientId);
  if (role === 'patient') {
    if (dataUrl) {
      state.patientSignatureDataUrl = dataUrl;
      state.patientSignatureAck = true;
      if (patient) {
        patient.signatureDataUrl = dataUrl;
        if (typeof initPatientFormWorkflow === 'function') {
          initPatientFormWorkflow(patient);
          patient.formWorkflow[formId].patientSigned = true;
        }
      }
    } else {
      delete state.patientSignatureDataUrl;
      state.patientSignatureAck = false;
      if (patient) {
        delete patient.signatureDataUrl;
        if (patient.formWorkflow?.[formId]) patient.formWorkflow[formId].patientSigned = false;
      }
    }
  } else if (dataUrl) {
    state.providerSignatureDataUrl = dataUrl;
  } else {
    delete state.providerSignatureDataUrl;
  }
}

function renderStaffSignatureButton(patientId, formId, role, label) {
  const signed = !!getStaffSignatureDataUrl(patientId, formId, role);
  const btnClass = role === 'patient'
    ? 'staff-sig-btn staff-sig-btn--patient'
    : 'staff-sig-btn staff-sig-btn--provider';
  const signedMark = signed ? '<span class="staff-sig-btn-check" aria-hidden="true">✓</span>' : '';
  return `<button type="button" class="${btnClass}${signed ? ' is-signed' : ''}"
    onclick="openStaffSignatureModal('${role}')">${label}${signedMark}</button>`;
}

function renderStaffSignatureSectionHtml(patientId, formId) {
  return `
    <div class="staff-signature-actions" id="staff-signature-actions"
      data-patient-id="${patientId}" data-form-id="${formId}">
      ${renderStaffSignatureButton(patientId, formId, 'patient', 'Patient Signature')}
      ${renderStaffSignatureButton(patientId, formId, 'provider', 'Provider Signature')}
    </div>`;
}

function refreshStaffSignatureCards() {
  const actions = document.getElementById('staff-signature-actions');
  if (!actions || typeof staffState === 'undefined' || !staffState.activePatientId) return;
  actions.outerHTML = renderStaffSignatureSectionHtml(
    staffState.activePatientId,
    staffState.selectedFormId
  );
}

function openStaffSignatureModal(role) {
  if (typeof staffState === 'undefined' || !staffState.activePatientId) return;
  const modal = document.getElementById('modal-staff-signature');
  const content = document.getElementById('modal-staff-signature-content');
  if (!modal || !content) return;

  const patientId = staffState.activePatientId;
  const formId = staffState.selectedFormId;
  const config = role === 'patient'
    ? {
      title: 'Patient signature',
      hint: 'Patient signs here (mouse or stylus)',
      stroke: '#7c3aed',
    }
    : {
      title: 'Provider signature',
      hint: 'Draw signature with mouse or stylus',
      stroke: '#0284c7',
    };

  staffSigModalState.role = role;
  staffSigModalState.patientId = patientId;
  staffSigModalState.formId = formId;
  staffSigModalState.stroke = config.stroke;

  const titleEl = document.getElementById('staff-sig-modal-title');
  const hintEl = document.getElementById('staff-sig-modal-hint');
  if (titleEl) titleEl.textContent = config.title;
  if (hintEl) hintEl.textContent = config.hint;

  const canvas = document.getElementById(STAFF_SIG_MODAL_CANVAS);
  if (canvas) {
    canvas.dataset.sigStroke = config.stroke;
    const prompt = getSigPadPrompt(STAFF_SIG_MODAL_CANVAS);
    if (prompt) {
      prompt.textContent = config.hint;
      prompt.classList.remove('hidden');
    }
  }

  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    content.classList.remove('scale-95', 'opacity-0');
    content.classList.add('scale-100', 'opacity-100');
    if (!sigPadInstances.has(STAFF_SIG_MODAL_CANVAS)) {
      bindSignaturePad(STAFF_SIG_MODAL_CANVAS, config.stroke);
    } else {
      const inst = sigPadInstances.get(STAFF_SIG_MODAL_CANVAS);
      if (inst) {
        inst.strokeStyle = config.stroke;
        inst.ctx.strokeStyle = config.stroke;
      }
    }
    resizeSignaturePad(STAFF_SIG_MODAL_CANVAS);
    const existing = getStaffSignatureDataUrl(patientId, formId, role);
    if (existing) restoreSignaturePad(STAFF_SIG_MODAL_CANVAS, existing);
    else clearSignaturePad(STAFF_SIG_MODAL_CANVAS);
  });
}

function closeStaffSignatureModal() {
  const modal = document.getElementById('modal-staff-signature');
  const content = document.getElementById('modal-staff-signature-content');
  if (!modal || !content) return;
  content.classList.remove('scale-100', 'opacity-100');
  content.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    modal.classList.add('hidden');
    staffSigModalState.role = null;
    staffSigModalState.patientId = null;
    staffSigModalState.formId = null;
  }, 200);
}

function saveStaffSignatureModal() {
  const { role, patientId, formId } = staffSigModalState;
  if (!role || !patientId || !formId) return;
  const dataUrl = getSignatureDataUrl(STAFF_SIG_MODAL_CANVAS);
  if (!dataUrl) {
    if (typeof showToast === 'function') {
      showToast('Signature needed', 'Draw a signature before saving.', 'info');
    }
    return;
  }
  persistStaffSignature(patientId, formId, role, dataUrl);
  closeStaffSignatureModal();
  refreshStaffSignatureCards();
  if (typeof refreshOfficialPdfViewer === 'function' && typeof staffState !== 'undefined' && staffState.activePatientId) {
    void refreshOfficialPdfViewer(staffState.activePatientId, staffState.selectedFormId);
  }
  if (typeof showToast === 'function') {
    showToast('Signature saved', `${role === 'patient' ? 'Patient' : 'Provider'} signature captured.`, 'success');
  }
}

function clearStaffSignatureModal() {
  clearSignaturePad(STAFF_SIG_MODAL_CANVAS);
}

window.initSignaturePad = initSignaturePad;
window.initSignaturePads = initSignaturePads;
window.clearClinicianSignature = clearClinicianSignature;
window.clearSignaturePad = clearSignaturePad;
window.getSignatureDataUrl = getSignatureDataUrl;
window.isSignaturePadEmpty = isSignaturePadEmpty;
window.restoreSignaturePad = restoreSignaturePad;

function handleSignaturePadResize() {
  sigPadInstances.forEach((_, canvasId) => resizeSignaturePad(canvasId));
}

window.destroyAllSignaturePads = destroyAllSignaturePads;
window.handleSignaturePadResize = handleSignaturePadResize;
window.captureSignaturesToFormState = captureSignaturesToFormState;
window.captureFhirSignaturesToFormState = captureFhirSignaturesToFormState;
window.renderSignaturePadHtml = renderSignaturePadHtml;
window.renderStaffSignatureSectionHtml = renderStaffSignatureSectionHtml;
window.openStaffSignatureModal = openStaffSignatureModal;
window.closeStaffSignatureModal = closeStaffSignatureModal;
window.saveStaffSignatureModal = saveStaffSignatureModal;
window.clearStaffSignatureModal = clearStaffSignatureModal;
window.refreshStaffSignatureCards = refreshStaffSignatureCards;
window.persistStaffSignature = persistStaffSignature;

function restoreStaffDrawerSignatures() {
  refreshStaffSignatureCards();
}

function restoreFhirSignatures(patientId, formId) {
  const state = getFormState(patientId, formId);
  const patient = patientRegistry.find((p) => p.id === patientId);
  const patientSig = state.patientSignatureDataUrl || patient?.signatureDataUrl;
  if (patientSig) restoreSignaturePad('sig-pad-patient', patientSig);
  if (state.providerSignatureDataUrl) restoreSignaturePad('sig-pad-clinician', state.providerSignatureDataUrl);
}

window.restoreStaffDrawerSignatures = restoreStaffDrawerSignatures;
window.restoreFhirSignatures = restoreFhirSignatures;
