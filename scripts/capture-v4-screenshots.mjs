import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const v4Dir = path.join(root, 'v4');
const outDir = path.join(root, 'screenshots');
const baseUrl = `file://${path.join(v4Dir, 'index.html')}`;
const wizardUrl = `file://${path.join(v4Dir, 'form-mapping-wizard.html')}`;

fs.mkdirSync(outDir, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function capture(page, name, opts = {}) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: opts.fullPage ?? true });
  console.log(`Saved ${name}.png`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Staff dashboard (Engage worklist)
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await wait(1500);
  await capture(page, '01-staff-dashboard');

  // 2. Outreach drawer — play button, reached patient, form fields
  await page.locator('button.play-btn').first().click();
  await wait(600);
  await page.evaluate(() => {
    setStaffReached('Yes');
    setStaffForm('PA_MF');
  });
  await wait(500);
  await capture(page, '10-v4-forms-questionnaire', { fullPage: false });

  await page.evaluate(() => closeStaffDrawer());
  await wait(400);

  // 3. Settings modal
  await page.locator('[onclick="openSettingsModal()"]').first().click();
  await wait(400);
  await capture(page, '02-settings-modal', { fullPage: false });
  await page.evaluate(() => closeSettingsModal());
  await wait(400);

  // 4. FHIR mode — Form Package + Clinical Overview
  await page.locator('input[value="fhir"]').click();
  await wait(800);
  await page.click('button:has-text("Form Package")');
  await wait(600);
  await capture(page, '11-v4-fhir-form-package');

  await page.click('button:has-text("Clinical Overview")');
  await wait(400);
  await capture(page, '05-fhir-jane-doe-tier1');

  await page.selectOption('#epic-patient-selector', 'P102');
  await wait(700);
  await capture(page, '06-fhir-john-smith-tier2');

  const canvas = page.locator('#sig-pad-clinician');
  if (await canvas.count()) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 40, box.y + 30);
      await page.mouse.down();
      await page.mouse.move(box.x + 180, box.y + 50, { steps: 8 });
      await page.mouse.up();
    }
    await capture(page, '07-fhir-signature-drawn');
    await page.click('button:has-text("Sign & Push to State HIO")');
    await wait(1200);
    await capture(page, '08-fhir-signed-completed');
  }

  await page.locator('input[value="dashboard"]').click();
  await wait(600);
  await capture(page, '09-dashboard-after-signing');

  // 5. Form mapping wizard — map step with field inventory
  const wizardPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await wizardPage.goto(wizardUrl, { waitUntil: 'networkidle' });
  await wait(1500);
  await wizardPage.evaluate(async () => {
    await pickTemplateFromInventory();
    setStep(2);
  });
  await wait(800);
  await capture(wizardPage, '12-form-mapping-admin');

  await browser.close();
  console.log('v4 screenshots done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
