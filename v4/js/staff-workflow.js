/**
 * Staff worklist + Engage-style 3-panel outreach/form drawer.
 */
const STAFF_NAV_KEY = 'exemption-nav-collapsed';

function initStaffNavCollapse() {
  const collapsed = localStorage.getItem(STAFF_NAV_KEY) === '1';
  applyStaffNavCollapsed(collapsed);
}

function toggleStaffNavCollapse() {
  const app = document.getElementById('staff-app');
  const collapsed = !app?.classList.contains('nav-collapsed');
  applyStaffNavCollapsed(collapsed);
  localStorage.setItem(STAFF_NAV_KEY, collapsed ? '1' : '0');
}

function applyStaffNavCollapsed(collapsed) {
  const app = document.getElementById('staff-app');
  const btn = document.getElementById('staff-nav-toggle');
  if (!app) return;
  app.classList.toggle('nav-collapsed', collapsed);
  if (btn) {
    btn.title = collapsed ? 'Expand navigation' : 'Collapse navigation';
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = collapsed
      ? '<i data-lucide="panel-left-open" style="width:18px;height:18px"></i>'
      : '<i data-lucide="panel-left-close" style="width:18px;height:18px"></i>';
    if (window.lucide) lucide.createIcons();
  }
}

window.toggleStaffNavCollapse = toggleStaffNavCollapse;
window.initStaffNavCollapse = initStaffNavCollapse;

const STAFF_FORMS = [
  { id: 'PA_MF', label: 'Medical Frailty Attestation' },
  { id: 'PA_1663', label: 'PA 1663 — Employability Assessment' },
];

const STAFF_OUTREACH_TYPES = [
  'Inbound call',
  'Outbound call',
  'MPM',
];

const staffState = {
  activePatientId: null,
  ctxCollapsed: false,
  outreachType: 'Outbound call',
  reached: null,
  callNotes: '',
  selectedFormId: 'PA_MF',
  nextOutreachDate: '',
  outreachNotes: '',
};

function staffIcon(name, size = 18) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
}

function getPatient(id) {
  return patientRegistry.find((p) => p.id === id);
}

function exemptionBadge(p) {
  const s = p.exemptionStatus;
  if (s === 'ELIGIBLE_TIER_1') return '<span class="staff-exempt-badge t1">Tier 1 auto-exempt</span>';
  if (s === 'ELIGIBLE_TIER_2') return '<span class="staff-exempt-badge t2">Tier 2 comorbidity</span>';
  if (s === 'EXEMPT_COMPLETED') return '<span class="staff-exempt-badge done">Exemption filed</span>';
  return `<span class="staff-exempt-badge other">${s.replace(/_/g, ' ')}</span>`;
}

function formatOutreachDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formProgressLabel(patientId, formId) {
  if (typeof formWorkflowLabel === 'function') return formWorkflowLabel(patientId, formId);
  const c = getFormCompletion(patientId, formId);
  return `${c.percent}%`;
}

function analyzeFormFields(patientId, formId) {
  const state = getFormState(patientId, formId);
  const schema = FORM_SCHEMAS[formId];
  const filled = [];
  const remaining = [];
  if (!schema) return { filled, remaining };

  schema.sections.forEach((section) => {
    section.fields.forEach((field) => {
      const val = state[field.id];
      let hasValue = false;
      if (field.type === 'checkbox') hasValue = !!val;
      else hasValue = val !== undefined && val !== null && String(val).trim() !== '';

      const item = { ...field, section: section.title, value: val };
      if (hasValue) filled.push(item);
      else remaining.push(item);
    });
  });
  return { filled, remaining };
}

