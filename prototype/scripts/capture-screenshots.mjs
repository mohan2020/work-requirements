import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prototypeDir = path.resolve(__dirname, '..');
const outDir = path.join(prototypeDir, 'screenshots');
const htmlPath = path.join(prototypeDir, 'pa_medicaid_exemption_workspace.v3.html');
const fileUrl = `file://${htmlPath}`;

fs.mkdirSync(outDir, { recursive: true });

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function capture(page, name, opts = {}) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? true });
  console.log(`Saved ${name}.png`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await wait(1500);

  // 1. Staff dashboard default
  await capture(page, '01-staff-dashboard');

  // 2. Settings modal
  await page.click('button[onclick="openSettingsModal()"]');
  await wait(400);
  await capture(page, '02-settings-modal');
  await page.click('button[onclick="closeSettingsModal()"]');
  await wait(400);

  // 3. Outreach drawer - John Smith (Tier 2)
  await page.locator('button:has-text("Outreach")').first().click();
  await wait(500);
  await capture(page, '03-outreach-drawer');
  await page.click('button:has-text("Generate Patient Outreach Draft")');
  await wait(1500);
  await capture(page, '04-outreach-ai-generated');
  await page.click('button:has-text("Close")');
  await wait(500);

  // 4. SMART on FHIR mode - Jane Doe (Tier 1)
  await page.locator('input[value="fhir"]').click();
  await wait(800);
  await capture(page, '05-fhir-jane-doe-tier1');

  // 5. SMART on FHIR - John Smith (Tier 2)
  await page.selectOption('#epic-patient-selector', 'P102');
  await wait(800);
  await capture(page, '06-fhir-john-smith-tier2');

  // 6. Sign form for John Smith
  const canvas = page.locator('#sig-pad-clinician');
  if (await canvas.count()) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 40, box.y + 30);
      await page.mouse.down();
      await page.mouse.move(box.x + 180, box.y + 50, { steps: 8 });
      await page.mouse.move(box.x + 120, box.y + 70, { steps: 6 });
      await page.mouse.up();
    }
    await capture(page, '07-fhir-signature-drawn');
    await page.click('button:has-text("Sign & Push to State HIO")');
    await wait(1200);
    await capture(page, '08-fhir-signed-completed');
  }

  // 7. Back to dashboard - metrics updated
  await page.locator('input[value="dashboard"]').click();
  await wait(800);
  await capture(page, '09-dashboard-after-signing');

  await browser.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
