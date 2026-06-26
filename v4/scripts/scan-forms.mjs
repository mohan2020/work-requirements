#!/usr/bin/env node
/**
 * Scan assets/*.pdf and update forms-manifest + field inventory.
 * Usage: node scripts/scan-forms.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'assets');
const manifestPath = path.join(assetsDir, 'forms-manifest.json');
const inventoryPath = path.join(assetsDir, 'form-field-inventory.json');

async function extractFields(pdfPath) {
  const bytes = fs.readFileSync(pdfPath);
  const doc = await PDFDocument.load(bytes);
  return doc.getForm().getFields().map((f) => ({
    name: f.getName(),
    type: f.constructor.name.replace('PDF', ''),
  }));
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const inventory = { scannedAt: new Date().toISOString(), forms: {} };

for (const form of manifest.forms) {
  if (!form.templatePath) {
    inventory.forms[form.id] = { templatePath: null, fields: [], note: form.notes || 'No template' };
    continue;
  }
  const fullPath = path.join(root, form.templatePath.replace(/^assets\//, 'assets/'));
  if (!fs.existsSync(fullPath)) {
    inventory.forms[form.id] = { templatePath: form.templatePath, fields: [], error: 'File not found' };
    continue;
  }
  const fields = await extractFields(fullPath);
  inventory.forms[form.id] = { templatePath: form.templatePath, fieldCount: fields.length, fields };
  console.log(`${form.id}: ${fields.length} AcroForm fields in ${form.templatePath}`);
}

fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));
console.log(`Wrote ${inventoryPath}`);
