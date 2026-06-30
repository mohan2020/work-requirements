Executive Proposal & Implementation Strategy: PA Medicaid Exemption Workspace

Prepared for: The Penn Medicine Executive Leadership, the SMART Committee (led by Rich Paoliti & Mark Angelo, MD), and the Center for Healthcare Transformation and Innovation (CHTI).

Subject: Operationalizing the PA Medicaid Community Engagement (Work) Exemption Framework to Protect Patient Coverage and Mitigate System-Wide Revenue Exposure.

1. Executive Summary & Strategic Rationale

The federal government and the Commonwealth of Pennsylvania are implementing a monthly $80$-hour community engagement (work) requirement for Medicaid expansion enrollees (ages 19-64). Failure to comply or successfully file an exemption will result in the immediate loss of Medicaid coverage.

The Financial Exposure

At the Executive Advisory Board (EAB) meeting, it was flagged that roughly $40\%$ of Penn Medicine’s patient revenue could be severely impacted if nothing is done. When vulnerable patients lose Medicaid coverage, they do not stop seeking care; instead, they transition to the Emergency Department or inpatient units, shifting Penn Medicine's payer mix toward uncompensated charity care and escalating bad debt.

The Clinical Policy Gap

The federal CMS guidance has introduced a challenging "two-test" standard for medical exemptions:

Test 1: The patient must have a serious/complex medical condition, serious mental illness (SMI), or substance use disorder (SUD).

Test 2: The condition must actively impair the patient’s ability to comply with the $80$-hour work requirement.

While the state of Pennsylvania relies on retrospective billing claims data (which is sparse and lacks functional clinical depth) to grant automatic exemptions, Penn Medicine holds highly granular clinical data inside our Electronic Health Record (EHR).

The Opportunity: By building a centralized, administrative system to assess our Medicaid population for medical frailty and proactively pre-populate streamlined exemption documentation (PA-1663 / PA Medical Frailty Attestations), we can protect our patients' coverage, lower clinician administrative burden to near-zero, and insulate the health system from massive financial exposure.

2. Technical & Operational Approach

Our proposed architecture bypasses the current Epic EHR build freeze (caused by the Doylestown consolidation running through July/August) by taking a two-phase, dual-persona system approach.

       [ Epic Clarity Data ] (Daily Replication)
                 │
                 ▼
       [ Databricks Platform ] ──(UMLS SNOMED-to-ICD-10 Mapping)
                 │
                 ├──────────────────────────────────────┐
                 ▼                                      ▼
    [ Standalone Staff Dashboard ]           [ SMART on FHIR App (Post-Freeze) ]
    • Population Cohort Registry             • Single Patient Chart Context
    • Sliding Outreach & Follow-up Drawer     • Editable Attestation Checkboxes
    • Gemini AI Outreach Assistant           • Canvas Digital Signature Pad


A. Phase 1: Databricks Offline Registry (Immediate)

We leverage Penn’s daily replicated Epic Clarity database inside Databricks to run population-level clinical algorithms.

The Code Translation Engine: Since clinicians log active problems in the EHR using SNOMED-CT codes, but the state reviews claims using ICD-10, our pipeline maps these vocabularies using UMLS Metathesaurus datasets.

Tiered Exemption Logic:

Tier 1 (Slam Dunk Auto-Exemptions): Patients with explicit codes on active problem lists (e.g., active oncology protocols, ESRD on dialysis, Schizophrenia, Severe recurrent MDD).

Tier 2 (Complex Comorbidities & High Utilization): Patients with chronic diseases (COPD, Heart Failure) plus comorbidities, polypharmacy ($\ge 10$ active medications), or service utilization indicators ($\ge 2$ ED visits in 12 months).

B. Phase 2: The "Cardiac Rehab" Clinician Point-of-Care Workflow

Clinicians are notoriously poor at filling out state-issued administrative forms. Borrowing from Penn's successful cardiac rehab automation model, we eliminate all manual entry:

The system automatically identifies qualifying patients using the Databricks engine.

The system pre-fills the patient demographic information and automatically drafts the PA Medical Frailty Attestation Form.

It pre-selects the appropriate diagnostic checkboxes based on the translated SNOMED codes.

It supplies a draft clinical justification note.

The clinician simply reviews, edits if necessary, and signs via a digital signature block.

C. Coordinated Patient Outreach (The CHW Core)

Because patients must ultimately submit their own documentation, the system feeds directly into Heather Closeritz's newly established Community Health Core. Community Health Workers (CHWs) can use a dedicated standalone dashboard to locate patients, utilize built-in Generative AI Assistant nodes to draft personalized barrier-aware outreach scripts (SMS, Email, or Call Scripts), and help patients upload completed forms to the state's COMPASS portal.

3. System Interfaces & High-Fidelity "Screenshots"

The following sections illustrate the user interfaces developed for this system, providing wireframe representations and functional breakdowns of their operations.

Screenshot A: The Independent Staff Dashboard & Cohort Manager

