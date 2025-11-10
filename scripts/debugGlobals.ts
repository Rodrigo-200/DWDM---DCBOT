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

  const globals = await page.evaluate(() => {
    const keys = Object.keys(window)
      .filter((key) => /horario|cal|calendar|agenda|schedule/i.test(key))
      .slice(0, 100);
    const summaries: Array<Record<string, unknown>> = [];
    const globalRef = window as unknown as Record<string, unknown>;
    for (const key of keys) {
      const value = globalRef[key];
      summaries.push({
        key,
        type: typeof value,
        hasMoveNext: typeof (value as { moveNext?: unknown }).moveNext === 'function',
        hasSetStartDate: typeof (value as { setStartDate?: unknown }).setStartDate === 'function'
      });
    }
    return summaries;
  });

  console.log(JSON.stringify(globals, null, 2));

  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
