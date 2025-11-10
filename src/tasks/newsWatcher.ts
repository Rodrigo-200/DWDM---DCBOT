import type { Client, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';

import type { Env } from '../utils/env.js';
import type { JsonStorage } from '../utils/storage.js';
import type { PersistentState } from '../state.js';
import { logger } from '../utils/logger.js';
import { NewsClient } from '../services/newsClient.js';

interface NewsWatcherOptions {
  client: Client;
  env: Env;
  stateStorage: JsonStorage<PersistentState>;
}

const ANNOUNCEMENT_HISTORY_LIMIT = 30;

export const createAnnouncementsWatcher = ({ client, env, stateStorage }: NewsWatcherOptions) => {
  const newsClient = new NewsClient(env.ANNOUNCEMENTS_FEED_URL);

  return async () => {
    logger.info('Running announcements watcher');
    try {
      const items = await newsClient.fetchLatest(10);

      const state = await stateStorage.read();
      const unseen = items.filter((item) => !state.announcements.includes(item.id));

      if (unseen.length === 0) {
        logger.info('No new announcements detected');
        return;
      }

      await announceNews({ client, env, items: unseen });

      const updatedHistory = [...unseen.map((item) => item.id), ...state.announcements].slice(
        0,
        ANNOUNCEMENT_HISTORY_LIMIT
      );
      await stateStorage.write({ ...state, announcements: updatedHistory });
    } catch (error) {
      logger.error('Announcements watcher failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
};

const announceNews = async ({
  client,
  env,
  items
}: {
  client: Client;
  env: Env;
  items: import('../services/newsClient.js').AnnouncementItem[];
}) => {
  const channel = await client.channels.fetch(env.ANNOUNCEMENTS_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    logger.warn('Announcements channel not found or not text-based', {
      channelId: env.ANNOUNCEMENTS_CHANNEL_ID
    });
    return;
  }

  const textChannel = channel as TextChannel;

  const embeds = items.slice(0, 5).map((item) =>
    new EmbedBuilder()
      .setTitle(item.title)
      .setURL(item.url)
      .setColor(0xff_99_00)
      .setTimestamp(new Date())
      .setDescription(item.date ? `Data: ${item.date}` : 'Novo anúncio disponível')
  );

  await textChannel.send({
    content: items.length > 1 ? '@here Novos anúncios publicados.' : '@here Novo anúncio publicado.',
    embeds
  });
};
