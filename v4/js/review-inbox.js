/**
 * Admin review inbox — CHW submissions (not linked in CHW nav).
 * Open with ?key= matching WR_ADMIN_VIEW_KEY on Vercel.
 */

function renderReviewInboxGate(hostEl) {
  const key = getAdminViewKey();
  if (!key) {
    hostEl.innerHTML = `
      <div class="card" style="padding:24px;max-width:480px">
        <h2 style="margin:0 0 8px;font-size:18px">Review inbox</h2>
        <p style="margin:0 0 16px;font-size:14px;color:var(--muted-foreground)">
          Admin access only. Open the bookmark your team lead shared — it includes an access key in the URL.
        </p>
        <p style="margin:0;font-size:12px;color:var(--muted-foreground)">
          Example: <code>review-inbox.html?key=…</code>
        </p>
      </div>`;
    return false;
  }
  return true;
}

async function renderReviewInbox(hostEl) {
  if (!hostEl) return;
  if (!renderReviewInboxGate(hostEl)) return;

  hostEl.innerHTML = '<p class="text-sm text-slate-500">Loading submissions…</p>';

  try {
    const data = await listReviewSubmissions();
    const items = data?.items || [];

    if (!items.length) {
      hostEl.innerHTML = `
        <div class="card" style="padding:20px">
          <p class="text-sm text-slate-600">No CHW submissions yet. When testers tap <strong>Submit for review</strong>, their PDFs appear here.</p>
        </div>`;
      return;
    }

    hostEl.innerHTML = `
      <div class="card" style="overflow:hidden">
        <div class="tbl-scroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>CHW</th>
                <th>Patient</th>
                <th>Form</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${items.map((e) => `
                <tr>
                  <td class="text-xs"><strong>${e.submittedBy || e.savedBy || '—'}</strong></td>
                  <td><strong>${e.patientName || '—'}</strong><div class="text-[10px] text-slate-500 mono">${e.patientId || ''}</div></td>
                  <td class="text-xs">${e.formTitle || e.formId || '—'}${e.percentComplete != null ? `<div class="text-[10px] text-slate-500">${e.percentComplete}%</div>` : ''}</td>
                  <td class="text-xs mono">${e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'}</td>
                  <td><a class="btn secondary sm" href="${reviewDownloadUrl(e.id)}" target="_blank" rel="noopener">Open</a></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <p class="text-[11px] text-slate-500 mt-3">${items.length} submission(s) · workspace <strong>${getWorkspaceId()}</strong></p>`;
  } catch (err) {
    hostEl.innerHTML = `
      <div class="card" style="padding:20px;color:var(--destructive,#b42318)">
        <p class="text-sm"><strong>Could not load inbox</strong> — ${err.message}</p>
        <p class="text-xs mt-2 text-slate-600">Check that <code>WR_ADMIN_VIEW_KEY</code> matches the <code>?key=</code> in this URL and that Vercel Blob is connected.</p>
      </div>`;
  }
}

function renderAdminMappingFooter() {
  if (!isAdminContext()) return '';
  return `
    <div class="admin-mapping-bar">
      <span>Admin mode — saves publish to shared workspace <strong>${getWorkspaceId()}</strong></span>
      ${getApiToken() ? '' : '<span class="warn">Set API token via <code>?admin=1&amp;token=…</code> once to publish mappings.</span>'}
    </div>`;
}

function captureAdminTokenFromUrl() {
  if (!isAdminContext()) return;
  try {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) setAdminApiToken(token);
  } catch {
    /* ignore */
  }
}

window.renderReviewInbox = renderReviewInbox;
window.renderAdminMappingFooter = renderAdminMappingFooter;
window.captureAdminTokenFromUrl = captureAdminTokenFromUrl;
