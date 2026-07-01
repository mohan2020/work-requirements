/**
 * Custom PDF overlay fields — regions on the form with no usable AcroForm widget
 * (e.g. PA 1663 employability checkboxes, patient explanation textarea).
 *
 * Overlays are placed by page + PDF coordinates (points, origin bottom-left).
 */
const CUSTOM_OVERLAY_TEMPLATES = {
  'assets/PA_1663_official.pdf': [
    {
      customId: 'pa1663.patientExplain',
      pdfField: 'Patient — Briefly explain (custom)',
      label: 'Briefly explain why you cannot work',
      fieldType: 'textarea',
      pageIndex: 2,
      rect: { x: 37, y: 248, width: 537, height: 118 },
      defaultSource: 'ehr',
      defaultEhrFieldId: 'clinical.rationale',
    },
    {
      customId: 'pa1663.employability.permanent',
      pdfField: 'Employability — Permanently disabled (custom)',
      label: 'Option 1: Permanently disabled',
      fieldType: 'checkbox',
      pageIndex: 3,
      rect: { x: 41, y: 624, width: 16, height: 16 },
      defaultSource: 'manual',
      defaultManualLabel: 'Permanently disabled (SSD/SSI candidate)',
    },
    {
      customId: 'pa1663.employability.temp12',
      pdfField: 'Employability — Temp 12+ months (custom)',
      label: 'Option 2: Temporarily disabled 12+ months',
      fieldType: 'checkbox',
      pageIndex: 3,
      rect: { x: 41, y: 594, width: 16, height: 16 },
      defaultSource: 'manual',
      defaultManualLabel: 'Temporarily disabled — 12 months or more',
    },
    {
      customId: 'pa1663.employability.tempLt12',
      pdfField: 'Employability — Temp <12 months (custom)',
      label: 'Option 3: Temporarily disabled <12 months',
      fieldType: 'checkbox',
      pageIndex: 3,
      rect: { x: 41, y: 564, width: 16, height: 16 },
      defaultSource: 'manual',
      defaultManualLabel: 'Temporarily disabled — less than 12 months',
    },
    {
      customId: 'pa1663.employability.employable',
      pdfField: 'Employability — Employable (custom)',
      label: 'Option 4: Employable',
      fieldType: 'checkbox',
      pageIndex: 3,
      rect: { x: 41, y: 534, width: 16, height: 16 },
      defaultSource: 'manual',
      defaultManualLabel: 'Employable — can work full or part time',
    },
    {
      customId: 'pa1663.disabilityBegin',
      pdfField: 'Disability began (custom)',
      label: 'Disability began (date)',
      fieldType: 'date',
      pageIndex: 3,
      rect: { x: 420, y: 548, width: 48, height: 18 },
      defaultSource: 'ehr',
      defaultEhrFieldId: 'system.today',
    },
    {
      customId: 'pa1663.disabilityEnd',
      pdfField: 'Disability expected end (custom)',
      label: 'Expected to last until (date)',
      fieldType: 'date',
      pageIndex: 3,
      rect: { x: 420, y: 460, width: 48, height: 18 },
      defaultSource: 'manual',
      defaultManualLabel: 'Expected end date',
    },
    {
      customId: 'pa1663.examResults',
      pdfField: 'Examination results (custom)',
      label: 'Examination results — clinical findings',
      fieldType: 'textarea',
      pageIndex: 3,
      rect: { x: 37, y: 168, width: 380, height: 72 },
      defaultSource: 'ehr',
      defaultEhrFieldId: 'clinical.rationale',
    },
    {
      customId: 'pa1663.diagnosisBlock',
      pdfField: 'Diagnosis / ICD block (custom)',
      label: 'Diagnosis(es) with ICD-10',
      fieldType: 'textarea',
      pageIndex: 3,
      rect: { x: 37, y: 248, width: 350, height: 52 },
      defaultSource: 'ehr',
      defaultEhrFieldId: 'clinical.icdList',
    },
  ],
};

