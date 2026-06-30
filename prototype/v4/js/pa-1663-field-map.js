/**
 * Map questionnaire state → official PA 1663 AcroForm field names.
 * Template: assets/PA_1663_official.pdf (DHS Employability Assessment Form)
 * Source: https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/docs/documents/ma-response-forms/Employability%20Assessment%20Form.pdf
 */
const PA_1663_PDF_FIELDS = {
  patientName: 'NAME',
  dob: 'BIRTHDATE',
  address: 'ADDRESS',
  phone: 'TELEPHONE NUMBER',
  city: 'CITY',
  state: 'STATE',
  zip: 'ZIP CODE',
  caoOffice: 'CAO NAME AND ADDRESS',
  patientPrintName: 'PRINT NAME',
  patientStatement: 'SECTION II To be completed by a licensed physician physicians assistant certified registered nurse practitioner or psychologist',
  employability: 'EMPLOYABILITY Check only one',
  disabilityBegin: 'DATE_3',
  disabilityEnd: 'DATE_4',
  examinationFindings: 'E',
  diagnosisList: 'OTHER Specify',
  providerName: 'MEDICAL PROVIDER PRINT NAME',
  providerPhone: 'TELEPHONE NO',
  providerAddress: 'ADDRESS_2',
  providerNpi: 'MEDICAL ASSISTANCE PROVIDER NO',
  examDate: 'DATE_5',
  patientDate: 'DATE',
  patientDate2: 'DATE_2',
};

const EMPLOYABILITY_PDF_VALUES = {
  permanent: '1',
  temp_12mo: '2',
  temp_lt12: '3',
  employable: '4',
};

function safeSetTextField(form, fieldName, value) {
  if (value === undefined || value === null || String(value).trim() === '') return;
  try {
    const field = form.getTextField(fieldName);
    field.setText(String(value).substring(0, 2000));
  } catch (err) {
    console.warn(`PA 1663 field not found or not writable: ${fieldName}`, err.message);
  }
}

function buildPA1663FieldValues(patient, state) {
  const employabilityCode = EMPLOYABILITY_PDF_VALUES[state.employabilityStatus] || '2';
  const providerBlock = [
    state.diagnosisList ? `Diagnoses:\n${state.diagnosisList}` : '',
    state.examinationFindings ? `Examination:\n${state.examinationFindings}` : '',
    patient.rationale ? `Clinical summary: ${patient.rationale}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    [PA_1663_PDF_FIELDS.patientName]: state.patientName || patient.name,
    [PA_1663_PDF_FIELDS.dob]: state.dob || patient.dob,
    [PA_1663_PDF_FIELDS.address]: state.address || '',
    [PA_1663_PDF_FIELDS.phone]: state.phone || patient.phone || '',
    [PA_1663_PDF_FIELDS.city]: state.city || 'Philadelphia',
    [PA_1663_PDF_FIELDS.state]: state.state || 'PA',
    [PA_1663_PDF_FIELDS.zip]: state.zip || '',
    [PA_1663_PDF_FIELDS.caoOffice]: patient.caoOffice || '',
    [PA_1663_PDF_FIELDS.patientPrintName]: state.patientName || patient.name,
    [PA_1663_PDF_FIELDS.patientStatement]: state.patientStatement || patient.rationale || '',
    [PA_1663_PDF_FIELDS.employability]: employabilityCode,
    [PA_1663_PDF_FIELDS.disabilityBegin]: state.disabilityBeginDate || '',
    [PA_1663_PDF_FIELDS.disabilityEnd]: state.disabilityEndDate || patient.dueDate || '',
    [PA_1663_PDF_FIELDS.examinationFindings]: providerBlock,
    [PA_1663_PDF_FIELDS.diagnosisList]: deriveIcdList(patient),
    [PA_1663_PDF_FIELDS.providerName]: state.providerName || 'Siobhan Mita, MD',
    [PA_1663_PDF_FIELDS.providerPhone]: '(215) 662-4000',
    [PA_1663_PDF_FIELDS.providerAddress]: '3400 Spruce Street, Philadelphia, PA 19104',
    [PA_1663_PDF_FIELDS.providerNpi]: state.providerNpi || '1234567890',
    [PA_1663_PDF_FIELDS.examDate]: state.examDate || todayISO(),
    [PA_1663_PDF_FIELDS.patientDate]: todayISO(),
    [PA_1663_PDF_FIELDS.patientDate2]: todayISO(),
  };
}

window.PA_1663_PDF_FIELDS = PA_1663_PDF_FIELDS;
window.buildPA1663FieldValues = buildPA1663FieldValues;
