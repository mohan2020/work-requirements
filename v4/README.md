# PA Medicaid Exemption Workspace — v4

Interactive HTML prototype for Penn Medicine's PA Medicaid **community engagement (80-hour work) exemption** workflow. Static site deployable via Vercel; requires a local server for PDF `fetch()`.

## Quick start

```bash
cd prototype/v4
npx serve .
# → http://localhost:3000/index.html
```

> Do not open via `file://` — PDF templates and asset loading require HTTP.

## Deployment modes (index.html)

| Mode | Audience | UI |
|------|----------|-----|
| **Independent staff dashboard** | CHWs, population health | Engage Vivid shell — worklist + 3-panel outreach drawer |
| **SMART on FHIR (clinician)** | Providers in Epic | Same exemption questionnaires as staff — pre-fill, save to chart, provider sign-off |

Toggle via the bar at the top of the page.

---

## Official forms policy

**We do not generate synthetic PDFs that mimic DHS forms.** PDF export uses only official templates from Pennsylvania DHS.

| Form | Official PDF? | v4 behavior |
|------|---------------|-------------|
| **PA 1663** (Employability Assessment) | **Yes** — [official DHS PDF](https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/docs/documents/ma-response-forms/Employability%20Assessment%20Form.pdf) | Bundled at `assets/PA_1663_official.pdf` (38 AcroForm fields). Pre-fill via pdf-lib. |
| **Medical Frailty Attestation** | **No** — not published by PA DHS for HR1 work requirements as of June 2026 | HTML questionnaire only. PA's [medical frailty overview](https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/medicaid/hr1-related/2026-05-may-pa-medical-frailty-overview-presentation.pdf) describes claims/EHR-first verification via P3N. |

When DHS publishes the Medical Frailty PDF: drop in `assets/`, update `forms-manifest.json`, add `js/pa-mf-field-map.js`, wire export in `pdf-export.js`.

---

## Staff worklist (Engage UI)

The staff dashboard uses the **Engage Vivid** design system (`css/engage/kit.css`, bundled from the Penn design repo).

### Worklist

- Collapsible navy **left nav** (persists in `localStorage`)
- Metric cards: cohort size, exemptions validated, pending signature
- Filterable worklist table with **play button** per row (Engage pattern)
- Click row or play → opens **3-panel drawer** without blocking the worklist

### 3-panel outreach drawer

| Panel | Content |
|-------|---------|
| **Left — Patient context** | Demographics, phone, CAO, clinical summary, outreach dates (collapsible) |
| **Center — Patient outreach** | Outreach workflow + exemption forms |
| **Right — Saved & attempts** | Prior outreach log + saved form drafts |

**Center column flow:**

1. **Outreach type** *(required)* — Inbound call, Outbound call, or MPM
2. **Call now** — green button appears when **Outbound call** is selected (placeholder: toast simulates dial via org telephony)
3. **Reached patient** *(required)* — Yes / No
4. **Call notes** — free-text documentation
5. **Exemption forms** *(if reached = Yes)* — form dropdown; when an official DHS PDF exists (PA 1663), the **official form is shown inline** with EHR-mapped fields pre-filled — not HTML inputs. Staff complete remaining fields and signatures on the PDF, then save or download. Medical Frailty stays HTML until DHS publishes an official PDF.
6. **Log attempt** *(if reached = No)* — next outreach date + notes → updates worklist

Form drafts persist per patient in `localStorage` via `js/mapping-storage.js`.

---

## SMART on FHIR (clinician)

Uses the **same questionnaires** as the staff drawer (`FORM_SCHEMAS` + `form-engine.js`). No separate attestation UI.

