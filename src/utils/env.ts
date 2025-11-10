import 'dotenv/config';

import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'])
  .optional()
  .default('true' as const)
  .transform((value) => ['true', '1', 'yes', 'on'].includes(value));

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  DISCORD_GUILD_ID: z.string().optional(),
  SCHEDULE_LOGIN_URL: z.string().url(),
  SCHEDULE_USERNAME: z.string().min(1),
  SCHEDULE_PASSWORD: z.string().min(1),
  SCHEDULE_PORTAL_URL: z.string().url(),
  SCHEDULE_CHANNEL_ID: z.string().min(1),
  ANNOUNCEMENTS_CHANNEL_ID: z.string().min(1),
  ANNOUNCEMENTS_FEED_URL: z.string().url(),
  TIMEZONE: z.string().default('Europe/Lisbon'),
  YOUTUBE_COOKIE: z.string().optional(),
  ENABLE_SCHEDULE_WATCHER: booleanFlag,
  ENABLE_ANNOUNCEMENTS_WATCHER: booleanFlag
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export const getEnv = (): Env => {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
    }
    cached = parsed.data;
  }
  return cached;
};
