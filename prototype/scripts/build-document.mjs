import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  LevelFormat,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'screenshots');
const outFile = path.join(root, 'PA_Medicaid_Exemption_Workspace_Proposal.docx');

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, ...opts })],
  });
}
function bullets(items, ref = 'bullet-list') {
  return items.map(
    (text) =>
      new Paragraph({
        numbering: { reference: ref, level: 0 },
        spacing: { after: 80 },
        children: [new TextRun(text)],
      })
  );
}
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}
function shot(name, caption, alt) {
  const file = path.join(shots, `${name}.png`);
  const children = [];
  if (fs.existsSync(file)) {
    children.push(
      new ImageRun({
        type: 'png',
        data: fs.readFileSync(file),
        transformation: { width: 580, height: 363 },
        altText: { title: alt, description: alt, name: alt },
      })
    );
  }
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 80 },
      children,
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: caption, italics: true, size: 20, color: '444444' })],
    }),
  ];
}

function codeTable(headers, rows) {
  const colWidths = [2800, 2800, 3760];
  const headerRow = new TableRow({
    children: headers.map(
      (h, i) =>
        new TableCell({
          borders,
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: { fill: 'E8EEF4' },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
        })
    ),
  });
  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell, i) =>
            new TableCell({
              borders,
              width: { size: colWidths[i], type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20 })] })],
            })
        ),
      })
  );
  return new Table({
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
}

const children = [
  new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    children: [new TextRun('PA Medicaid Exemption Workspace')],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [
      new TextRun({
        text: 'Executive Proposal, Interactive Prototype Walkthrough (v4) & Technical Appendix',
        italics: true,
        size: 24,
      }),
    ],
  }),
  p('Prepared for: Penn Medicine Executive Leadership, the SMART Committee (Rich Paoliti & Mark Angelo, MD), and the Center for Healthcare Transformation and Innovation (CHTI).'),
  p('Subject: Operationalizing the PA Medicaid Community Engagement (Work) Exemption Framework to protect patient coverage and mitigate system-wide revenue exposure.'),

  // ── PART 1: EXECUTIVE SUMMARY ──
  h1('Part 1 — Executive Summary'),
  h2('Strategic Rationale'),
  p('The federal government and the Commonwealth of Pennsylvania are implementing a monthly 80-hour community engagement (work) requirement for Medicaid expansion enrollees (ages 19–64). Failure to comply or successfully file an exemption will result in immediate loss of Medicaid coverage.'),
  h3('Financial Exposure'),
  p('At the Executive Advisory Board (EAB) meeting, it was flagged that roughly 40% of Penn Medicine patient revenue could be severely impacted if nothing is done. When vulnerable patients lose Medicaid coverage, they do not stop seeking care; they transition to the Emergency Department or inpatient units, shifting Penn Medicine payer mix toward uncompensated charity care and escalating bad debt.'),
  h3('Clinical Policy Gap'),
  p('Federal CMS guidance introduced a challenging two-test standard for medical exemptions:'),
  ...bullets([
    'Test 1: The patient must have a serious/complex medical condition, serious mental illness (SMI), or substance use disorder (SUD).',
    'Test 2: The condition must actively impair the patient ability to comply with the 80-hour work requirement.',
  ]),
  p('Pennsylvania relies on retrospective billing claims data (sparse, lacking functional clinical depth) for automatic exemptions. Penn Medicine holds highly granular clinical data inside the EHR.'),
  h3('The Opportunity'),
  p('By building a centralized administrative system to assess the Medicaid population for medical frailty and proactively pre-populate streamlined exemption documentation (PA-1663 / PA Medical Frailty Attestations), Penn Medicine can protect patient coverage, lower clinician administrative burden to near-zero, and insulate the health system from massive financial exposure.'),

  h2('Technical & Operational Approach'),
  p('The proposed architecture bypasses the current Epic EHR build freeze (Doylestown consolidation through July/August) via a two-phase, dual-persona system:'),
  ...bullets([
    'Phase 1 — Databricks Offline Registry: Daily replicated Epic Clarity data, UMLS SNOMED-to-ICD-10 mapping, tiered exemption logic, standalone Staff Dashboard.',
    'Phase 2 — SMART on FHIR Point-of-Care App (post-freeze): Single-patient chart context, editable attestation checkboxes, digital signature pad, HIO submission.',
    'Coordinated Patient Outreach: Community Health Workers use the dashboard with a Gemini AI outreach assistant to help patients upload completed forms to PA COMPASS.',
  ]),

  h2('Implementation Roadmap'),
  ...bullets([
    'Month 1 — Databricks Engine & Mapping: Validate UMLS translations, 20-patient pilot, secure registry views.',
    'Month 2 — CHW Core Rollout: Deploy Standalone Staff Dashboard, connect registry datasets, initiate outreach campaigns.',
    'Month 3 — Epic SMART on FHIR Launch: Integrate point-of-care app, activate signature capture, route HIO/P3N transmissions.',
  ], 'numbered-roadmap'),

  h2('Prototype Evolution (v4)'),
  p('The interactive prototype has evolved from v3 (single-file ASCII wireframes) to v4: Engage Vivid staff UI, 3-panel outreach drawer, form mapping wizard, official DHS PDF pre-fill, and per-patient draft persistence. Deployable as a static site under prototype/v4/.'),
  ...bullets([
    'Official forms only: PA 1663 export fills the bundled DHS PDF template (38 AcroForm fields). No synthetic PDFs.',
    'Medical Frailty: HTML questionnaire only until PA DHS publishes an official HR1 attestation PDF.',
    'Engage staff worklist: play button opens 3-panel drawer (patient context | outreach + forms | saved attempts).',
    'Outreach flow: Inbound call, Outbound call, or MPM; Call now placeholder when Outbound call selected.',
    'Form mapping wizard (form-mapping-wizard.html): EHR catalog → upload PDF → map fields → preview → save versions.',
    'FHIR Form Package tab: preview both forms; download official pre-filled PA 1663.',
  ]),

  pageBreak(),

  // ── PART 2: SCREENS & WALKTHROUGH ──
  h1('Part 2 — Screens & Walkthrough'),
  p('The v4 interactive prototype demonstrates two physically separated deployment contexts via an Adaptive Enterprise Shell: the Independent Population Staff Dashboard and the SMART on FHIR Point-of-Care App embedded in a simulated Epic EHR layout. Screenshots capture key interaction states including the new form questionnaire and field mapping workflows.'),

  h2('2.1 Staff Dashboard — Engage Worklist'),
  p('Used by CHWs and population health staff. Engage Vivid UI: collapsible navy sidebar, metric cards, filterable worklist with play button per row.'),
  ...shot('01-staff-dashboard', 'Figure 1 — Engage staff worklist with metric cards and play-button actions', 'Staff Dashboard'),
  h3('Key Features'),
  ...bullets([
    'Target metrics: cohort size, exemptions validated (%), forms pending provider signature.',
    'Worklist: exemption tier badges, CAO, next outreach date, form completion progress.',
    'Play button: opens 3-panel drawer without blocking the worklist; click another row to swap patients.',
  ]),

  h2('2.2 Patient Outreach Drawer (3-panel)'),
  p('Center column follows Engage outreach pattern: outreach type (Inbound call, Outbound call, MPM), optional Call now for outbound calls, reached patient Yes/No, call notes, then exemption form fill when patient is reached.'),
  ...shot('10-v4-forms-questionnaire', 'Figure 2 — Outreach drawer: form dropdown with pre-filled vs remaining fields', 'Outreach Drawer'),
  ...bullets([
    'Reached = Yes: select Medical Frailty or PA 1663; view EHR pre-fill vs fields still needed; save partial draft or download for print.',
    'Reached = No: log attempt, set next outreach date, close drawer.',
    'Right panel: saved form drafts and prior outreach attempts per patient.',
  ]),

  h2('2.3 Form Mapping Wizard'),
  p('Admin wizard (form-mapping-wizard.html) maps official PDF AcroForm fields to EHR data with version history.'),
  ...shot('12-form-mapping-admin', 'Figure 3 — Form mapping: PDF preview and field mapping', 'Form Mapping Wizard'),
  ...bullets([
    'Step 1: browse EHR field catalog (example values labeled, not live patient data).',
    'Steps 2–5: upload PDF, map fields side-by-side, preview sample fill, save mapping versions.',
  ]),

  h2('2.4 API Configuration'),
  p('The settings panel allows optional Gemini API key configuration. When configured, the CHW Outreach Planner uses Google gemini-3-flash-preview for personalized scripts; otherwise a high-fidelity local simulator generates barrier-aware copy.'),
  ...shot('02-settings-modal', 'Figure 4 — API configuration modal for Gemini outreach assistant', 'Settings Modal'),

  h2('2.5 SMART on FHIR Point-of-Care App'),
  p('Selecting SMART on FHIR mode strips global staff controls and renders a sandboxed clinician app inside a simulated Epic sidebar layout. The Form Package tab previews both questionnaires with EHR pre-fill.'),
  ...shot('11-v4-fhir-form-package', 'Figure 5 — FHIR Form Package tab: both DHS questionnaires pre-filled from clinical data', 'FHIR Form Package'),
  ...shot('05-fhir-jane-doe-tier1', 'Figure 6 — Clinical Overview: Jane Doe, Tier 1 with SNOMED-to-ICD translation', 'FHIR Jane Doe Tier 1'),
  ...shot('06-fhir-john-smith-tier2', 'Figure 7 — Clinical Overview: John Smith, Tier 2 complex comorbidities', 'FHIR John Smith Tier 2'),
  h3('Key Features'),
  ...bullets([
    'Epic Context Banner: Inherits MRN, DOB, payer via SMART on FHIR launch parameters.',
    'EHR Problem List Translator: Displays UMLS SNOMED-to-ICD-10 mapping with clinical transparency.',
    'Editable PA Medical Frailty Attestation: Interactive checkboxes, editable justification, signature canvas.',
    'One-Click HIO Integration: Signed certificate routes to Pennsylvania P3N health information exchange.',
  ]),

  h2('2.6 Clinician Signature & State Sync'),
  p('Providers draw signatures on the HTML5 canvas pad. Submitting marks the patient EXEMPT_COMPLETED, embeds signature in official PDF export, and syncs status back to the staff dashboard.'),
  ...shot('07-fhir-signature-drawn', 'Figure 8 — Provider digital signature applied on attestation form', 'Signature Drawn'),
  ...shot('08-fhir-signed-completed', 'Figure 9 — Completed exemption: form locked, status badge updated', 'Signed Completed'),
  ...shot('09-dashboard-after-signing', 'Figure 10 — Staff dashboard after clinical sign-off', 'Dashboard After Signing'),

  h2('2.8 Operational Interaction Checklist'),
  ...bullets([
    'Staff mode: click play on a worklist row — select outreach type — Call now (outbound) — mark reached — fill exemption form — save or download.',
    'Staff mode: if not reached — log attempt and set next outreach date.',
    'Admin: Form Mapping Wizard — upload official PDF, map EHR fields, save version.',
    'FHIR mode: Form Package tab — review forms — Clinical tab — sign and push.',
    'Return to Staff Dashboard after signing — exemption metrics update.',
  ]),

  pageBreak(),

  // ── PART 3: TECHNICAL APPENDIX ──
  h1('Part 3 — Technical Appendix'),
  h2('3.1 Official Forms Policy'),
  codeTable(
    ['Form', 'Official PDF', 'Prototype behavior'],
    [
      ['PA 1663 Employability Assessment', 'Yes — DHS official (38 AcroForm fields)', 'Bundled template; export pre-fills official PDF only'],
      ['Medical Frailty Attestation', 'Not published by PA DHS (HR1, June 2026)', 'HTML questionnaire; claims/P3N ex-parte primary path'],
    ]
  ),
  new Paragraph({ spacing: { after: 200 }, children: [] }),
  p('The prototype never generates synthetic PDFs mimicking DHS forms. When DHS publishes the Medical Frailty PDF: add to assets/, update forms-manifest.json, add field map, re-scan on Form Mapping page.'),

  h2('3.2 Core Forms Required'),
  h3('PA Medical Frailty Self-Declaration & Provider Attestation'),
  ...bullets([
    'Section A (Patient): Self-declared limitations and treating provider contact information.',
    'Section B (Provider): Licensed clinician certifies physical, mental, or SUD impairment of 80-hour monthly capacity.',
  ]),
  h3('PA 1663 (Employability Assessment Form)'),
  p('Alternative pathway when patient qualifies for broader state cash or medical assistance exemptions. Requires Permanently Disabled or Temporarily Disabled (12+ months) in Section II.'),

  h2('3.3 Clinical Code Mapping & Tier Logic'),
  p('Pipeline: EHR Problem List (SNOMED-CT) → UMLS Translation Engine → ICD-10 Equivalence Map → DHS Exemption Engine'),
  h3('Tier 1 — Slam-Dunk Auto-Exemptions'),
  codeTable(
    ['Category', 'ICD-10', 'SNOMED-CT'],
    [
      ['Serious Mental Illness (SMI)', 'F20.9, F31.9, F33.2', '58214004, 13746004, 28475009'],
      ['Substance Use Disorders (SUD)', 'F11.20, F10.20', '5602001, 28743005'],
      ['Active Oncology', 'C50.919, C18.9', '254837009, 126852002'],
      ['End-Stage Organ Disease', 'N18.6, I50.9', '432241000124101, 85232005'],
    ]
  ),
  new Paragraph({ spacing: { after: 200 }, children: [] }),
  h3('Tier 2 — Complex Comorbidities'),
  ...bullets([
    'Comorbidity threshold: ≥2 complex chronic diseases (e.g., severe COPD J44.9 + insulin-dependent diabetes E11.9).',
    'Utilization proxy: ≥2 ED visits or ≥1 inpatient admission in trailing 12 months.',
    'Polypharmacy proxy: ≥10 unique active prescription entries.',
  ]),

  h2('3.4 v4 Prototype Component Structure'),
  p('Read prototype/v4/context.md for full component map. Summary:'),
  ...bullets([
    'index.html — main shell, patientRegistry, staff Engage UI + FHIR runtime',
    'js/staff-workflow.js — worklist, 3-panel outreach drawer, Call now placeholder',
    'form-mapping-wizard.html + js/mapping-wizard.js — admin PDF↔EHR mapping wizard',
    'js/form-schemas.js, form-engine.js, mapping-storage.js — questionnaires and drafts',
    'js/pa-1663-field-map.js, pdf-export.js — official PA 1663 fill only',
    'form-mapping.html — legacy developer gap-analysis page',
  ]),

  h2('3.5 Submission Pathways'),
  ...bullets([
    'Administrative ex-parte (automated): Billing data pushed via P3N/HealthShare Exchange to state.',
    'Digital upload (PA COMPASS): Signed PDFs routed to MyChart; patient uploads to COMPASS portal.',
    'Physical/direct: Printed forms faxed to County Assistance Office (CAO).',
  ]),

  h2('3.6 Data Models'),
  h3('PatientRegistry'),
  ...bullets([
    'patient_id, mrn, medicaid_id, demographics, contact info',
    'exemption_status: UNASSESSED | ELIGIBLE_TIER_1 | ELIGIBLE_TIER_2 | EXEMPT_COMPLETED | NON_EXEMPT',
    'state_due_date: community engagement compliance deadline',
  ]),
  h3('ClinicalExemptionScores'),
  ...bullets([
    'tier_classification, matched_icd_codes, matched_snomed_codes',
    'utilization_count_12mo, medication_count, last_evaluated_at',
  ]),
  h3('ProviderAttestation'),
  ...bullets([
    'form_type (PA_MF_ATT_B | PA_1663), form_data_json, signature_blob',
    'submission_status: PENDING_PATIENT | SUBMITTED_COMPASS | FAXED_TO_CAO | AUTO_EX_PARTE',
  ]),

  h2('3.7 API Specifications'),
  h3('FHIR R4 Integration'),
  ...bullets([
    'GET /Patient/{id} — demographics and insurance',
    'GET /Condition?patient={id}&clinical-status=active — problem list',
    'GET /Encounter?patient={id} — utilization for Tier 2',
    'POST /DocumentReference — write signed PDF to Epic document storage',
  ]),
  h3('Custom Backend'),
  ...bullets([
    'GET /api/v1/registry/worklist — paginated CHW worklist with filters',
    'POST /api/v1/forms/generate — pre-populate forms from Databricks',
    'POST /api/v1/forms/sign-and-submit — signature capture, Epic write-back, patient notification',
  ]),

  h2('3.8 Role-Based Access Control'),
  codeTable(
    ['Role', 'Primary Access'],
    [
      ['System Administrator', 'Rules engine, SNOMED mappings, integrations, audit logs'],
      ['Clinician', 'SMART on FHIR app, eligibility flags, form review, digital signatures'],
      ['CHW / Case Manager', 'Population worklist, outreach logging, CAO routing'],
      ['Compliance / Revenue Integrity', 'Read-only dashboards, financial impact, submission audits'],
    ]
  ),
  new Paragraph({ spacing: { after: 200 }, children: [] }),

  h2('3.9 Intended Clinical Workflow'),
  ...bullets([
    'Review patient active problem list in the EHR.',
    'Identify relevant SNOMED-CT concepts.',
    'Map concepts to ICD-10 billing codes used by DHS.',
    'Generate form package and support submission workflow.',
  ]),
];

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      {
        id: 'Title',
        name: 'Title',
        basedOn: 'Normal',
        run: { size: 48, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER },
      },
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'bullet-list',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: 'numbered-roadmap',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outFile, buffer);
console.log(`Wrote ${outFile}`);
