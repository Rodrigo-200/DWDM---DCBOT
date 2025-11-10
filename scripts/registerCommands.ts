import { REST, Routes } from 'discord.js';

import { getEnv } from '../src/utils/env.js';
import { loadCommands } from '../src/utils/commandLoader.js';
import { logger } from '../src/utils/logger.js';

const register = async () => {
  const env = getEnv();
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  const commands = (await loadCommands()).map((command) => command.data.toJSON());

  try {
    if (env.DISCORD_GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
        body: commands
      });
      logger.info('Registered guild commands', { count: commands.length });
    } else {
      await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: commands });
      logger.info('Registered global commands', { count: commands.length });
    }
  } catch (error) {
    logger.error('Failed to register commands', {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
};

register();
