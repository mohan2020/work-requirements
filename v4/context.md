# PA Medicaid Exemption Workspace v4 — AI Context

> Read this file first. Describes v4 layout, components, and conventions.

## Purpose

Interactive HTML prototype for Penn Medicine's PA Medicaid **community engagement (80-hour work) exemption** workflow. Two deployment personas:

1. **Staff Dashboard** — CHWs / population health: Engage worklist, outreach drawer, exemption form fill.
2. **SMART on FHIR POC App** — Clinicians: same exemption forms as staff, save to chart, provider sign-off, HIO queue (prototype).

Path: `prototype/v4/`. Static deploy (Vercel). Run `npx serve .` — do not use `file://`.

## Directory structure

```
v4/
├── index.html                  # Main shell (~1700 lines inline JS + modules)
├── form-mapping-wizard.html    # Admin: EHR catalog → upload PDF → map → preview → save
├── form-mapping.html           # Legacy: PDF↔app gap analysis table
├── context.md                  # This file
├── README.md
├── css/
│   ├── engage/kit.css          # Bundled Engage Vivid UI kit
│   ├── engage/colors_and_type.css
│   ├── staff-engage.css        # Staff overrides (drawer form panels, call now, nav)
│   └── mapping-wizard.css
├── js/
│   ├── staff-workflow.js       # ★ Staff worklist + 3-panel drawer (primary staff UI)
│   ├── fhir-workflow.js        # ★ SMART on FHIR — shared forms, chart save, sign-off
│   ├── form-schemas.js         # FORM_SCHEMAS: PA_MF, PA_1663
│   ├── form-engine.js          # Pre-fill (ICD-10), renderFormQuestionnaire, state
│   ├── mapping-storage.js      # Mapping versions + per-patient form drafts
│   ├── ehr-field-catalog.js    # EHR field catalog (wizard step 1)
│   ├── mapping-wizard.js       # Wizard step logic
│   ├── pa-1663-field-map.js    # App fields → PA 1663 AcroForm names
│   ├── form-field-mapper.js    # analyzeAllFormsFromManifest() for form-mapping.html
│   └── pdf-export.js           # Official PDF fill only (pdf-lib CDN)
└── assets/
    ├── PA_1663_official.pdf      # Official DHS template (when present)
    ├── forms-manifest.json
    └── form-field-inventory.json
```

Legacy: `prototype/pa_medicaid_exemption_workspace.v3.html`

## Official forms policy

| Form | Official PDF | Export |
|------|--------------|--------|
| **PA 1663** | Yes — `assets/PA_1663_official.pdf` | `exportOfficialPA1663()` |
| **Medical Frailty** | Not published (June 2026) | HTML questionnaire only |

Never generate synthetic DHS-mimic PDFs.

## Runtime architecture (index.html)

### Mode switcher

- `dashboard` → `#standalone-app-frame` (Engage staff app)
- `fhir` → `#epic-ehr-frame` (clinician SMART app)

Global state (inline in index.html):

- `patientRegistry` — mock cohort; each patient has `icdCodes: [{ code, desc }]` (no SNOMED layer)
- `patient.formWorkflow` — per-form `{ savedToChart, clinicianSigned, patientSigned }` (patient sign TBD)
- `activeRunMode`, `currentPatientFHIRId`, `fhirFormState.activeFormId`

Modules loaded before inline scripts: `form-schemas.js`, `pa-1663-field-map.js`, `mapping-storage.js`, `form-engine.js`, `pdf-export.js`, `staff-workflow.js`, `fhir-workflow.js`.

### Staff dashboard (Engage UI)

**Shell:** `#staff-app.app` — sidebar (collapsible via `nav-collapsed`, persisted `exemption-nav-collapsed`), topbar search, worklist table.

**Worklist:** `renderStaffWorklistRows()` — play button, form progress via `formWorkflowLabel()` (`· CHW draft`, `· in chart`, `· signed`).

**3-panel drawer:** `#staff-drawer-root` — Engage `od-panel` layout.

| Column | Renderer | Notes |
|--------|----------|-------|
| Context | `renderStaffDrawerContext()` | Collapsible patient summary |
| Outreach | `renderStaffDrawerCenter()` | Outreach type → call now → reached → notes → forms |
| History | `renderStaffDrawerPrior()` | `outreachLog[]` on patient + localStorage drafts |

**Staff drawer state** (`staffState` in `staff-workflow.js`):

```js
{
  activePatientId, ctxCollapsed,
  outreachType,      // default 'Outbound call'
  reached,           // 'Yes' | 'No' | null
  callNotes,
  selectedFormId,    // 'PA_MF' | 'PA_1663'
  nextOutreachDate, outreachNotes
}
```

**Outreach type options:** Inbound call, Outbound call, MPM.

**Call now:** Shown when `outreachType === 'Outbound call'`. `staffCallNow()` → toast placeholder (Twilio/Epic telephony in production).