const CUSTOM_FIELD_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'textarea', label: 'Text area' },
  { id: 'date', label: 'Date' },
  { id: 'checkbox', label: 'Checkbox' },
];

function customPdfType(fieldType) {
  const map = {
    text: 'CustomText',
    textarea: 'CustomTextarea',
    date: 'CustomDate',
    checkbox: 'CustomCheckbox',
  };
  return map[fieldType] || 'CustomField';
}

function getCustomOverlaysForTemplate(templatePath) {
  if (!templatePath) return [];
  return CUSTOM_OVERLAY_TEMPLATES[templatePath] || [];
}

const TEXT_ALIGN_OPTIONS = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
];

function getDefaultFontSize(fieldType) {
  if (fieldType === 'textarea') return 7;
  return 8;
}

function resolveFieldFormat(mapping) {
  const fieldType = mapping?.fieldType || 'text';
  return {
    textAlign: mapping?.textAlign || 'left',
    fontSize: mapping?.fontSize ?? getDefaultFontSize(fieldType),
  };
}

function fieldSupportsTextFormat(mapping) {
  if (!mapping || mapping.source === 'skip') return false;
  if (mapping.fieldType === 'checkbox') return false;
  if (mapping.pdfType === 'CheckBox' || mapping.pdfType === 'Button' || mapping.pdfType === 'Signature') return false;
  if (mapping.isCustom) return true;
  return mapping.pdfType === 'TextField';
}

function buildCustomMapping(overlay, pageHeight = 792) {
  const fieldType = overlay.fieldType;
  return {
    pdfField: overlay.pdfField,
    pdfType: customPdfType(fieldType),
    fieldType,
    isCustom: true,
    customId: overlay.customId || `custom.${Date.now()}`,
    pageIndex: overlay.pageIndex,
    rect: { ...overlay.rect },
    pageHeight,
    pdfValue: '',
    source: overlay.defaultSource || 'unmapped',
    ehrFieldId: overlay.defaultEhrFieldId || null,
    manualLabel: overlay.defaultManualLabel || overlay.label || null,
    textAlign: overlay.textAlign || 'left',
    fontSize: overlay.fontSize ?? getDefaultFontSize(fieldType),
  };
}

function mergeCustomOverlays(mappings, templatePath, pageHeights = [], dismissedIds = new Set()) {
  const defs = getCustomOverlaysForTemplate(templatePath);
  if (!defs.length) return mappings;

  const existingIds = new Set(mappings.filter((m) => m.customId).map((m) => m.customId));
  const merged = [...mappings];

  defs.forEach((def) => {
    if (existingIds.has(def.customId) || dismissedIds.has(def.customId)) return;
    const pageHeight = pageHeights[def.pageIndex] || 792;
    merged.push(buildCustomMapping(def, pageHeight));
  });

  return merged;
}

function dismissedCustomStorageKey(templatePath) {
  return `pdf-map-dismissed:${templatePath || 'unknown'}`;
}

