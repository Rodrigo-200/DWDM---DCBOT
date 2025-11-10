import { SlashCommandBuilder, time, TimestampStyles, type ChatInputCommandInteraction } from 'discord.js';

import type { BotCommand, CommandContext } from '../../types.js';

const data = new SlashCommandBuilder()
  .setName('uptime')
  .setDescription('Mostra o tempo em que o bot está online');

const execute = async (interaction: ChatInputCommandInteraction, context: CommandContext) => {
  const now = Date.now();
  const uptimeMs = Math.max(0, now - context.readyTimestamp);

  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const days = Math.floor(uptimeSeconds / 86_400);
  const hours = Math.floor((uptimeSeconds % 86_400) / 3_600);
  const minutes = Math.floor((uptimeSeconds % 3_600) / 60);
  const seconds = uptimeSeconds % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours || parts.length) parts.push(`${hours}h`);
  if (minutes || parts.length) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  const readyTimestamp = time(Math.floor(context.readyTimestamp / 1000), TimestampStyles.ShortDateTime);
  const relative = time(Math.floor(context.readyTimestamp / 1000), TimestampStyles.RelativeTime);

  await interaction.reply({
    content: `🟢 Estou online há **${parts.join(' ')}** (desde ${readyTimestamp}, ${relative}).`
  });
};

const command: BotCommand = { data, execute };

export default command;
