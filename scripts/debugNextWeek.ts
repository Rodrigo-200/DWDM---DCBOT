import 'dotenv/config';
import { chromium } from 'playwright';

const TARGET_DATE = new Date(Date.UTC(2025, 10, 17));

const run = async () => {
  const { SCHEDULE_LOGIN_URL, SCHEDULE_USERNAME, SCHEDULE_PASSWORD, SCHEDULE_PORTAL_URL } = process.env;
  if (!SCHEDULE_LOGIN_URL || !SCHEDULE_USERNAME || !SCHEDULE_PASSWORD || !SCHEDULE_PORTAL_URL) {
    console.error('Missing NetPA environment variables.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
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
  await page.waitForTimeout(1_500);

  const result = await page.evaluate((timestamp) => {
    const target = new Date(Number(timestamp));
    const Ext = (window as unknown as { Ext?: any }).Ext;
    const cmp = Ext?.getCmp?.('horario-tb-jump-dt');

    const applyExt = () => {
      try {
        cmp?.setValue?.(target);
        cmp?.fireEvent?.('select', cmp, target);
        cmp?.fireEvent?.('change', cmp, target, target);
        cmp?.fireEvent?.('select', cmp, target);
        cmp?.triggerBlur?.();
      } catch (error) {
        return { appliedExt: false, error: String(error) };
      }
      return { appliedExt: true };
    };

    const applyDom = () => {
      const input = document.querySelector<HTMLInputElement>('#horario-tb-jump-dt-inputEl');
      if (!input) {
        return { appliedDom: false };
      }
      const formatted = target.toLocaleDateString('pt-PT');
      input.value = formatted;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      return { appliedDom: true, formatted };
    };

    const extResult = applyExt();
    const domResult = applyDom();
    return { extResult, domResult };
  }, TARGET_DATE.getTime());

  console.log(result);

  await page.waitForTimeout(2_000);

  const events = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.ext-cal-evt'))
      .slice(0, 5)
      .map((node) => node.textContent?.trim());
  });

  console.log({ events });

  await page.waitForTimeout(3_000);
  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
