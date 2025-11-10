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

  const info = await page.evaluate(() => {
    const Ext = (window as unknown as { Ext?: any }).Ext;
    if (!Ext) {
      return { hasExt: false };
    }

    const cmp = Ext.getCmp?.('horario-tb-jump-dt');
    if (!cmp) {
      return { hasExt: true, foundComponent: false };
    }

    const enrich = (value: unknown) => {
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).slice(0, 10));
      }
      return value;
    };

    return {
      hasExt: true,
      foundComponent: true,
      xtype: cmp.xtype,
      value: cmp.getValue?.(),
      rawValue: cmp.getRawValue?.(),
      initialConfig: enrich(cmp.initialConfig),
      minValue: cmp.minValue ?? null,
      maxValue: cmp.maxValue ?? null,
      componentId: cmp.id
    };
  });

  console.log(JSON.stringify(info, null, 2));

  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
