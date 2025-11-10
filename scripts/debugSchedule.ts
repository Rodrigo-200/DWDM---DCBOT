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
  await page.click('#loginregisterLink').catch(() => {});
  await page.waitForTimeout(500);
  await page.fill('input[name="_user"]', SCHEDULE_USERNAME);
  await page.fill('input[name="_pass"]', SCHEDULE_PASSWORD);
  await page.click('button:has-text("Entrar")').catch(() => {});
  await page.waitForTimeout(1_500);

  if (SCHEDULE_PORTAL_URL) {
    await page.goto(SCHEDULE_PORTAL_URL, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(2_000);
  }

  const menuAreaConsultas = page.locator('a:has-text("Área consultas")').first();
  if ((await menuAreaConsultas.count()) > 0) {
    await menuAreaConsultas.hover({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(300);
    const horarioLink = page.locator('a:has-text("Horário")').filter({ hasText: 'Horário' }).first();
    if ((await horarioLink.count()) > 0) {
      await horarioLink.click({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(1_500);
    }
  }

  const frameSummaries = page.frames().map((frame) => ({ name: frame.name(), url: frame.url() }));

  const data = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('.fc-view-container, table'));
    const events = Array.from(
      document.querySelectorAll(
        '.fc-event, .fc-daygrid-event, .fc-timegrid-event, .fc-list-event, .ext-cal-evt, .ext-cal-evt-inner'
      )
    );
    const cookieForm = document.querySelector('#cookiesPolicyForm');
    const cookieButtons = cookieForm
      ? Array.from(cookieForm.querySelectorAll('button, input[type="submit"], a'))
          .map((node) => ({
            tag: node.tagName,
            type: (node as HTMLInputElement).type,
            text: node.textContent?.trim(),
            id: node.id,
            classes: node.className
          }))
      : [];
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'))
      .map((node) => ({
        tag: node.tagName,
        type: (node as HTMLInputElement).type,
        text: node.textContent?.trim().replace(/\s+/g, ' '),
        id: node.id,
        classes: node.className
      }))
      .slice(0, 50);

    const selects = Array.from(document.querySelectorAll('select')).map((node) => ({
      id: node.id,
      name: node.getAttribute('name'),
      classes: node.className,
      options: Array.from(node.querySelectorAll('option')).map((option) => ({
        value: option.value,
        text: option.textContent?.trim(),
        selected: option.selected
      }))
    }));

    const tables = Array.from(document.querySelectorAll('table')).map((table) => ({
      id: table.id,
      classes: table.className,
      headers: Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim())
    }));

    return {
      sectionCount: sections.length,
      eventCount: events.length,
      eventSamples: events.slice(0, 5).map((node) => ({
        classes: node.className,
        text: node.textContent?.trim(),
        html: node.outerHTML.slice(0, 200)
      })),
      cookieFormPresent: Boolean(cookieForm),
      cookieButtons,
      buttons,
      selects,
      tables,
      htmlSample: document.body.innerHTML.slice(0, 1000)
    };
  });

  console.log('frames', frameSummaries);
  console.log(JSON.stringify(data, null, 2));

  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
