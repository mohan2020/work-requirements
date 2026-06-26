# Overview and Approach

## 1. Core forms required

### PA Medical Frailty Self-Declaration & Provider Attestation Form
This form is the primary document used by Pennsylvania DHS for the Medicaid community engagement and work-requirement pathway. It supports two clinical enrollment pathways:

- Section A: Patient Self-Declaration
  - Completed by the patient to describe their health condition.
  - Includes treating provider contact information.
- Section B: Provider Certification
  - Completed and signed by a licensed physician, physician assistant (PA), certified registered nurse practitioner (CRNP), or psychologist.
  - The provider checks boxes confirming that a physical, mental, or substance-use disorder significantly impairs the patient’s ability to engage in 80 hours of monthly work or community service.

### PA 1663 (Employability Assessment Form)
This form is used as an alternative pathway when the patient is also qualifying for broader state-level cash or medical assistance exemptions due to temporary or permanent disability.

## 2. SNOMED-CT to ICD-10 clinical mapping

Pennsylvania DHS uses automated administrative lookbacks based on ICD-10 billing codes, while Penn Medicine clinicians document conditions in the EHR using SNOMED-CT concepts on active problem lists. The application must map the following high-priority diagnostic categories to support automated identification.

### Clinical code mapping

| Clinical condition category | Example ICD-10 billing codes (PA DHS draft) | Equivalent SNOMED-CT concepts (EHR problem list) |
| --- | --- | --- |
| Serious Mental Illness (SMI) | F20.9, F31.9, F33.2 | 58214004, 13746004, 28475009 |
| Substance Use Disorders (SUD) | F11.20, F10.20 | 5602001, 28743005 |
| Active Oncological Conditions | C50.919, C18.9 | 254837009, 126852002 |
| End-Stage Organ Diseases | N18.6, I50.9 | 432241000124101, 85232005 |

## 3. Secondary-tier logic

For complex cases without a single clear-cut diagnosis code, the system should track multiple co-occurring conditions and utilization patterns. This supports more nuanced eligibility review when a patient has overlapping clinical needs or a history of repeated high-acuity care.

## 4. Intended workflow

1. Review the patient’s active problem list in the EHR.
2. Identify the most relevant SNOMED-CT concepts.
3. Map those concepts to the corresponding ICD-10 billing codes used by DHS.
4. Generate the appropriate form package and support the submission workflow.