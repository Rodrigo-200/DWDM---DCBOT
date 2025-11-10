import axios from 'axios';
import { load } from 'cheerio';
import type { AnyNode } from 'domhandler';

import { logger } from '../utils/logger.js';

export interface AnnouncementItem {
  id: string;
  title: string;
  url: string;
  date?: string;
}

export class NewsClient {
  constructor(private readonly feedUrl: string) {}

  async fetchLatest(limit = 5): Promise<AnnouncementItem[]> {
    const { data } = await axios.get(this.feedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = load(data);

    const items: AnnouncementItem[] = [];
    const elements = $('.view-content .views-row, .news-list .news-item').toArray() as AnyNode[];
    for (const element of elements) {
      const wrapper = $(element);
      const title = wrapper.find('h2, .title, .news-title').first().text().trim();
      const relativeUrl = wrapper.find('a').first().attr('href') ?? '';
      const url = new URL(relativeUrl, this.feedUrl).toString();
      const date = wrapper.find('.date, time').first().text().trim();
      const id = url;

      if (!title) {
        continue;
      }

      items.push({ id, title, url, date });
    }

    if (items.length === 0) {
      logger.warn('Announcements list empty, verify selectors in newsClient.ts');
    }

    return items.slice(0, limit);
  }
}