| Step | Action |
|------|--------|
| Open patient | CHW partial drafts load automatically (`applyDraftToFormState`) |
| Review / edit | Medical Frailty or PA 1663 tab — all sections pre-filled from EHR + outreach |
| Save to chart | `fhirSaveToChart()` — persists as finalized submission in `localStorage` |
| Sign | Provider signature pad → `fhirClinicianSignOff()` — sets `patient.formWorkflow[formId].clinicianSigned` |
| Staff sync | Worklist shows `85% · CHW draft`, `· in chart`, or `· signed` |

**Patient signature (Section A) — TBD.** Patient self-declaration fields can be pre-filled during CHW outreach; capture workflow (wet ink, e-sign, in-clinic tablet) is deferred.

Clinical context sidebar: patient summary + **ICD-10 problem list** (no SNOMED translation layer).

---

## Clinical data (ICD-10 only)

Patients carry `icdCodes: [{ code, desc }, …]` on the problem list. Pre-fill, tier logic, and FHIR display use ICD-10 directly — there is no SNOMED-to-ICD mapping step.

---

## Form field mapping wizard

**`form-mapping-wizard.html`** — admin wizard for mapping official PDF AcroForm fields to EHR data.

| Step | Purpose |
|------|---------|
| 1. EHR fields | Browse SMART-on-FHIR field catalog. Blue pills are **example values only**. |
| 2. Upload PDF | Full-size drop zone + bundled PA 1663 template |
| 3. Map fields | Click a PDF field chip → see PDF value → searchable EHR field dropdown (Manual / Skip options) |
| 4. Preview | Sample filled PDF (Jane Doe demo data) |
| 5. Save | Full mapping summary table + version history (localStorage + IndexedDB for PDF blob) |

Link from staff sidebar: **Form mapping**.

Legacy dev page **`form-mapping.html`** remains for code-level PDF↔app gap analysis.

---

## File layout

```
v4/
├── index.html                  # Main app (staff + FHIR modes)
├── form-mapping-wizard.html    # Admin mapping wizard
├── form-mapping.html           # Legacy gap-analysis page
├── context.md                  # AI / developer context
├── css/
│   ├── engage/                 # Bundled Engage Vivid kit + tokens
│   ├── staff-engage.css        # Staff dashboard overrides
│   └── mapping-wizard.css      # Wizard styles
├── js/
│   ├── staff-workflow.js       # Engage worklist + 3-panel drawer
│   ├── fhir-workflow.js        # SMART on FHIR — shared forms, chart save, sign-off
│   ├── form-schemas.js         # PA_MF, PA_1663 questionnaires
│   ├── form-engine.js          # Pre-fill, render, state (ICD-10 problem list)
│   ├── mapping-storage.js      # Mapping versions + per-patient drafts
│   ├── ehr-field-catalog.js    # EHR field catalog for wizard
│   ├── mapping-wizard.js       # Wizard logic (click-to-map UI)
│   ├── pa-1663-field-map.js    # App → PA 1663 AcroForm names
│   ├── form-field-mapper.js    # Gap analysis for form-mapping.html
│   ├── pdf-form-fill.js        # Mapping + patient → official PDF bytes
│   ├── official-pdf-viewer.js  # Inline official PDF in drawer / FHIR
│   ├── pdf-export.js           # Official PDF fill only
└── assets/
    ├── forms-manifest.json
    ├── form-field-inventory.json
    └── w2h-mark-white.svg
```

---

## Shared form state

Staff and FHIR read/write the same in-memory + `localStorage` form state:

- `getFormState(patientId, formId)` — single source of truth
- CHW **Save partial draft** → FHIR loads on patient open
- Clinician **Save to chart** / **Sign** → staff worklist reflects status via `patient.formWorkflow`

---

## Deploy

```bash
cd prototype/v4
npx serve .
npx vercel deploy --prod   # vercel.json serves full static site (not index.html only)
```

## Related docs

- `context.md` — component map for AI agents
- `../Overview.md` — executive proposal source
- `../PA_Medicaid_Exemption_Workspace_Proposal.docx` — shareable Word doc (regenerate via `../scripts/build-document.mjs`)
