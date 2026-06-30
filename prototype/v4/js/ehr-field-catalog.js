/**
 * EHR / FHIR field catalog — fields available from SMART on FHIR launch context.
 * Used by the form mapping wizard to connect PDF AcroForm fields to clinical data.
 */
const EHR_FIELD_CATALOG = {
  version: 1,
  description: 'Fields resolved from Epic via SMART on FHIR Patient, Condition, Practitioner, Coverage resources',
  categories: [
    {
      id: 'demographics',
      label: 'Patient demographics',
      icon: 'user',
      fields: [
        { id: 'patient.name', label: 'Full legal name', fhir: 'Patient.name', type: 'string', sample: 'Jane Doe' },
        { id: 'patient.firstName', label: 'First name', fhir: 'Patient.name.given', type: 'string', sample: 'Jane' },
        { id: 'patient.lastName', label: 'Last name', fhir: 'Patient.name.family', type: 'string', sample: 'Doe' },
        { id: 'patient.dob', label: 'Date of birth', fhir: 'Patient.birthDate', type: 'date', sample: '1988-04-12' },
        { id: 'patient.gender', label: 'Sex at birth', fhir: 'Patient.gender', type: 'string', sample: 'female' },
        { id: 'patient.mrn', label: 'Medical record number (MRN)', fhir: 'Patient.identifier[MRN]', type: 'string', sample: '100-200-300' },
        { id: 'patient.medicaidId', label: 'PA Medicaid / MA ID', fhir: 'Coverage.subscriberId', type: 'string', sample: '1234567890' },
        { id: 'patient.ssn', label: 'Social Security number', fhir: 'Patient.identifier[SS]', type: 'string', sample: '(manual — not auto-exported)' },
      ],
    },
    {
      id: 'contact',
      label: 'Contact & address',
      icon: 'map-pin',
      fields: [
        { id: 'patient.address', label: 'Full mailing address', fhir: 'Patient.address.text', type: 'string', sample: '1234 Walnut St, Philadelphia, PA 19107' },
        { id: 'patient.addressLine', label: 'Street address', fhir: 'Patient.address.line', type: 'string', sample: '1234 Walnut St' },
        { id: 'patient.city', label: 'City', fhir: 'Patient.address.city', type: 'string', sample: 'Philadelphia' },
        { id: 'patient.state', label: 'State', fhir: 'Patient.address.state', type: 'string', sample: 'PA' },
        { id: 'patient.zip', label: 'ZIP code', fhir: 'Patient.address.postalCode', type: 'string', sample: '19107' },
        { id: 'patient.phone', label: 'Primary phone', fhir: 'Patient.telecom[phone]', type: 'tel', sample: '(215) 555-0199' },
        { id: 'patient.email', label: 'Email', fhir: 'Patient.telecom[email]', type: 'email', sample: 'jane.doe@example.com' },
        { id: 'patient.caoOffice', label: 'County Assistance Office', fhir: '(registry)', type: 'string', sample: 'Philadelphia CAO — 1348 W Sedgley Ave' },
      ],
    },
    {
      id: 'clinical',
      label: 'Clinical & diagnoses',
      icon: 'stethoscope',
      fields: [
        { id: 'clinical.problemList', label: 'Active problem list (plain text)', fhir: 'Condition.code.text', type: 'textarea', sample: 'Major depressive disorder, recurrent, severe\nType 2 diabetes mellitus' },
        { id: 'clinical.icdList', label: 'Diagnoses with ICD-10 codes', fhir: 'Condition.code → ICD-10', type: 'textarea', sample: 'F33.2 — Major depressive disorder, recurrent severe\nE11.9 — Type 2 diabetes mellitus' },
        { id: 'clinical.rationale', label: 'Clinical exemption rationale summary', fhir: '(derived)', type: 'textarea', sample: 'Recurrent severe MDD with functional impairment limiting 80-hr community engagement' },
        { id: 'clinical.utilization12mo', label: 'ED visits (12 months)', fhir: '(analytics)', type: 'number', sample: '4' },
        { id: 'clinical.medCount', label: 'Active medication count', fhir: 'MedicationRequest (active)', type: 'number', sample: '12' },
        { id: 'clinical.exemptionTier', label: 'Exemption tier / status', fhir: '(registry)', type: 'string', sample: 'ELIGIBLE_TIER_2' },
      ],
    },
    {
      id: 'provider',
      label: 'Provider & attestation',
      icon: 'user-check',
      fields: [
        { id: 'provider.name', label: 'Attending provider name', fhir: 'Practitioner.name', type: 'string', sample: 'Siobhan Mita, MD' },
        { id: 'provider.npi', label: 'Provider NPI', fhir: 'Practitioner.identifier[NPI]', type: 'string', sample: '1234567890' },
        { id: 'provider.title', label: 'Credentials', fhir: 'Practitioner.qualification', type: 'string', sample: 'MD' },
        { id: 'provider.phone', label: 'Provider phone', fhir: 'Practitioner.telecom', type: 'tel', sample: '(215) 662-4000' },
        { id: 'provider.address', label: 'Provider practice address', fhir: 'Organization.address', type: 'string', sample: '3400 Spruce Street, Philadelphia, PA 19104' },
        { id: 'provider.notes', label: 'Clinical justification / physician notes', fhir: '(DocumentReference)', type: 'textarea', sample: 'Patient demonstrates severe functional impairment...' },
      ],
    },
    {
      id: 'system',
      label: 'System-generated',
      icon: 'clock',
      fields: [
        { id: 'system.today', label: 'Today\'s date', fhir: '(system)', type: 'date', sample: new Date().toISOString().split('T')[0] },
        { id: 'system.signatureDate', label: 'Signature date', fhir: '(system)', type: 'date', sample: new Date().toISOString().split('T')[0] },
        { id: 'system.examDate', label: 'Exam / attestation date', fhir: '(system)', type: 'date', sample: new Date().toISOString().split('T')[0] },
      ],
    },
    {
      id: 'manual',
      label: 'Manual entry only',
      icon: 'pen-line',
      fields: [
        { id: 'manual.patientSignature', label: 'Patient wet signature', fhir: '—', type: 'signature', sample: '(captured at signing)' },
        { id: 'manual.providerSignature', label: 'Provider wet signature', fhir: '—', type: 'signature', sample: '(captured at signing)' },
        { id: 'manual.custom', label: 'Custom manual field', fhir: '—', type: 'string', sample: '(staff enters at form fill time)' },
      ],
    },
  ],
};