function renderStaffWorklistRows(data) {
  const tbody = document.getElementById('worklist-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  data.forEach((p) => {
    const isActive = staffState.activePatientId === p.id;
    const mfPct = formProgressLabel(p.id, 'PA_MF');
    const f1663Pct = formProgressLabel(p.id, 'PA_1663');
    tbody.insertAdjacentHTML('beforeend', `
      <tr class="${isActive ? 'row-active' : ''}" data-patient-id="${p.id}" onclick="openStaffDrawer('${p.id}')" style="cursor:pointer">
        <td class="col-actions">
          <button type="button" class="play-btn${isActive ? ' active' : ''}" title="Start outreach"
            onclick="event.stopPropagation(); openStaffDrawer('${p.id}')">
            ${staffIcon(isActive ? 'pause' : 'play', 13)}
          </button>
        </td>
        <td class="col-part">
          <div class="person">
            <span class="av" style="width:34px;height:34px;font-size:12px">${p.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
            <span>
              <span class="nm">${p.name}</span>
              <span class="id mono">${p.medicaidId}</span>
            </span>
          </div>
        </td>
        <td>${exemptionBadge(p)}</td>
        <td class="mono" style="font-size:12px">${p.caoOffice.replace('Philadelphia CAO - ', 'Phila ')}</td>
        <td>${formatOutreachDate(p.nextOutreachDate)}</td>
        <td><span class="status">${p.outreachStatus.replace(/_/g, ' ')}</span></td>
        <td class="staff-progress">MF <strong>${mfPct}</strong> · 1663 <strong>${f1663Pct}</strong></td>
      </tr>`);
  });

  document.getElementById('tbl-rendered-count').textContent = data.length;
  document.getElementById('tbl-total-count').textContent = patientRegistry.length;
  if (window.lucide) lucide.createIcons();
}

function openStaffDrawer(patientId) {
  const p = getPatient(patientId);
  if (!p) return;

  staffState.activePatientId = patientId;
  staffState.outreachType = 'Outbound call';
  staffState.reached = null;
  staffState.callNotes = '';
  staffState.selectedFormId = 'PA_MF';
  staffState.nextOutreachDate = p.nextOutreachDate || '';
  staffState.outreachNotes = '';

  ['PA_MF', 'PA_1663'].forEach((fid) => applyDraftToFormState(patientId, fid));

  renderStaffDrawer();
  renderStaffWorklistRows(getFilteredPatients());
}

function closeStaffDrawer() {
  staffState.activePatientId = null;
  document.removeEventListener('keydown', staffEscHandler);
  const root = document.getElementById('staff-drawer-root');
  if (root) root.innerHTML = '';
  renderStaffWorklistRows(getFilteredPatients());
}

function toggleStaffCtx() {
  staffState.ctxCollapsed = !staffState.ctxCollapsed;
  renderStaffDrawer();
}

function setStaffOutreachType(type) {
  staffState.outreachType = type;
  refreshStaffDrawerCenter();
}

function setStaffReached(val) {
  staffState.reached = val;
  refreshStaffDrawerCenter();
}

function setStaffForm(formId) {
  staffState.selectedFormId = formId;
  refreshStaffDrawerCenter();
}

function refreshStaffDrawerCenter() {
  const panel = document.getElementById('staff-od-panel');
  const formCol = panel?.querySelector('.od-col.form');
  if (formCol) {
    formCol.outerHTML = renderStaffDrawerCenter();
    if (window.lucide) lucide.createIcons();
  }
}

function renderStaffDrawer() {
  const p = getPatient(staffState.activePatientId);
  if (!p) return;
  const root = document.getElementById('staff-drawer-root');
  const collapsed = staffState.ctxCollapsed ? ' ctx-collapsed' : '';

  root.innerHTML = `
    <div class="od-scrim">
      <div class="od-panel${collapsed}" id="staff-od-panel">
        ${renderStaffDrawerContext(p)}
        ${renderStaffDrawerCenter()}
        ${renderStaffDrawerPrior(p)}
      </div>
    </div>`;

  if (window.lucide) lucide.createIcons();
  bindStaffDrawerEvents();
}

