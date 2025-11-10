import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel
} from 'discord.js';

import type { BotCommand, CommandContext } from '../../types.js';
import { logger } from '../../utils/logger.js';

const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Remove mensagens recentes deste canal')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((option) =>
    option
      .setName('quantidade')
      .setDescription('Número de mensagens a remover (máx. 100)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  )
  .addStringOption((option) => option.setName('motivo').setDescription('Motivo para o registo do log'));

const execute = async (interaction: ChatInputCommandInteraction, _context: CommandContext) => {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: '❌ Este comando só pode ser usado num servidor.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const channel = interaction.channel as GuildTextBasedChannel | null;
  if (!channel) {
    await interaction.reply({
      content: '❌ Não consegui determinar o canal para limpar.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const amount = interaction.options.getInteger('quantidade', true);
  const reason = interaction.options.getString('motivo') ?? undefined;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const deleted = await channel.bulkDelete(amount, true);
    await interaction.editReply(
      `🧹 Foram removidas ${deleted.size} mensagens${reason ? ` (motivo: ${reason})` : ''}.`
    );
  } catch (error) {
    logger.error('Falha ao limpar mensagens', {
      guildId: interaction.guildId,
      channelId: channel.id,
      amount,
      error: error instanceof Error ? error.message : String(error)
    });
    await interaction.editReply('❌ Não consegui remover as mensagens (verifica permissões e antiguidade).');
  }
};

const command: BotCommand = { data, execute, guildOnly: true };

export default command;
