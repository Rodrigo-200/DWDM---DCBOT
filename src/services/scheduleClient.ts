import { chromium, type BrowserContext, type Frame, type Page } from 'playwright';

import type { Env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

export interface ScheduleEntry {
  title: string;
  time: string;
  location: string;
  lecturer: string;
  date?: string;
  start?: string;
}

interface ScheduleClientOptions {
  env: Env;
}

interface FetchScheduleOptions {
  weekOffset?: number;
}

interface StoreEventRaw {
  titleHtml: string;
  startIso: string;
  endIso: string;
  locationHtml: string;
  notesHtml: string;
}

const humanPause = async (minMs: number, maxMs: number) => {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
};

type PageLike = Page | Frame;

const ENTRAR_SELECTORS = [
  'button:has-text("Entrar")',
  'a:has-text("Entrar")',
  'button:has-text("Aceder")',
  'a:has-text("Aceder")',
  'button:has-text("Iniciar sessão")',
  'a:has-text("Iniciar sessão")',
  '#entrar',
  '#loginregisterLink',
  '[data-action="open-login"]'
];

const USERNAME_SELECTORS = [
  'input[name="username"]',
  'input[name="_user"]',
  'input[id="username"]',
  'input[name="user"]',
  'input[id*="login"]',
  'input[type="email"]',
  'input[data-testid="username"]',
  'input.login-input[type="text"]'
];

const PASSWORD_SELECTORS = [
  'input[name="password"]',
  'input[name="_pass"]',
  'input[id="password"]',
  'input[type="password"]',
  'input[data-testid="password"]',
  'input.login-input[type="password"]'
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'button:has-text("Entrar")',
  'button:has-text("Login")',
  'input[type="submit"]',
  '[data-action="login"]'
];

const SCHEDULE_EVENT_SELECTOR =
  '.fc-event, .fc-daygrid-event, .fc-timegrid-event, .fc-list-event, .ext-cal-evt';

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

const NEXT_WEEK_SELECTORS = [
  'button.fc-next-button',
  'button.fc-next',
  '.fc-next-button',
  'button:has-text("Seguinte")',
  'button:has-text("Próxima semana")',
  'a:has-text("Semana seguinte")',
  '.ext-cal-week-right',
  '.ext-cal-nav-next',
  '.ext-cal-nav-forward',
  '.ext-cal-weekforward'
];

const PREV_WEEK_SELECTORS = [
  'button.fc-prev-button',
  'button.fc-prev',
  '.fc-prev-button',
  'button:has-text("Anterior")',
  'button:has-text("Semana anterior")',
  'a:has-text("Semana anterior")',
  '.ext-cal-week-left',
  '.ext-cal-nav-prev',
  '.ext-cal-nav-back',
  '.ext-cal-weekback'
];

const TARGET_CLOSED_REGEX = /Target page, context or browser has been closed/i;

export class ScheduleServiceUnavailableError extends Error {
  constructor(message = 'NetPA está temporariamente indisponível.') {
    super(message);
    this.name = 'ScheduleServiceUnavailableError';
  }
}

export class ScheduleClient {
  private readonly env: Env;

  constructor({ env }: ScheduleClientOptions) {
    this.env = env;
  }

  async fetchSchedule(options: FetchScheduleOptions = {}): Promise<ScheduleEntry[]> {
    const { weekOffset = 0 } = options;
    const browser = await chromium.launch({ headless: true });
    let context: BrowserContext | null = null;

    try {
      context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      logger.info('NetPA: opening login page');
      await page.goto(this.env.SCHEDULE_LOGIN_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await humanPause(600, 1000);
      await this.assertServiceAvailable(page);

      logger.info('NetPA: triggering login dialog');
      const initialPopup = await this.triggerLoginDialog(page);

      const { surface: loginSurface, popup } = await this.resolveLoginSurface(page, initialPopup);
      await this.assertServiceAvailable(loginSurface);
      logger.info('NetPA: filling credentials', {
        formHost: popup ? 'popup' : loginSurface === page ? 'page' : 'frame'
      });
      await this.fillLoginForm(loginSurface);

      if (popup) {
        await popup.waitForEvent('close', { timeout: 15_000 }).catch(() => undefined);
      }

      await this.awaitLoginCompletion(page);
  await this.assertServiceAvailable(page);

      logger.info('NetPA: navigating to schedule page');
      await page.goto(this.env.SCHEDULE_PORTAL_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
  await this.assertServiceAvailable(page);

      await this.ensureScheduleVisible(page);
  await this.assertServiceAvailable(page);

      let entries = await this.extractStoreEntries(page, weekOffset);
      if (entries.length) {
        logger.info('NetPA: extracted schedule entries', {
          count: entries.length,
          source: 'store',
          weekOffset
        });
        return entries;
      }

      if (weekOffset !== 0) {
        await this.navigateWeek(page, weekOffset);
      }

      entries = await this.extractDomEntries(page);
      logger.info('NetPA: extracted schedule entries', {
        count: entries.length,
        source: 'dom',
        weekOffset
      });
      return entries;
    } catch (error) {
      logger.error('Failed to fetch schedule', {
        error: error instanceof Error ? error.stack : String(error)
      });
      throw error;
    } finally {
      await context?.close();
      await browser.close();
    }
  }

  private async triggerLoginDialog(page: Page): Promise<Page | null> {
    for (const selector of ENTRAR_SELECTORS) {
      const locator = page.locator(selector).first();
      if ((await locator.count()) === 0) {
        continue;
      }
      const popupPromise = page.waitForEvent('popup', { timeout: 5_000 }).catch(() => null);
      await locator.click({ timeout: 5_000 }).catch(() => undefined);
      await humanPause(300, 600);
      return popupPromise;
    }
    return null;
  }

  private async resolveLoginSurface(page: Page, initialPopup: Page | null): Promise<{ surface: PageLike; popup: Page | null }> {
    const attempt = await this.tryResolveLoginSurface(page, initialPopup);
    if (attempt) {
      return attempt;
    }

    logger.warn('NetPA: login form not detected on first attempt, retrying');

    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await humanPause(500, 800);
    await this.assertServiceAvailable(page);

    const retryPopup = await this.triggerLoginDialog(page);
    const retryAttempt = await this.tryResolveLoginSurface(page, retryPopup);
    if (retryAttempt) {
      return retryAttempt;
    }

    logger.warn('NetPA: retrying login by navigating to portal page');
    await page.goto(this.env.SCHEDULE_PORTAL_URL, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await humanPause(500, 800);
    await this.assertServiceAvailable(page);

    const finalAttempt = await this.tryResolveLoginSurface(page, null);
    if (finalAttempt) {
      return finalAttempt;
    }

    throw new ScheduleServiceUnavailableError('Não foi possível abrir o formulário de autenticação do NetPA.');
  }

  private async tryResolveLoginSurface(page: Page, popupCandidate: Page | null) {
    const pageSurface = await this.waitForLoginForm(page, 12_000);
    if (pageSurface) {
      if (popupCandidate && !popupCandidate.isClosed()) {
        await popupCandidate.close().catch(() => undefined);
      }
      await this.assertServiceAvailable(pageSurface);
      return { surface: pageSurface, popup: null };
    }

    let popup = popupCandidate;
    if (!popup || popup.isClosed()) {
      popup = await page.waitForEvent('popup', { timeout: 5_000 }).catch(() => null);
    }
    if (popup && !popup.isClosed()) {
      const popupSurface = (await this.waitForLoginForm(popup, 12_000)) ?? popup;
      await this.assertServiceAvailable(popupSurface);
      return { surface: popupSurface, popup };
    }

    return null;
  }

  private async waitForLoginForm(target: Page, timeout: number): Promise<PageLike | null> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await this.isServiceUnavailable(target)) {
        throw new ScheduleServiceUnavailableError('NetPA está temporariamente indisponível.');
      }
      if (!target.isClosed() && (await this.surfaceHasSelector(target, USERNAME_SELECTORS))) {
        return target;
      }

      for (const frame of target.frames()) {
        if (frame === target.mainFrame()) {
          continue;
        }
        if (await this.isServiceUnavailable(frame)) {
          throw new ScheduleServiceUnavailableError('NetPA está temporariamente indisponível.');
        }
        if (await this.surfaceHasSelector(frame, USERNAME_SELECTORS)) {
          return frame;
        }
      }

      await humanPause(150, 300);
    }
    return null;
  }

  private async surfaceHasSelector(surface: PageLike, selectors: string[]) {
    for (const selector of selectors) {
      try {
        const locator = surface.locator(selector).first();
        if ((await locator.count()) > 0) {
          return true;
        }
      } catch (error) {
        if (error instanceof Error && TARGET_CLOSED_REGEX.test(error.message)) {
          throw error;
        }
      }
    }
    return false;
  }

  private async fillLoginForm(surface: PageLike) {
    const usernameSelector = await this.waitForVisibleSelector(surface, USERNAME_SELECTORS, 'utilizador');
    if (!usernameSelector) {
      throw new Error('Não foi possível encontrar o campo de utilizador no NetPA. Atualiza os selectores.');
    }

    const passwordSelector = await this.waitForVisibleSelector(surface, PASSWORD_SELECTORS, 'palavra-passe');
    if (!passwordSelector) {
      throw new Error('Não foi possível encontrar o campo de palavra-passe no NetPA. Atualiza os selectores.');
    }

    await surface.fill(usernameSelector, this.env.SCHEDULE_USERNAME);
    await humanPause(400, 900);
    await surface.fill(passwordSelector, this.env.SCHEDULE_PASSWORD);
    await humanPause(400, 900);

    const submitSelector = await this.waitForVisibleSelector(surface, SUBMIT_SELECTORS, 'botão Entrar', false);
    if (submitSelector) {
      await surface.click(submitSelector).catch(() => undefined);
    } else {
      await surface.locator(passwordSelector).press('Enter').catch(() => undefined);
    }
    await humanPause(600, 1000);
  }

  private async waitForVisibleSelector(
    surface: PageLike,
    selectors: string[],
    label: string,
    required = true
  ): Promise<string | null> {
    for (const selector of selectors) {
      try {
        const locator = surface.locator(selector).first();
        await locator.waitFor({ state: 'visible', timeout: 7_500 });
        return selector;
      } catch (error) {
        if (error instanceof Error && TARGET_CLOSED_REGEX.test(error.message)) {
          throw error;
        }
      }
    }
    if (required) {
      throw new Error(`Não foi possível encontrar o campo de ${label} no NetPA. Atualiza os selectores.`);
    }
    return null;
  }

  private async awaitLoginCompletion(page: Page) {
    await Promise.race([
      page.waitForSelector('a:has-text("SAIR")', { timeout: 15_000 }),
      page.waitForSelector('text=Meu Perfil', { timeout: 15_000 }),
      page.waitForURL((url) => url.toString().includes('stage=diHomeStage'), { timeout: 15_000 })
    ]).catch(() => undefined);
    await humanPause(600, 1200);
    await this.assertServiceAvailable(page);
  }

  private async ensureScheduleVisible(page: Page) {
    const submitButton = page
      .locator('button:has-text("Submeter"), input[type="submit"][value="Submeter"], button:has-text("Submit")')
      .first();
    if ((await submitButton.count()) > 0) {
      await submitButton.click({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForLoadState('networkidle').catch(() => undefined);
    }

    await this.waitForScheduleEntries(page);
    await this.assertServiceAvailable(page);
  }

  private async waitForScheduleEntries(page: Page) {
    await Promise.race([
      page.waitForSelector(
        `${SCHEDULE_EVENT_SELECTOR}, [data-schedule-row], table.schedule-table tbody tr, .fc-event-title`,
        { timeout: 15_000 }
      ),
      page.waitForSelector('text=/Serviço\s+Indisponível/i', { timeout: 15_000 })
    ]).catch(() => undefined);
    await this.assertServiceAvailable(page);
    await humanPause(600, 1200);
  }

  private async navigateWeek(page: Page, weekOffset: number): Promise<void> {
    const steps = Math.trunc(weekOffset);
    if (!steps) {
      return;
    }

    const selectors = steps > 0 ? NEXT_WEEK_SELECTORS : PREV_WEEK_SELECTORS;
    const iterations = Math.abs(steps);

    for (let index = 0; index < iterations; index += 1) {
      const clicked = await this.clickFirstMatch(page, selectors);
      if (!clicked) {
        logger.warn('NetPA: week navigation button not found', { direction: steps > 0 ? 'next' : 'previous' });
        break;
      }
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await this.waitForScheduleEntries(page);
    }
  }

  private async clickFirstMatch(page: Page, selectors: string[]): Promise<boolean> {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      try {
        if ((await locator.count()) === 0) {
          continue;
        }
        await locator.scrollIntoViewIfNeeded().catch(() => undefined);
        await locator.click({ timeout: 5_000 });
        await humanPause(300, 600);
        return true;
      } catch (error) {
        if (error instanceof Error && TARGET_CLOSED_REGEX.test(error.message)) {
          throw error;
        }
      }
    }
    return false;
  }

  private async extractStoreEntries(page: Page, weekOffset: number): Promise<ScheduleEntry[]> {
    const storeLoaded = await this.waitForEventStore(page);
    if (!storeLoaded) {
      logger.warn('NetPA: event store did not load, falling back to DOM parsing');
      return [];
    }

    const rawEvents = await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>).extvar_horario_event_store as
        | Record<string, unknown>
        | undefined;
      const items = (store as { data?: { items?: unknown[] } })?.data?.items;
      if (!Array.isArray(items)) {
        return [] as StoreEventRaw[];
      }
      return items.map((item) => {
        const data = (item as { data?: Record<string, unknown> }).data ?? {};
        const coerce = (value: unknown) => (typeof value === 'string' ? value : String(value ?? ''));
        return {
          titleHtml: coerce(data.Title ?? data.title ?? ''),
          startIso: coerce(data.Start ?? data.start ?? ''),
          endIso: coerce(data.End ?? data.end ?? ''),
          locationHtml: coerce(data.Location ?? data.location ?? ''),
          notesHtml: coerce(data.Notes ?? data.notes ?? '')
        } satisfies StoreEventRaw;
      });
    });

    if (!rawEvents.length) {
      return [];
    }

    const { start: weekStart, end: weekEnd } = this.getWeekRange(weekOffset);
    const weekStartMs = weekStart.getTime();
    const weekEndMs = weekEnd.getTime();

    return rawEvents
      .map((event) => this.normalizeStoreEvent(event))
      .filter((entry): entry is ScheduleEntry => Boolean(entry))
      .filter((entry) => {
        if (!entry.start) {
          return false;
        }
        const start = new Date(entry.start);
        return !Number.isNaN(start.getTime()) && start.getTime() >= weekStartMs && start.getTime() < weekEndMs;
      })
      .sort((a, b) => {
        const aTime = a.start ? new Date(a.start).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.start ? new Date(b.start).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
  }

  private async waitForEventStore(page: Page): Promise<boolean> {
    try {
      await page.waitForFunction(() => {
        const store = (window as unknown as Record<string, unknown>).extvar_horario_event_store as
          | Record<string, unknown>
          | undefined;
        return Boolean((store as { data?: { items?: unknown[] } })?.data?.items?.length);
      }, { timeout: 15_000 });
      await this.assertServiceAvailable(page);
      return true;
    } catch (error) {
      if (error instanceof ScheduleServiceUnavailableError) {
        throw error;
      }
      if (error instanceof Error && TARGET_CLOSED_REGEX.test(error.message)) {
        throw error;
      }
      if (await this.isServiceUnavailable(page)) {
        throw new ScheduleServiceUnavailableError('NetPA está temporariamente indisponível.');
      }
      return false;
    }
  }

  private normalizeStoreEvent(event: StoreEventRaw): ScheduleEntry | null {
    if (!event.startIso) {
      return null;
    }

    const startDate = new Date(event.startIso);
    if (Number.isNaN(startDate.getTime())) {
      return null;
    }

    const chunks = event.titleHtml
      .split(/<br[^>]*>/i)
      .map((part) => this.normalizeText(part))
      .filter((part): part is string => part.length > 0);

    const courseLine = chunks[0] ?? '';
    if (!courseLine) {
      return null;
    }

    const codeLine = chunks[1] ?? '';
    const locationLine = chunks[2] ?? this.normalizeText(event.locationHtml);
    let lecturerLine = chunks[3] ?? this.normalizeText(event.notesHtml);

    if (/aula$/i.test(lecturerLine)) {
      lecturerLine = lecturerLine.replace(/aula$/i, '').trim();
    }

    const title = codeLine ? `${courseLine} — ${codeLine}` : courseLine;

    return {
      title,
      time: this.formatTime(startDate),
      location: locationLine,
      lecturer: lecturerLine,
      date: event.startIso.slice(0, 10),
      start: startDate.toISOString()
    } satisfies ScheduleEntry;
  }

  private getWeekRange(weekOffset: number) {
    const now = new Date();
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const reference = new Date(utcMidnight);
    const day = reference.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(utcMidnight + (diff + weekOffset * 7) * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + WEEK_IN_MS);
    return { start: weekStart, end: weekEnd };
  }

  private formatTime(date: Date) {
    const formatter = new Intl.DateTimeFormat('pt-PT', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: this.getTimeZone()
    });
    return formatter.format(date);
  }

  private getTimeZone() {
    return this.env.TIMEZONE || 'Europe/Lisbon';
  }

  private normalizeText(value: string) {
    return this.stripHtml(value)
      .replace(/&nbsp;/gi, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async assertServiceAvailable(surface: PageLike) {
    if (await this.isServiceUnavailable(surface)) {
      throw new ScheduleServiceUnavailableError('NetPA está temporariamente indisponível.');
    }
  }

  private async isServiceUnavailable(surface: PageLike) {
    try {
      const indicator = surface.locator('text=/Serviço\s+Indisponível/i');
      if ((await indicator.count()) > 0) {
        return true;
      }
      const secondary = surface.locator('text=/serviço não está disponível/i');
      if ((await secondary.count()) > 0) {
        return true;
      }
      const bodyText = await surface.evaluate(() => document.body?.innerText ?? '');
      if (/Serviço\s+Indisponível/i.test(bodyText)) {
        return true;
      }
      if (/serviço não está disponível/i.test(bodyText)) {
        return true;
      }
    } catch (error) {
      if (error instanceof Error && TARGET_CLOSED_REGEX.test(error.message)) {
        throw error;
      }
    }
    return false;
  }

  private stripHtml(value: string) {
    return (value ?? '').replace(/<[^>]*>/g, '');
  }

  private async extractDomEntries(page: Page): Promise<ScheduleEntry[]> {
    const calendarEntries = await this.extractCalendarEntries(page);
    if (calendarEntries.length) {
      return calendarEntries;
    }

    const tableEntries = await this.extractTableEntries(page);
    if (tableEntries.length) {
      logger.warn('Falling back to table-based schedule extraction', { count: tableEntries.length });
      return tableEntries;
    }

    logger.warn('NetPA schedule extraction returned no entries; selectors may need updating');
    return [];
  }

  private async extractCalendarEntries(page: Page): Promise<ScheduleEntry[]> {
    const extEntries = await page.$$eval('.ext-cal-evt', (nodes) => {
      return nodes
        .map((node) => {
          const body = node.querySelector('.ext-evt-bd') ?? node;
          const rawHtml = body.innerHTML ?? '';
          const parts = rawHtml
            .split(/<br\s*\/?>(?:\s*)/i)
            .map((part) => part.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
            .filter(Boolean);

          if (!parts.length) {
            return null;
          }

          const header = parts[0] ?? '';
          if (!header) {
            return null;
          }
          const code = parts[1] ?? '';
          const location = parts[2] ?? '';
          let lecturer = parts[3] ?? '';

          if (/aula$/i.test(lecturer)) {
            lecturer = lecturer.replace(/aula$/i, '').trim();
          }

          const timeMatch = header.match(/^(\d{1,2}:\d{2})\s*(.*)$/);
          const time = timeMatch && timeMatch[1] ? timeMatch[1] : '';
          const rawCourseName = timeMatch && timeMatch[2] ? timeMatch[2] : '';
          const courseName = (rawCourseName || header).trim();
          const title = code ? `${courseName} — ${code}` : courseName;

          const dateMatch = Array.from(node.classList)
            .map((className) => {
              const match = className.match(/(\d{4}-\d{2}-\d{2})/);
              return match ? match[1] : null;
            })
            .find((value) => Boolean(value));

          return {
            title,
            time,
            location,
            lecturer,
            date: dateMatch ?? ''
          };
        })
        .filter((entry): entry is {
          title: string;
          time: string;
          location: string;
          lecturer: string;
          date: string;
        } => Boolean(entry?.title));
    });

    if (extEntries.length) {
      const formatter = new Intl.DateTimeFormat('pt-PT', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });

      return extEntries.map((entry) => {
        let formattedTime = entry.time;
        if (entry.date) {
          const normalizedDate = entry.date.includes('T') ? entry.date : `${entry.date}T00:00:00`;
          const date = new Date(normalizedDate);
          if (!Number.isNaN(date.getTime())) {
            formattedTime = `${formatter.format(date)} ${formattedTime}`.trim();
          }
        }

        return {
          title: entry.title,
          time: formattedTime,
          location: entry.location,
          lecturer: entry.lecturer,
          date: entry.date || undefined
        } satisfies ScheduleEntry;
      });
    }

    const fcEntries = await page.$$eval(SCHEDULE_EVENT_SELECTOR, (nodes) => {
      return nodes
        .map((node) => {
          const getText = (scope: Element, selectors: string[]) => {
            for (const selector of selectors) {
              const target = scope.querySelector(selector);
              if (target && target.textContent) {
                const text = target.textContent.trim();
                if (text) {
                  return text;
                }
              }
            }
            return '';
          };

          const attr = (scope: Element, attributes: string[]) => {
            for (const attribute of attributes) {
              const value = scope.getAttribute(attribute);
              if (value) {
                return value;
              }
            }
            return '';
          };

          const time = getText(node, ['.fc-event-time', '.fc-time', '.fc-list-event-time']);
          const title = getText(node, ['.fc-event-title', '.fc-title', '.fc-list-event-title', '.fc-sticky']);
          const tooltip = attr(node, ['data-original-title', 'title']);
          const parentWithDate = node.closest('[data-date]') ?? node.closest('[data-date-str]');
          const dateISO = attr(node, ['data-date']) || (parentWithDate ? attr(parentWithDate, ['data-date', 'data-date-str']) : '');

          const detailsSource = tooltip || node.textContent || '';
          const detailLines = detailsSource
            .split(/\n|\r|\t| {2,}/)
            .map((line) => line.trim())
            .filter(Boolean);

          let location = '';
          let lecturer = '';

          for (const line of detailLines) {
            if (!location && /(sala|room)/i.test(line)) {
              location = line.replace(/^.*?:\s*/, '');
            }
            if (!lecturer && /(docente|professor|professora|orientador)/i.test(line)) {
              lecturer = line.replace(/^.*?:\s*/, '');
            }
          }

          const entryTitle = title || detailLines[0] || '';

          if (!entryTitle) {
            return null;
          }

          return {
            title: entryTitle,
            time: time || '',
            location,
            lecturer,
            date: dateISO || ''
          };
        })
        .filter((entry): entry is {
          title: string;
          time: string;
          location: string;
          lecturer: string;
          date: string;
        } => Boolean(entry?.title));
    });

    const dayFormatter = new Intl.DateTimeFormat('pt-PT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });

    return fcEntries.map((entry) => {
      let formattedTime = entry.time;
      if (entry.date) {
        const normalizedDate = entry.date.includes('T') ? entry.date : `${entry.date}T00:00:00`;
        const date = new Date(normalizedDate);
        if (!Number.isNaN(date.getTime())) {
          formattedTime = `${dayFormatter.format(date)} ${formattedTime}`.trim();
        }
      }

      return {
        title: entry.title,
        time: formattedTime,
        location: entry.location,
        lecturer: entry.lecturer,
        date: entry.date || undefined
      } satisfies ScheduleEntry;
    });
  }

  private async extractTableEntries(page: Page): Promise<ScheduleEntry[]> {
    const rows = await page.$$('[data-schedule-row], table.schedule-table tbody tr');
    const entries: ScheduleEntry[] = [];

    for (const row of rows) {
      const textContent = async (selector: string) => {
        const element = await row.$(selector);
        if (!element) {
          return '';
        }
        const text = await element.textContent();
        return text?.trim() ?? '';
      };

      const title = await textContent('[data-schedule-title], .discipline, td:nth-child(2)');
      const time = await textContent('[data-schedule-time], .time, td:nth-child(1)');
      const location = await textContent('[data-schedule-room], .room, td:nth-child(3)');
      const lecturer = await textContent('[data-schedule-lecturer], .teacher, td:nth-child(4)');

      if (!title && !time) {
        continue;
      }

      entries.push({ title, time, location, lecturer });
    }

    return entries;
  }
}