function renderStaffDrawerContext(p) {
  return `
    <section class="od-col ctx">
      <header class="od-head navy">
        <span class="ttl">${staffIcon('user', 18)} Patient context</span>
        <button type="button" class="od-hbtn" title="${staffState.ctxCollapsed ? 'Expand' : 'Collapse'}" onclick="toggleStaffCtx()">
          ${staffIcon(staffState.ctxCollapsed ? 'chevron-right' : 'chevron-left', 18)}
        </button>
      </header>
      ${staffState.ctxCollapsed ? '' : `
      <div class="od-body ctx-body">
        <h2 class="ctx-name">${p.name.split(' ')[0]} ${p.name.split(' ').slice(-1)[0]?.[0] || ''}.</h2>
        <div class="od-fields">
          <div class="od-field"><span class="k">Legal name</span><span class="v">${p.name}</span></div>
          <div class="od-field"><span class="k">MRN</span><span class="v mono">${p.mrn}</span></div>
          <div class="od-field"><span class="k">Medicaid ID</span><span class="v mono">${p.medicaidId}</span></div>
          <div class="od-field"><span class="k">DOB</span><span class="v mono">${p.dob}</span></div>
          <div class="od-field"><span class="k">Phone</span><span class="v mono">${p.phone || '—'}</span></div>
          <div class="od-field"><span class="k">CAO</span><span class="v">${p.caoOffice}</span></div>
        </div>
        <div class="od-permnote">
          <span class="k">Clinical summary</span>
          <p>${p.rationale || '—'}</p>
        </div>
        <div class="od-fields divided">
          <div class="od-field"><span class="k">Exemption</span><span class="v">${p.exemptionStatus.replace(/_/g, ' ')}</span></div>
          <div class="od-field"><span class="k">Last outreach</span><span class="v mono">${formatOutreachDate(p.lastOutreachDate)}</span></div>
          <div class="od-field"><span class="k">Next outreach</span><span class="v mono">${formatOutreachDate(p.nextOutreachDate)}</span></div>
        </div>
      </div>`}
    </section>`;
}

function renderStaffOutreachTypeBlock() {
  const isOutbound = staffState.outreachType === 'Outbound call';
  const radios = STAFF_OUTREACH_TYPES.map((type) => `
    <label class="staff-radio">
      <input type="radio" name="staff-outreach-type" value="${type}"
        ${staffState.outreachType === type ? 'checked' : ''}
        onchange="setStaffOutreachType('${type}')">
      <span>${type}</span>
    </label>`).join('');

  return `
    <div class="od-group">
      <label>Outreach type <span class="staff-req">*</span></label>
      <div class="staff-radio-grid">${radios}</div>
      ${isOutbound ? `
        <button type="button" class="staff-call-now" onclick="staffCallNow()">
          ${staffIcon('phone', 18)} Call now
        </button>
        <p class="staff-call-hint">Placeholder — initiates outbound call via integrated dialer (Twilio / Epic telephony).</p>` : ''}
    </div>`;
}

function staffCallNow() {
  const p = getPatient(staffState.activePatientId);
  if (!p) return;
  showToast(
    'Call initiated (placeholder)',
    `Dialing ${p.phone || 'patient phone on file'} for ${p.name}. In production this connects to your organization telephony integration.`,
    'info'
  );
}