Used by population health coordinators, CHWs, and administrative leads to monitor the total Medicaid population, track exemption filing rates, and identify outreaches requiring immediate action.

+-----------------------------------------------------------------------------------------+
| PENN MEDICINE  |  Medicaid Population Health Exemption Manager       [Sarah Jenkins, MPH]  |
+-----------------------------------------------------------------------------------------+
|  METRIC CARDS:                                                                          |
|  +---------------------------+  +---------------------------+  +---------------------+  |
|  |  TARGET MEDICAID COHORT   |  |   EXEMPTIONS VALIDATED    |  | OUTREACH PENDING SIG|  |
|  |  7,240                    |  |   2,450 (34%)             |  | 1,102               |  |
|  +---------------------------+  +---------------------------+  +---------------------+  |
|                                                                                         |
|  FILTERS: [ Search Patient Name/MRN...  ]  [ All Exemption Statuses v ] [ CAO Offices v ]  |
|                                                                                         |
|  PATIENT EXEMPTION WORKLIST:                                                            |
|  +------------------+------------------+-------------------+-----------------+----------+  |
|  | Patient Context  | Medicaid/MRN ID  | CMS Evaluation    | Next Outreach   | Actions  |  |
|  +------------------+------------------+-------------------+-----------------+----------+  |
|  | Jane Doe         | PA-99882104      | Tier 1 Auto-Exempt| Jul 1, 2026     | [Outreach]  |  |
|  | DOB: 04/12/1988  | MRN: 100-200-300 | [Exemption Filed] |                 | [Fax CAO]|  |
|  +------------------+------------------+-------------------+-----------------+----------+  |
|  | John Smith       | PA-88776655      | Tier 2 Comorbid   | Jun 28, 2026    | [Outreach]  |  |
|  | DOB: 08/21/1972  | MRN: 200-300-400 | [Pending Reply]   |                 | [Fax CAO]|  |
|  +------------------+------------------+-------------------+-----------------+----------+  |
|  Showing 2 of 7,240 evaluated Medicaid patients             [Databricks Synced Today]  |
+-----------------------------------------------------------------------------------------+


Detailed Description of Screenshot A:

Target Metric Bar: Tracks progress toward protecting coverage for the entire cohort. It highlights the percentage of cleared exemptions and quantifies outstanding forms pending provider signatures.

Dynamic Worklist Grid: Serves as the team's operational workbench. It supports fast queries across clinical tiers, County Assistance Offices (CAOs), and outreach statuses.

Exemption State Badges: Visually categorizes patients by risk level:

Tier 1 (Green): Standard medical automatic exemptions.

Tier 2 (Yellow): Complex cases requiring manual provider intervention due to multiple chronic conditions.

Exemption Filed (Blue): Documentation confirmed, signed by the provider, and submitted to the state.

Action Triggers: Direct paths to launch the sliding outreach drawer or instantly compile and securely fax the completed PA-1663 packet directly to the patient's assigned CAO.

Screenshot B: The Epic-Integrated SMART on FHIR Point-of-Care App

Triggered automatically inside the clinician's Epic Workspace (e.g., in the Emergency Department or during an outpatient visit) when opening an eligible Medicaid patient's chart.

+-----------------------------------------------------------------------------------------+
| PATIENT: Jane Doe    MRN: 100-200-300    DOB: 04/12/1988    PAYER: PA MEDICAID (DHS)   |
+-----------------------------------------------------------------------------------------+
| [Chart Snapshot]   | CLINICIAN EXEMPTION VERIFICATION PANEL                             |
| [Medications]      |                                                                    |
| [Problem List]     | EHR PROBLEM LIST TRANSLATOR (SNOMED -> ICD-10)                     |
| [Encounters]       | +----------------------------------------------------------------+ |
|                    | | SNOMED-CT: 28475009 (Recurrent severe major depressive episode) | |
| [PA Medicaid  <--- | |    --> ICD-10: F33.2 (Major depressive disorder, recurrent)     | |
|  Exemption]        | +----------------------------------------------------------------+ |
|                    |                                                                    |
|                    | PA MEDICAL FRAILTY ATTESTATION (Editable Draft)                    |
|                    | +----------------------------------------------------------------+ |
|                    | | Licensed Provider Attestation of Impairment (Section B)        | |
|                    | | [x] Severe Mental Illness (SMI)                                | |
|                    | | [ ] Substance Use Disorder (SUD)                               | |
|                    | | [ ] Active Oncology / End-stage Organ Disease                  | |
|                    | |                                                                | |
|                    | | Clinical Justification Statement (Editable Notes):             | |
|                    | | [ Patient has recurrent severe depression rendering consistent ]| |
|                    | | [ compliance with 80hr work rules impossible without decomp.  ]| |
|                    | |                                                                | |
|                    | | Provider Digital Signature Canvas:                             | |
|                    | | +------------------------------------------------------------+ | |
|                    | | |                         Siobhan Mita, MD                   | | |
|                    | | +------------------------------------------------------------+ | |
|                    | +----------------------------------------------------------------+ |
|                    | [ Sign & Push to State HIO ]      [ Send Patient Outreach Copy ]   |
+-----------------------------------------------------------------------------------------+


