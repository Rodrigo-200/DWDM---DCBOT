import nodeCron from 'node-cron';

import { logger } from './logger.js';

export type CronTask = () => Promise<void> | void;

export const scheduleHourlyWithJitter = (
  task: CronTask,
  timezone: string,
  jitterMinutes = 5
) => {
  const expression = '0 * * * *'; // top of every hour
  nodeCron.schedule(
    expression,
    async () => {
      const jitterSeconds = Math.floor(Math.random() * jitterMinutes * 60);
      const delayMs = jitterSeconds * 1000;
      logger.info('Applying jitter before scheduled task', { delayMs });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await task();
    },
    { timezone }
  );
};