function renderStaffDrawerCenter() {
  const p = getPatient(staffState.activePatientId);
  if (!p) return '';

  const reachedYes = staffState.reached === 'Yes';
  const reachedNo = staffState.reached === 'No';

  let formBlock = '';
  if (reachedYes) {
    const { filled, remaining } = analyzeFormFields(p.id, staffState.selectedFormId);
    const completion = getFormCompletion(p.id, staffState.selectedFormId);
    const formOptions = STAFF_FORMS.map((f) =>
      `<option value="${f.id}" ${staffState.selectedFormId === f.id ? 'selected' : ''}>${f.label}</option>`
    ).join('');

    formBlock = `
      <div class="od-group">
        <label>Exemption form</label>
        <div class="od-select-row">
          <select id="staff-form-select" onchange="setStaffForm(this.value)">${formOptions}</select>
          ${staffIcon('chevron-down', 16)}
        </div>
      </div>
      <div class="staff-form-progress">
        <span><strong>${completion.filled}</strong> of <strong>${completion.total}</strong> fields</span>
        <div class="bar"><div class="bar-fill" style="width:${completion.percent}%"></div></div>
        <span>${completion.percent}%</span>
      </div>
      <div class="staff-field-group">
        <h4>Pre-filled from EHR (${filled.length})</h4>
        <div class="staff-field-list">${renderStaffFieldItems(p.id, staffState.selectedFormId, filled, true)}</div>
      </div>
      <div class="staff-field-group">
        <h4>Still needed (${remaining.length})</h4>
        <div class="staff-field-list">${renderStaffFieldItems(p.id, staffState.selectedFormId, remaining, false)}</div>
      </div>
      <div class="staff-drawer-actions">
        <div class="btn-row">
          <button type="button" class="staff-btn-secondary" onclick="staffSavePartial()">Save partial draft</button>
          <button type="button" class="staff-btn-secondary" onclick="staffSaveAndDownload()">Save &amp; download for print</button>
        </div>
      </div>`;
  } else if (reachedNo) {
    formBlock = `
      <div class="staff-unreachable-panel">
        <p>Patient was not reached. Log the attempt and schedule the next outreach date.</p>
        <div class="od-group">
          <label>Next outreach date</label>
          <input type="date" class="od-input" id="staff-next-outreach" value="${staffState.nextOutreachDate || ''}">
        </div>
        <div class="od-group">
          <label>Attempt notes</label>
          <textarea class="od-input" id="staff-outreach-notes" rows="3" placeholder="Voicemail, wrong number, requested callback…">${staffState.outreachNotes}</textarea>
        </div>
        <button type="button" class="od-save" onclick="staffLogUnreachable()">Log attempt &amp; close</button>
      </div>`;
  } else {
    formBlock = `<div class="od-empty-inline">Select whether you reached the patient to continue with forms or log an attempt.</div>`;
  }

  return `
    <section class="od-col form">
      <header class="od-head navy">
        <span class="ttl">${staffIcon('phone-call', 18)} Patient outreach</span>
        <button type="button" class="od-hbtn" title="Close" onclick="closeStaffDrawer()">${staffIcon('x', 20)}</button>
      </header>
      <div class="od-body form-body">
        ${renderStaffOutreachTypeBlock()}
        <div class="od-group">
          <label>Reached patient <span class="staff-req">*</span></label>
          <div class="od-pills">
            <button type="button" class="od-pill yn${reachedYes ? ' active' : ''}" onclick="setStaffReached('Yes')">Yes, reached the patient</button>
            <button type="button" class="od-pill yn${reachedNo ? ' active' : ''}" onclick="setStaffReached('No')">No, did not reach the patient</button>
          </div>
        </div>
        <div class="od-group">
          <label>Call notes</label>
          <textarea class="od-input" rows="3" placeholder="Document conversation, voicemail, or callback request…"
            oninput="staffState.callNotes = this.value">${staffState.callNotes}</textarea>
        </div>
        ${reachedYes || reachedNo ? '<div class="staff-section-divider"><span>Exemption forms</span></div>' : ''}
        ${formBlock}
      </div>
    </section>`;
}