function loadDismissedCustomIds(templatePath) {
  if (!templatePath) return new Set();
  try {
    const raw = localStorage.getItem(dismissedCustomStorageKey(templatePath));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (_) {
    return new Set();
  }
}

function saveDismissedCustomIds(templatePath, dismissedIds) {
  if (!templatePath) return;
  localStorage.setItem(
    dismissedCustomStorageKey(templatePath),
    JSON.stringify([...dismissedIds])
  );
}

function autoSkipTinyAcroFields(mappings) {
  return mappings.map((m) => {
    if (m.isCustom) return m;
    if (m.rect?.height && m.rect.height < 12) {
      return { ...m, source: 'skip', ehrFieldId: null, manualLabel: null };
    }
    return m;
  });
}

/** Resolve display / export value for a mapping row. */
function resolveMappingPreviewValue(m) {
  if (m.source === 'skip' || m.source === 'unmapped') return '';
  if (m.source === 'ehr' && m.ehrFieldId) return resolveEhrSampleValue(m.ehrFieldId) || '';
  if (m.source === 'manual') return m.manualLabel || '';
  return '';
}

function alignedTextX(line, font, fontSize, rect, textAlign, padding = 2) {
  const innerWidth = rect.width - padding * 2;
  const textWidth = font.widthOfTextAtSize(line, fontSize);
  switch (textAlign) {
    case 'center':
      return rect.x + padding + Math.max(0, (innerWidth - textWidth) / 2);
    case 'right':
      return rect.x + rect.width - padding - textWidth;
    default:
      return rect.x + padding;
  }
}

function wrapTextToWidth(text, font, fontSize, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
}

/** Draw custom overlay values onto PDF pages (preview / export). */
async function drawCustomOverlaysOnPdf(doc, mappings) {
  const PDFLib = await loadPdfLibForMapper();
  const { rgb, StandardFonts } = PDFLib;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  mappings.filter((m) => m.isCustom && m.source !== 'skip').forEach((m) => {
    const page = pages[m.pageIndex];
    if (!page || !m.rect) return;
    const value = resolveMappingPreviewValue(m);
    const rect = m.rect;

    if (m.fieldType === 'checkbox') {
      if (value) {
        page.drawText('X', {
          x: rect.x + 2,
          y: rect.y + rect.height / 2 - 4,
          size: Math.min(12, rect.height - 2),
          font,
          color: rgb(0.1, 0.15, 0.3),
        });
      }
      return;
    }

    if (!value) return;
    const text = String(value);
    const { textAlign, fontSize } = resolveFieldFormat(m);
    const padding = 2;
    const maxWidth = rect.width - padding * 2;
    const lineGap = 2;

    if (m.fieldType === 'textarea') {
      const lines = wrapTextToWidth(text, font, fontSize, maxWidth);
      const maxLines = Math.max(1, Math.floor(rect.height / (fontSize + lineGap)));
      let lineY = rect.y + rect.height - fontSize - padding;
      lines.slice(0, maxLines).forEach((line) => {
        if (lineY < rect.y + padding) return;
        page.drawText(line, {
          x: alignedTextX(line, font, fontSize, rect, textAlign, padding),
          y: lineY,
          size: fontSize,
          font,
          color: rgb(0.1, 0.15, 0.3),
        });
        lineY -= fontSize + lineGap;
      });
    } else {
      const singleLine = text.replace(/\s+/g, ' ').substring(0, 500);
      page.drawText(singleLine, {
        x: alignedTextX(singleLine, font, fontSize, rect, textAlign, padding),
        y: rect.y + rect.height - fontSize - padding,
        size: fontSize,
        font,
        color: rgb(0.1, 0.15, 0.3),
        maxWidth,
      });
    }
  });
}

function createUserCustomOverlay({ label, fieldType, pageIndex, rect, pageHeight }) {
  const safeLabel = label || 'Custom field';
  return buildCustomMapping({
    customId: `user.${Date.now()}`,
    pdfField: `${safeLabel} (custom)`,
    label: safeLabel,
    fieldType: fieldType || 'text',
    pageIndex,
    rect,
    defaultSource: 'unmapped',
  }, pageHeight);
}

window.CUSTOM_OVERLAY_TEMPLATES = CUSTOM_OVERLAY_TEMPLATES;
window.CUSTOM_FIELD_TYPES = CUSTOM_FIELD_TYPES;
window.TEXT_ALIGN_OPTIONS = TEXT_ALIGN_OPTIONS;
window.getDefaultFontSize = getDefaultFontSize;
window.resolveFieldFormat = resolveFieldFormat;
window.fieldSupportsTextFormat = fieldSupportsTextFormat;
window.getCustomOverlaysForTemplate = getCustomOverlaysForTemplate;
window.mergeCustomOverlays = mergeCustomOverlays;
window.autoSkipTinyAcroFields = autoSkipTinyAcroFields;
window.resolveMappingPreviewValue = resolveMappingPreviewValue;
window.drawCustomOverlaysOnPdf = drawCustomOverlaysOnPdf;
window.createUserCustomOverlay = createUserCustomOverlay;
window.loadDismissedCustomIds = loadDismissedCustomIds;
window.saveDismissedCustomIds = saveDismissedCustomIds;
