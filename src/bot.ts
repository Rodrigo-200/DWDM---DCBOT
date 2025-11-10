import { Client, Collection, Events, GatewayIntentBits, Interaction, MessageFlags } from 'discord.js';

import { getEnv } from './utils/env.js';
import { logger } from './utils/logger.js';
import { JsonStorage } from './utils/storage.js';
import { loadCommands } from './utils/commandLoader.js';
import { initializeTasks } from './tasks/index.js';
import type { BotCommand, CommandContext } from './types.js';
import { defaultState, type PersistentState } from './state.js';

type CommandCollection = Collection<string, BotCommand>;

const bootstrap = async () => {
  const env = getEnv();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
  });

  const commandContext: CommandContext = {
    readyTimestamp: Date.now()
  };

  const commands: CommandCollection = new Collection();
  const commandEntries = await loadCommands();
  for (const command of commandEntries) {
    commands.set(command.data.name, command);
  }

  const stateStorage = new JsonStorage<PersistentState>('data/state.json', defaultState);

  client.once(Events.ClientReady, (readyClient: Client<true>) => {
    const user = readyClient.user;
    if (!user) {
      logger.warn('Client ready event emitted without user instance');
      return;
    }
    logger.info('Bot is ready', { tag: user.tag });
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: 'Unknown command.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (command.guildOnly && !interaction.inGuild()) {
      await interaction.reply({
        content: 'This command can only be used within a server.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
  await command.execute(interaction, commandContext);
    } catch (error) {
      logger.error('Command execution failed', {
        command: interaction.commandName,
        error: error instanceof Error ? error.message : String(error)
      });
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'Something went wrong while executing this command.',
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: 'Something went wrong while executing this command.',
          flags: MessageFlags.Ephemeral
        });
      }
    }
  });

  await client.login(env.DISCORD_TOKEN);

  if (!client.isReady()) {
    await new Promise<void>((resolve) => {
      client.once(Events.ClientReady, () => resolve());
    });
  }

  await initializeTasks({ client, env, stateStorage });
};

bootstrap().catch((error) => {
  logger.error('Fatal startup error', {
    error: error instanceof Error ? error.stack : String(error)
  });
  process.exit(1);
});