function renderStaffFieldItems(patientId, formId, fields, isFilled) {
  if (!fields.length) {
    return `<div class="staff-prior-empty">${isFilled ? 'No pre-filled fields yet.' : 'All fields complete for this form.'}</div>`;
  }
  return fields.map((field) => {
    const cls = isFilled ? 'filled' : 'remaining';
    if (isFilled) {
      const display = field.type === 'checkbox' ? (field.value ? 'Yes' : 'No') : String(field.value).substring(0, 200);
      return `
        <div class="staff-field-item ${cls}">
          <div class="lbl">${field.label}</div>
          <div class="val">${display || '—'}</div>
        </div>`;
    }
    return `
      <div class="staff-field-item ${cls}">
        <div class="lbl">${field.label}${field.required ? ' *' : ''}</div>
        ${renderStaffFieldInput(patientId, formId, field)}
      </div>`;
  }).join('');
}

function renderStaffFieldInput(patientId, formId, field) {
  const val = getFormState(patientId, formId)[field.id] ?? '';
  const onChange = `staffFieldChange('${patientId}','${formId}','${field.id}', this)`;
  if (field.type === 'textarea') {
    return `<textarea oninput="${onChange}">${val}</textarea>`;
  }
  if (field.type === 'checkbox') {
    return `<label style="display:flex;gap:8px;align-items:center;font-size:13px;">
      <input type="checkbox" ${val ? 'checked' : ''} onchange="${onChange}"> Confirm</label>`;
  }
  const type = field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : 'text';
  return `<input type="${type}" value="${val}" oninput="${onChange}">`;
}

function staffFieldChange(patientId, formId, fieldId, el) {
  let value;
  if (el.type === 'checkbox') value = el.checked;
  else value = el.value;
  saveFormField(patientId, formId, fieldId, value);
  const progress = document.querySelector('.staff-form-progress');
  if (progress && staffState.selectedFormId === formId) {
    const c = getFormCompletion(patientId, formId);
    progress.innerHTML = `
      <span><strong>${c.filled}</strong> of <strong>${c.total}</strong> fields</span>
      <div class="bar"><div class="bar-fill" style="width:${c.percent}%"></div></div>
      <span>${c.percent}%</span>`;
  }
}

function renderStaffDrawerPrior(p) {
  const submissions = getPatientSubmissions(p.id);
  const priorHtml = submissions.length
    ? submissions.slice(0, 5).map((sub, i) => `
        <div class="od-prior">
          <button type="button" class="od-prior-head" onclick="this.nextElementSibling.classList.toggle('hidden')">
            <span class="dir">${staffIcon('file-text', 16)} ${sub.meta?.label || sub.formId}</span>
            <span class="when">${new Date(sub.savedAt).toLocaleDateString()} ${staffIcon('chevron-down', 15)}</span>
          </button>
          <div class="od-prior-body${i === 0 ? '' : ' hidden'}">
            <div class="od-status">${sub.meta?.isDraft ? 'Draft' : 'Complete'} · ${sub.meta?.percentComplete ?? '—'}%${(() => {
              if (typeof initPatientFormWorkflow !== 'function') return '';
              const wf = initPatientFormWorkflow(p)[sub.formId];
              if (wf?.clinicianSigned) return ' · Clinician signed';
              if (wf?.savedToChart) return ' · In chart';
              return '';
            })()}</div>
            <div class="od-chips">
              <span class="od-chip form">${sub.formId}</span>
            </div>
          </div>
        </div>`).join('')
    : `<div class="staff-prior-empty">No saved form drafts for this patient yet.</div>`;

  const log = p.outreachLog || [];
  const logHtml = log.length
    ? log.slice(0, 4).map((entry) => `
        <div class="od-prior">
          <div class="od-prior-head" style="cursor:default">
            <span class="dir">${staffIcon('phone-outgoing', 16)} ${entry.reached ? 'Reached' : 'No answer'}</span>
            <span class="when">${entry.date}</span>
          </div>
          <div class="od-prior-body">
            <div class="od-status">${entry.notes || 'Attempt logged'}</div>
          </div>
        </div>`).join('')
    : '';

  return `
    <section class="od-col prior">
      <header class="od-head light">
        <span class="ttl">${staffIcon('history', 18)} Saved &amp; attempts</span>
      </header>
      <div class="od-body prior-body">
        ${logHtml}
        ${priorHtml}
      </div>
    </section>`;
}

