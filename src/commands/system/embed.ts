import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel
} from 'discord.js';

import type { BotCommand, CommandContext } from '../../types.js';
import { logger } from '../../utils/logger.js';

const data = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('Cria e envia um embed personalizado')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('enviar')
      .setDescription('Envia um embed para um canal')
      .addChannelOption((option) =>
        option
          .setName('canal')
          .setDescription('Canal onde o embed será enviado')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread)
      )
      .addStringOption((option) => option.setName('conteudo').setDescription('Mensagem opcional a acompanhar o embed'))
      .addStringOption((option) =>
        option
          .setName('titulo')
          .setDescription('Título do embed')
          .setMaxLength(256)
      )
      .addStringOption((option) =>
        option
          .setName('descricao')
          .setDescription('Descrição do embed')
          .setMaxLength(4_000)
      )
      .addStringOption((option) =>
        option
          .setName('cor')
          .setDescription('Cor em hexadecimal, por exemplo #3b82f6')
          .setMaxLength(7)
      )
      .addBooleanOption((option) =>
        option
          .setName('timestamp')
          .setDescription('Adicionar timestamp atual ao embed')
      )
  );

const HEX_COLOR_REGEX = /^#?[0-9a-f]{6}$/i;

const execute = async (interaction: ChatInputCommandInteraction, _context: CommandContext) => {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: '❌ Este comando só pode ser usado num servidor.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand !== 'enviar') {
    await interaction.reply({ content: '❌ Subcomando desconhecido.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetChannel = (interaction.options.getChannel('canal') ?? interaction.channel) as GuildTextBasedChannel | null;
  if (!targetChannel) {
    await interaction.editReply('❌ Não consegui determinar o canal de destino.');
    return;
  }

  const title = interaction.options.getString('titulo') ?? undefined;
  const description = interaction.options.getString('descricao') ?? undefined;
  const content = interaction.options.getString('conteudo') ?? undefined;
  const colorInput = interaction.options.getString('cor') ?? undefined;
  const includeTimestamp = interaction.options.getBoolean('timestamp') ?? false;

  if (!title && !description) {
    await interaction.editReply('❌ O embed precisa de pelo menos um título ou uma descrição.');
    return;
  }

  let colorValue: number | undefined;
  if (colorInput) {
    if (!HEX_COLOR_REGEX.test(colorInput)) {
      await interaction.editReply('❌ A cor deve estar no formato hexadecimal, por exemplo #1d4ed8.');
      return;
    }
    const normalized = colorInput.startsWith('#') ? colorInput.slice(1) : colorInput;
    colorValue = parseInt(normalized, 16);
  }

  const embed = new EmbedBuilder();
  if (title) {
    embed.setTitle(title);
  }
  if (description) {
    embed.setDescription(description);
  }
  if (typeof colorValue === 'number' && Number.isFinite(colorValue)) {
    embed.setColor(colorValue);
  }
  if (includeTimestamp) {
    embed.setTimestamp(new Date());
  }

  try {
    await targetChannel.send({
      content,
      embeds: [embed]
    });
  } catch (error) {
    logger.error('Falha ao enviar embed personalizado', {
      guildId: interaction.guildId,
      channelId: targetChannel.id,
      error: error instanceof Error ? error.message : String(error)
    });
    await interaction.editReply('❌ Não consegui enviar o embed. Verifica as permissões do bot.');
    return;
  }

  await interaction.editReply('✅ Embed enviado com sucesso.');
};

const command: BotCommand = { data, execute, guildOnly: true };

export default command;