/** Flat list for dropdowns */
function getAllEhrFields() {
  const fields = [];
  EHR_FIELD_CATALOG.categories.forEach((cat) => {
    cat.fields.forEach((f) => {
      fields.push({ ...f, category: cat.label, categoryId: cat.id });
    });
  });
  return fields;
}

function getEhrFieldById(id) {
  return getAllEhrFields().find((f) => f.id === id) || null;
}

/** Sample patient values for preview fill */
const SAMPLE_PATIENT_VALUES = {
  'patient.name': 'Jane Doe',
  'patient.firstName': 'Jane',
  'patient.lastName': 'Doe',
  'patient.dob': '04/12/1988',
  'patient.gender': 'female',
  'patient.mrn': '100-200-300',
  'patient.medicaidId': '9876543210',
  'patient.address': '1234 Walnut St',
  'patient.addressLine': '1234 Walnut St',
  'patient.city': 'Philadelphia',
  'patient.state': 'PA',
  'patient.zip': '19107',
  'patient.phone': '(215) 555-0199',
  'patient.email': 'jane.doe@example.com',
  'patient.caoOffice': 'Philadelphia CAO — 1348 W Sedgley Ave',
  'clinical.problemList': 'Major depressive disorder, recurrent, severe',
  'clinical.icdList': 'F33.2 — Major depressive disorder, recurrent severe\nE11.9 — Type 2 diabetes mellitus',
  'clinical.rationale': 'Recurrent severe MDD with functional impairment limiting 80-hr community engagement',
  'clinical.utilization12mo': '4',
  'clinical.medCount': '12',
  'provider.name': 'Siobhan Mita, MD',
  'provider.npi': '1234567890',
  'provider.title': 'MD',
  'provider.phone': '(215) 662-4000',
  'provider.address': '3400 Spruce Street, Philadelphia, PA 19104',
  'provider.notes': 'Patient demonstrates severe functional impairment per clinical evaluation.',
  'system.today': new Date().toLocaleDateString('en-US'),
  'system.signatureDate': new Date().toLocaleDateString('en-US'),
  'system.examDate': new Date().toLocaleDateString('en-US'),
};

function resolveEhrSampleValue(fieldId) {
  if (!fieldId) return '';
  return SAMPLE_PATIENT_VALUES[fieldId] ?? getEhrFieldById(fieldId)?.sample ?? '';
}

window.EHR_FIELD_CATALOG = EHR_FIELD_CATALOG;
window.getAllEhrFields = getAllEhrFields;
window.getEhrFieldById = getEhrFieldById;
window.SAMPLE_PATIENT_VALUES = SAMPLE_PATIENT_VALUES;
window.resolveEhrSampleValue = resolveEhrSampleValue;