function bindStaffDrawerEvents() {
  document.removeEventListener('keydown', staffEscHandler);
  document.addEventListener('keydown', staffEscHandler);
}

function staffEscHandler(e) {
  if (e.key === 'Escape' && staffState.activePatientId) closeStaffDrawer();
}

function staffSavePartial() {
  const pid = staffState.activePatientId;
  const fid = staffState.selectedFormId;
  if (!pid || !fid) return;
  const completion = getFormCompletion(pid, fid);
  saveFormSubmission(pid, fid, getFormState(pid, fid), { percentComplete: completion.percent });
  showToast('Draft saved', `${FORM_SCHEMAS[fid].shortTitle} — ${completion.percent}% complete.`, 'success');
  renderStaffDrawer();
}

async function staffSaveAndDownload() {
  const pid = staffState.activePatientId;
  const fid = staffState.selectedFormId;
  if (!pid || !fid) return;
  staffSavePartial();
  finalizeFormSubmission(pid, fid);
  if (fid === 'PA_1663' && typeof exportOfficialPA1663 === 'function') {
    await exportOfficialPA1663(pid);
  } else {
    showToast('Download ready', `${FORM_SCHEMAS[fid].shortTitle} saved. PDF export placeholder — official template not available for this form yet.`, 'info');
  }
  renderStaffDrawer();
}

function staffLogUnreachable() {
  const p = getPatient(staffState.activePatientId);
  if (!p) return;
  const nextEl = document.getElementById('staff-next-outreach');
  const notesEl = document.getElementById('staff-outreach-notes');
  const nextDate = nextEl?.value || staffState.nextOutreachDate;
  const notes = notesEl?.value?.trim() || 'Unable to reach patient';

  p.outreachLog = p.outreachLog || [];
  p.outreachLog.unshift({
    date: new Date().toLocaleDateString('en-US'),
    reached: false,
    outreachType: staffState.outreachType,
    notes: notes || staffState.callNotes,
    nextOutreach: nextDate,
  });
  p.lastOutreachDate = new Date().toISOString().split('T')[0];
  if (nextDate) p.nextOutreachDate = nextDate;
  p.outreachStatus = 'ATTEMPT_LOGGED';

  showToast('Attempt logged', `Next outreach scheduled for ${formatOutreachDate(nextDate)}.`, 'info');
  closeStaffDrawer();
  updateDashboardMetrics();
  filterRegistryWorklist();
}

function getFilteredPatients() {
  const searchVal = (document.getElementById('worklist-search')?.value || '').toLowerCase();
  const filterExempt = document.getElementById('filter-exemption-status')?.value || 'ALL';
  const filterCao = document.getElementById('filter-cao')?.value || 'ALL';
  return patientRegistry.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchVal) || p.mrn.includes(searchVal) || p.medicaidId.toLowerCase().includes(searchVal);
    const matchesStatus = filterExempt === 'ALL' || p.exemptionStatus === filterExempt;
    const matchesCao = filterCao === 'ALL' || p.caoOffice === filterCao;
    return matchesSearch && matchesStatus && matchesCao;
  });
}

window.openStaffDrawer = openStaffDrawer;
window.closeStaffDrawer = closeStaffDrawer;
window.toggleStaffCtx = toggleStaffCtx;
window.setStaffOutreachType = setStaffOutreachType;
window.staffCallNow = staffCallNow;
window.setStaffReached = setStaffReached;
window.setStaffForm = setStaffForm;
window.staffFieldChange = staffFieldChange;
window.staffSavePartial = staffSavePartial;
window.staffSaveAndDownload = staffSaveAndDownload;
window.staffLogUnreachable = staffLogUnreachable;
window.renderStaffWorklistRows = renderStaffWorklistRows;
window.getFilteredPatients = getFilteredPatients;
