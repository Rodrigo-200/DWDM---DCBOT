import 'dotenv/config';
import { chromium } from 'playwright';

const run = async () => {
  const { SCHEDULE_LOGIN_URL, SCHEDULE_USERNAME, SCHEDULE_PASSWORD } = process.env;
  if (!SCHEDULE_LOGIN_URL || !SCHEDULE_USERNAME || !SCHEDULE_PASSWORD) {
    console.error('Missing env');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(SCHEDULE_LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.click('#loginregisterLink').catch(() => undefined);
  await page.fill('input[name="_user"]', SCHEDULE_USERNAME);
  await page.fill('input[name="_pass"]', SCHEDULE_PASSWORD);
  await page.click('button:has-text("Entrar")').catch(() => undefined);
  await page.waitForTimeout(1_500);

  await page.goto('https://secretaria.virtual.ensinolusofona.pt/netpa/page?stage=HorarioAlunoSemanal', {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1_500);

  const html = await page.evaluate(() => {
    const evt = document.querySelector('.ext-cal-evt, .ext-cal-evt-inner');
    return evt ? evt.outerHTML : 'no event';
  });

  console.log(html);

  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