**Reached = Yes:** Form dropdown, split pre-filled / remaining fields, `staffSavePartial()`, `staffSaveAndDownload()`.

**Reached = No:** Next outreach date, `staffLogUnreachable()` → updates `patient.outreachLog`, `outreachStatus`, closes drawer.

**Open/close:** `openStaffDrawer(patientId)`, `closeStaffDrawer()`. Escape key closes. Click another row swaps patient.

### FHIR mode (`js/fhir-workflow.js`)

- Same `FORM_SCHEMAS` / `form-engine.js` questionnaires as staff (PA_MF, PA_1663 tabs)
- Loads CHW drafts via `applyDraftToFormState`; banner when partial draft exists
- **Save to patient chart** → `fhirSaveToChart()` → `saveFormSubmission` + finalize
- **Sign provider attestation** → `fhirClinicianSignOff()` → signature + `patient.formWorkflow`
- Staff worklist: `formWorkflowLabel()` shows `· signed`, `· in chart`, or `· CHW draft`
- **Patient signature — TBD** (Section A can be pre-filled; capture workflow deferred)
- Legacy `#modal-outreach` for Gemini AI outreach assistant

### Settings modal

Gemini API key → `localStorage.gemini_api_key`. Used by FHIR outreach modal.

## Form mapping wizard

**URL:** `form-mapping-wizard.html`

Steps: EHR catalog → upload PDF → **click-to-map** (PDF field chip → PDF value → searchable EHR dropdown) → preview → save with **full mapping summary table**.

- `mapping-wizard.js` — `selectPdfField()`, `renderEhrCombobox()`, `renderMappingSummaryTable()`
- `ehr-field-catalog.js` — ICD-10 clinical fields; no SNOMED catalog entry
- `mapping-storage.js` — `saveMappingVersion()`, IndexedDB PDF blobs

Legacy **`form-mapping.html`**: developer gap table via `analyzeAllFormsFromManifest()`.

## JS module quick reference

| Module | Key exports |
|--------|-------------|
| `staff-workflow.js` | `openStaffDrawer`, `renderStaffWorklistRows`, `staffSavePartial`, `formWorkflowLabel` |
| `fhir-workflow.js` | `renderFHIRAppContent`, `fhirSaveToChart`, `fhirClinicianSignOff`, `setFhirActiveForm` |
| `form-engine.js` | `getFormState`, `prefillFormData`, `renderFormQuestionnaire`, `deriveIcdList` |
| `mapping-storage.js` | `saveFormSubmission`, `applyDraftToFormState`, `saveMappingVersion` |
| `mapping-wizard.js` | `selectPdfField`, `saveCurrentMapping`, `renderMappingSummaryTable` |
| `pa-1663-field-map.js` | `PA_1663_PDF_FIELDS`, `buildPA1663FieldValues` |
| `pdf-export.js` | `exportOfficialPA1663`, `exportFormPDF` |

## Tier logic

- **Tier 1:** SMI, SUD, oncology, ESRD ICD-10 matches on problem list
- **Tier 2:** Comorbidities + utilization (≥2 ED) or polypharmacy (≥10 meds)
- Status: `UNASSESSED | ELIGIBLE_TIER_1 | ELIGIBLE_TIER_2 | EXEMPT_COMPLETED | NON_EXEMPT`

## Common tasks for AI agents

| Task | Where |
|------|-------|
| Add mock patient | `patientRegistry` in index.html |
| Add questionnaire field | `form-schemas.js` + `prefillFormData()` |
| Map PA 1663 PDF field | `pa-1663-field-map.js` + `FORM_PDF_MAPPINGS` |
| Change worklist columns | `renderStaffWorklistRows()` in staff-workflow.js |
| Change drawer outreach flow | `renderStaffDrawerCenter()` in staff-workflow.js |
| Change FHIR form / sign flow | `fhir-workflow.js` |
| Change mapping wizard UI | `mapping-wizard.js` + `mapping-wizard.css` |
| Add EHR catalog field | `ehr-field-catalog.js` |
| Add official PDF form | assets + forms-manifest.json + field-map JS |

## Related docs

- `../Overview.md` — executive proposal
- `../technical.blueprint.md` — data models, APIs
- `../PA_Medicaid_Exemption_Workspace_Proposal.docx` — Word walkthrough (regenerate: `node prototype/scripts/build-document.mjs`)

## Version note

**v4 (June 2026):** Engage staff UI, 3-panel outreach drawer, click-to-map PDF wizard, ICD-10-only clinical data, FHIR/staff shared form state + chart save + provider sign-off (patient signature TBD), official PA 1663 PDF pre-fill. **v3:** single-file HTML without form engine.

**Branch:** `feature/v4-fhir-form-alignment` — FHIR form parity, mapping wizard redesign, SNOMED removal.
