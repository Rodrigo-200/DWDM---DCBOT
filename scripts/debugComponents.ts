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
  await page.waitForFunction(() => {
    const Ext = (window as unknown as { Ext?: any }).Ext;
    return Boolean(Ext && Ext.ComponentManager && Ext.ComponentManager.getCount?.() > 0);
  }).catch(() => undefined);

  const components = await page.evaluate(() => {
    const Ext = (window as unknown as { Ext?: any }).Ext;
    if (!Ext || !Ext.ComponentManager) {
      return [] as Array<Record<string, unknown>>;
    }

    const allIds = Object.keys(Ext.ComponentManager.map ?? {});
    const results: Array<Record<string, unknown>> = [];

    for (const id of allIds) {
      const cmp = Ext.ComponentManager.map[id];
      if (!cmp) {
        continue;
      }
      if (/horario|cal|week|ext-cal/i.test(id) || /horario|ext-cal/.test(cmp.xtype ?? '')) {
        results.push({
          id,
          xtype: cmp.xtype,
          className: cmp.el?.dom?.className ?? null,
          text: cmp.text ?? cmp.el?.dom?.textContent?.trim() ?? null
        });
      }
    }

    const sample = allIds.slice(0, 50).map((id) => {
      const cmp = Ext.ComponentManager.map[id];
      return {
        id,
        xtype: cmp?.xtype,
        className: cmp?.el?.dom?.className ?? null,
        text: cmp?.text ?? cmp?.el?.dom?.textContent?.trim() ?? null
      };
    });

    return { results, sample };
  });

  console.log(JSON.stringify(components, null, 2));

  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
