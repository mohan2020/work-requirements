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
  const { patientPad = 'staff-sig-patient', providerPad = 'staff-sig-provider' } = padIds;

  const patientSig = getSignatureDataUrl(patientPad);
  if (patientSig) {
    state.patientSignatureDataUrl = patientSig;
    state.patientSignatureAck = true;
    if (patient) {
      patient.signatureDataUrl = patientSig;
      if (typeof initPatientFormWorkflow === 'function') {
        initPatientFormWorkflow(patient);
        patient.formWorkflow[formId].patientSigned = true;
      }
    }
  }

  const providerSig = getSignatureDataUrl(providerPad);
  if (providerSig) {
    state.providerSignatureDataUrl = providerSig;
  }

  return { patientSig, providerSig };
}

function captureFhirSignaturesToFormState(patientId, formId) {
  return captureSignaturesToFormState(patientId, formId, {
    patientPad: 'sig-pad-patient',
    providerPad: 'sig-pad-clinician',
  });
}

function renderSignaturePadHtml({
  canvasId,
  label,
  hint = 'Draw signature with mouse or stylus',
  stroke = '#0284c7',
  clearLabel = 'Clear',
  variant = 'staff',
}) {
  if (variant === 'fhir') {
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

  return `
    <div class="staff-sig-block">
      <div class="staff-sig-header">
        <span class="staff-sig-label">${label}</span>
        <button type="button" class="staff-sig-clear" onclick="clearSignaturePad('${canvasId}')">${clearLabel}</button>
      </div>
      <div class="staff-sig-canvas-wrap">
        <canvas id="${canvasId}" data-sig-pad data-sig-stroke="${stroke}"
          class="staff-sig-canvas"></canvas>
        <div id="${canvasId}-prompt" class="staff-sig-prompt">${hint}</div>
      </div>
    </div>`;
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

function restoreStaffDrawerSignatures(patientId, formId) {
  const state = getFormState(patientId, formId);
  const patient = patientRegistry.find((p) => p.id === patientId);
  const patientSig = state.patientSignatureDataUrl || patient?.signatureDataUrl;
  if (patientSig) restoreSignaturePad('staff-sig-patient', patientSig);
  if (state.providerSignatureDataUrl) restoreSignaturePad('staff-sig-provider', state.providerSignatureDataUrl);
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
