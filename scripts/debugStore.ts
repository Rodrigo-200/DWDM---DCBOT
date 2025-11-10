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
    const store = (window as unknown as Record<string, unknown>).extvar_horario_event_store as Record<string, unknown> | undefined;
    if (!store) {
      return null;
    }

    const summarise = (value: unknown) => {
      if (!value) {
        return value;
      }
      if (Array.isArray(value)) {
        return value.slice(0, 5);
      }
      if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 10));
      }
      return value;
    };

    const dataItems = Array.isArray((store as any).data?.items)
      ? (store as any).data.items.slice(0, 5).map((item: any) => ({
          data: summarise(item.data),
          date: item.data?.StartDate ?? item.data?.start ?? null
        }))
      : [];

    return {
      keys: Object.keys(store).slice(0, 20),
      hasLoad: typeof (store as any).load === 'function',
      hasReload: typeof (store as any).reload === 'function',
      dataCount: (store as any).data?.items?.length ?? null,
      dataItems,
      baseParams: summarise((store as any).baseParams),
      lastOptions: summarise((store as any).lastOptions)
    };
  });

  console.log(JSON.stringify(info, null, 2));

  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
