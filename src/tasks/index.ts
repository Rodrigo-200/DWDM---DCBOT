import type { Client } from 'discord.js';

import type { Env } from '../utils/env.js';
import type { JsonStorage } from '../utils/storage.js';
import type { PersistentState } from '../state.js';
import { logger } from '../utils/logger.js';
import { scheduleHourlyWithJitter } from '../utils/scheduler.js';
import { createScheduleWatcher } from './scheduleWatcher.js';
import { createAnnouncementsWatcher } from './newsWatcher.js';

interface TaskContext {
  client: Client;
  env: Env;
  stateStorage: JsonStorage<PersistentState>;
}

export const initializeTasks = async ({ client, env, stateStorage }: TaskContext) => {
  if (env.ENABLE_SCHEDULE_WATCHER) {
    const runScheduleCheck = createScheduleWatcher({ client, env, stateStorage });
    await runScheduleCheck();
    scheduleHourlyWithJitter(runScheduleCheck, env.TIMEZONE);
    logger.info('Schedule watcher enabled');
  } else {
    logger.info('Schedule watcher disabled via configuration');
  }

  if (env.ENABLE_ANNOUNCEMENTS_WATCHER) {
    const runNewsCheck = createAnnouncementsWatcher({ client, env, stateStorage });
    await runNewsCheck();
    scheduleHourlyWithJitter(runNewsCheck, env.TIMEZONE, 10);
    logger.info('Announcements watcher enabled');
  } else {
    logger.info('Announcements watcher disabled via configuration');
  }

  logger.info('Background tasks initialized');
};
