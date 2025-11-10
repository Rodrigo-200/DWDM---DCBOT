import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';

import type { BotCommand, CommandContext } from '../../types.js';

const data = new SlashCommandBuilder().setName('ping').setDescription('Verifica a latência do bot');

const execute = async (interaction: ChatInputCommandInteraction, _context: CommandContext) => {
  const sent = await interaction.reply({ content: '🏓 Pong!', fetchReply: true });
  if (!interaction.client.ws.ping) {
    return;
  }

  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  await interaction.editReply(`🏓 Pong! Latência: ${latency}ms. Gateway: ${Math.round(interaction.client.ws.ping)}ms.`);
};

const command: BotCommand = { data, execute };

export default command;