Detailed Description of Screenshot B:

Epic Context Banner Integration: Seamlessly inherits patient metadata (MRN, DOB, Payer) via SMART on FHIR launch parameters to prevent clinician lookup errors.

EHR Problem List Translator: Pulls active codes from the Epic problem list and displays the exact UMLS translation to ICD-10, giving clinicians immediate transparency into why the patient was flagged for the exemption.

Fully Interactive Checkboxes: Provides clinicians with manual overrides to select, deselect, or append clinical impairment categories on the digital PA-1663 representation.

Editable Justification Field: A pre-populated clinical note draft that providers can customize, ensuring the document withstands administrative reviews and potential litigation.

HTML5 Signature Canvas Pad: Allows clinicians to physically apply signature validation inside Epic using a mouse, touch screen, or stylus, writing the resulting image vector to the secure document register.

One-Click HIO Integration: Submitting sends the signed certificate directly to Pennsylvania’s P3N health information exchange, bypassing manual patient delivery when ex-parte options are available.

Screenshot C: The Sliding CHW Outreach Drawer & AI Assistant

This sliding panel opens from the right edge of the Population Dashboard, allowing team members to communicate with patients, address their barriers, and generate personalized copy.

+-----------------------------------------------------------------------------------------+
|                                                  | DISPATCHED OUTREACH & PLANNER [X]    |
|                                                  +--------------------------------------+
|                                                  | TARGET PATIENT: John Smith           |
|                                                  | MRN: 200-300-400 | Phone: 215-555-0122|
|                                                  | Last Contact Date: May 20, 2026      |
|                                                  | Profile: Severe COPD & Comorbidities |
|                                                  |                                      |
|                                                  | GEMINI AI ASSISTANT PANEL            |
|                                                  | +----------------------------------+ |
|                                                  | | Channel: [ SMS Text Message    v ]| |
|                                                  | | Barrier: [ Limited Digital Access v ]| |
|                                                  | |                                  | |
|                                                  | | [ Generate AI Patient Outreach ] | |
|                                                  | |                                  | |
|                                                  | | Output Draft Preview:            | |
|                                                  | | [ Penn Med Alert: Hello John. PA ]| |
|                                                  | | [ Medicaid starting work rules.  ]| |
|                                                  | | [ We pre-filled your exemption.  ]| |
|                                                  | | [ Let us mail paper forms.       ]| |
|                                                  | +----------------------------------+ |
|                                                  | [ Copy Script ]                      |
|                                                  |                                      |
|                                                  | IMMEDIATE CHW ACTION DISPATCH:       |
|                                                  | +------------+------------+----------+ |
|                                                  | | [Send SMS] | [Send Email| [Direct] | |
|                                                  | |            |            |  [Fax]   | |
|                                                  | +------------+------------+----------+ |
+-----------------------------------------------------------------------------------------+


Detailed Description of Screenshot C:

Slide-Over Panel (Drawer Architecture): Slides smoothly from the right edge of the dashboard viewport, preserving the coordinator's filtered list position on the main workspace table.

Enriched Outreach Profiles: Displays crucial patient details, including contact numbers, last outreach dates, and clinical descriptions, to prepare coordinators before they initiate contact.

Interactive Gemini AI Assistant: Utilizes Google's gemini-3-flash-preview engine (or a high-fidelity local simulator fallback) to generate tailored communications. The AI adjusts the tone, complexity, and language based on specific patient barriers (e.g., translating to Spanish, simplifying language for low cognitive load, or adjusting for patients with limited transportation or digital access).

Actionable Communication Links: Triggers automated channels (SMS, Email, or direct clinical faxes to CAO branches) once the coordinator approves the generated text. This updates the patient's record to Pending Reply and logs the current date.

4. Implementation Roadmap & Quick Wins

To launch this application successfully before the January 1st deadline, we will execute our implementation across three coordinated workstreams:

Month 1: Databricks Engine & Mapping Mocks
──► Validate UMLS code translations
──► Run 20-patient pilot (10 true positive, 10 true negative)
──► Establish secure registry views

Month 2: CHW Core Rollout (Standalone Dashboard)
──► Deploy Standalone Staff Dashboard (Screenshot A)
──► Connect to clinical registry datasets
──► Initiate CHW telephone & SMS campaigns (Screenshot C)

Month 3: Epic SMART on FHIR Launch (Post-Freeze)
──► Integrate point-of-care app inside Epic sidebar (Screenshot B)
──► Activate clinician signature capture pads
──► Route automated HIO/P3N electronic transmissions


By separating the system into an Independent Population Dashboard for immediate outreach and a SMART on FHIR Point-of-Care App for the clinic, Penn Medicine can rapidly scale its response, protect vulnerable patients from losing coverage, and secure vital health system revenues.