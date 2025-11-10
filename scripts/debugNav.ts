import 'dotenv/config';
import { chromium } from 'playwright';

const run = async () => {
  const { SCHEDULE_LOGIN_URL, SCHEDULE_USERNAME, SCHEDULE_PASSWORD, SCHEDULE_PORTAL_URL } = process.env;
  if (!SCHEDULE_LOGIN_URL || !SCHEDULE_USERNAME || !SCHEDULE_PASSWORD || !SCHEDULE_PORTAL_URL) {
    console.error('Missing NetPA environment variables.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(SCHEDULE_LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.click('#loginregisterLink').catch(() => undefined);
  await page.waitForTimeout(500);
  await page.fill('input[name="_user"]', SCHEDULE_USERNAME);
  await page.fill('input[name="_pass"]', SCHEDULE_PASSWORD);
  await page.click('button:has-text("Entrar")').catch(() => undefined);
  await page.waitForTimeout(1_500);

  await page.goto(SCHEDULE_PORTAL_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1_000);

  const nav = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('#horario-tb-jump-dt-inputEl');

  const navElements = Array.from(document.querySelectorAll('[class*="ext-cal-nav"], [class*="horario-week"]'))
      .slice(0, 50)
      .map((node) => ({
        tag: node.tagName,
        id: node.id,
        classList: node.className,
        text: node.textContent?.trim(),
        html: node.outerHTML.slice(0, 200)
      }));

    const toolbar = document.querySelector('#horario-tb-jump-dt');
    const toolbarSummary = toolbar
      ? {
          tag: toolbar.tagName,
          id: toolbar.id,
          classList: toolbar.className,
          html: toolbar.outerHTML.slice(0, 1600)
        }
      : null;

    return { navElements, toolbarSummary, inputValue: input?.value ?? null };
  });

  console.log(JSON.stringify(nav, null, 2));

  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
