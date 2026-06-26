/**
 * PA DHS exemption form schemas for the v4 prototype.
 *
 * PA 1663 — Official Employability Assessment Form (DHS MA response form).
 *   Source: https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/docs/documents/ma-response-forms/Employability%20Assessment%20Form.pdf
 *
 * PA Medical Frailty Self-Declaration & Provider Attestation — Structured for HR1
 *   community engagement exemptions. PA DHS has not yet published a standalone PDF;
 *   this schema mirrors the project spec (Section A patient / Section B provider)
 *   aligned with PA's May 2026 medical frailty implementation principles.
 */
const FORM_SCHEMAS = {
  PA_MF: {
    id: 'PA_MF',
    title: 'Medical Frailty Self-Declaration & Provider Attestation',
    shortTitle: 'Medical Frailty Attestation',
    dhsFormNumber: 'PA MF (HR1 — draft structure)',
    officialUrl: 'https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/medicaid/hr1-related/2026-05-may-pa-medical-frailty-overview-presentation.pdf',
    sections: [
      {
        id: 'section_a',
        title: 'Section A — Patient Self-Declaration',
        role: 'patient',
        description: 'Completed by the patient to describe health limitations and treating provider contacts.',
        fields: [
          { id: 'patientName', label: 'Patient Full Name', type: 'text', required: true },
          { id: 'dob', label: 'Date of Birth', type: 'date', required: true },
          { id: 'medicaidId', label: 'PA Medicaid ID', type: 'text', required: true },
          { id: 'address', label: 'Mailing Address', type: 'text' },
          { id: 'phone', label: 'Phone Number', type: 'tel' },
          { id: 'email', label: 'Email', type: 'email' },
          {
            id: 'patientConditions',
            label: 'Describe your physical or mental health conditions that limit your ability to work or engage in community service (80 hours/month)',
            type: 'textarea',
            rows: 4,
            required: true,
          },
          { id: 'treatingProviderName', label: 'Treating Provider Name', type: 'text' },
          { id: 'treatingProviderPhone', label: 'Treating Provider Phone', type: 'tel' },
          {
            id: 'patientSignatureAck',
            label: 'I certify that the information above is true to the best of my knowledge.',
            type: 'checkbox',
          },
        ],
      },
      {
        id: 'section_b',
        title: 'Section B — Licensed Provider Attestation of Impairment',
        role: 'clinician',
        description: 'Must be signed by a licensed physician, PA, CRNP, or psychologist certifying impairment of 80-hour monthly work/community engagement capacity.',
        fields: [
          {
            id: 'impairment_smi',
            label: 'Severe Mental Illness (SMI) — e.g., Schizophrenia, Bipolar, Recurrent Severe MDD',
            type: 'checkbox',
          },
          {
            id: 'impairment_sud',
            label: 'Substance Use Disorder (SUD) requiring continuous medical supervision',
            type: 'checkbox',
          },
          {
            id: 'impairment_oncology',
            label: 'Active Oncology / End-Stage Organ Disease',
            type: 'checkbox',
          },
          {
            id: 'impairment_comorbidity',
            label: 'Complex Comorbidities & High Utilization (Tier 2 clinical judgment)',
            type: 'checkbox',
          },
          {
            id: 'clinicalJustification',
            label: 'Clinical Justification — explain how the condition impairs ability to meet 80-hour requirement',
            type: 'textarea',
            rows: 4,
            required: true,
          },
          { id: 'providerName', label: 'Provider Name', type: 'text', defaultValue: 'Siobhan Mita, MD' },
          { id: 'providerNpi', label: 'Provider NPI', type: 'text', defaultValue: '1234567890' },
          { id: 'providerTitle', label: 'Credentials', type: 'text', defaultValue: 'MD' },
          { id: 'attestationDate', label: 'Attestation Date', type: 'date' },
        ],
      },
    ],
  },

  PA_1663: {
    id: 'PA_1663',
    title: 'Employability Assessment Form (PA 1663)',
    shortTitle: 'PA 1663',
    dhsFormNumber: 'PA 1663',
    officialUrl: 'https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/docs/documents/ma-response-forms/Employability%20Assessment%20Form.pdf',
    sections: [
      {
        id: 'section_i',
        title: 'Section I — Applicant Statement (Patient)',
        role: 'patient',
        description: 'Completed by the applicant for public assistance benefits.',
        fields: [
          { id: 'patientName', label: 'Applicant Name', type: 'text', required: true },
          { id: 'dob', label: 'Date of Birth', type: 'date', required: true },
          { id: 'medicaidId', label: 'Recipient / Case ID', type: 'text' },
          { id: 'address', label: 'Address', type: 'text' },
          { id: 'phone', label: 'Phone', type: 'tel' },
          {
            id: 'patientStatement',
            label: 'Statement describing physical or mental disability that precludes gainful employment',
            type: 'textarea',
            rows: 5,
            required: true,
          },
        ],
      },
      {
        id: 'section_ii',
        title: 'Section II — Provider Employability Assessment',
        role: 'clinician',
        description: 'Completed by a licensed physician, PA, CRNP, or psychologist based on patient statement, examination, and medical records.',
        fields: [
          {
            id: 'employabilityStatus',
            label: 'Employability (check only one)',
            type: 'radio',
            options: [
              { value: 'permanent', label: 'Permanently Disabled — disability permanently precludes any gainful employment; candidate for SSD/SSI' },
              { value: 'temp_12mo', label: 'Temporarily Disabled — 12 months or more — acute/temporary condition precludes employment' },
              { value: 'temp_lt12', label: 'Temporarily Disabled — less than 12 months' },
              { value: 'employable', label: 'Employable — patient can work full-time or part-time' },
            ],
            required: true,
          },
          { id: 'disabilityBeginDate', label: 'Disability Began (if temporary)', type: 'date' },
          { id: 'disabilityEndDate', label: 'Expected to Last Until (if temporary)', type: 'date' },
          {
            id: 'diagnosisList',
            label: 'Diagnosis(es) — include ICD-10 codes where available',
            type: 'textarea',
            rows: 3,
            required: true,
          },
          {
            id: 'examinationFindings',
            label: 'Examination Results — clinical findings supporting assessment (required if boxes 1–3 checked)',
            type: 'textarea',
            rows: 4,
            required: true,
          },
          { id: 'providerName', label: 'Assessing Provider Name', type: 'text', defaultValue: 'Siobhan Mita, MD' },
          { id: 'providerNpi', label: 'Provider NPI', type: 'text', defaultValue: '1234567890' },
          { id: 'examDate', label: 'Date of Examination', type: 'date' },
        ],
      },
    ],
  },
};

window.FORM_SCHEMAS = FORM_SCHEMAS;
