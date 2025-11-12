import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from 'discord.js';

import { buildCpPanelMessage } from '../../features/cp/panel.js';
import { defaultState, type PersistentState } from '../../state.js';
import type { BotCommand, CommandContext } from '../../types.js';
import { getEnv } from '../../utils/env.js';
import { logger } from '../../utils/logger.js';
import { JsonStorage } from '../../utils/storage.js';

const data = new SlashCommandBuilder()
  .setName('comboios')
  .setDescription('Painel de informação dos comboios CP')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand.setName('publicar').setDescription('Publica ou atualiza o painel de estações CP no canal configurado')
  );

const execute = async (interaction: ChatInputCommandInteraction, _context: CommandContext) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const env = getEnv();
  const channelId = env.CP_PANEL_CHANNEL_ID;
  const stateStorage = new JsonStorage<PersistentState>('data/state.json', defaultState);

  try {
    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      await interaction.editReply('❌ Não consegui encontrar o canal configurado para o painel da CP.');
      return;
    }

  const textChannel = channel;
    const { embed, components } = buildCpPanelMessage();

    const state = await stateStorage.read();
    let messageId = state.cpPanelMessageId ?? null;
    let message = null;

    if (messageId) {
      try {
        message = await textChannel.messages.fetch(messageId);
      } catch (error) {
        logger.warn('Painel CP: mensagem anterior não encontrada, vou criar uma nova', {
          channelId,
          messageId,
          error: error instanceof Error ? error.message : String(error)
        });
        messageId = null;
      }
    }

    if (message) {
      await message.edit({ embeds: [embed], components });
    } else {
      const created = await textChannel.send({ embeds: [embed], components });
      messageId = created.id;
    }

    await stateStorage.write({
      ...state,
      cpPanelMessageId: messageId
    });

    await interaction.editReply(`✅ Painel atualizado em <#${channelId}>.`);
  } catch (error) {
    logger.error('Falha ao publicar painel CP', {
      channelId,
      error: error instanceof Error ? error.message : String(error)
    });
    await interaction.editReply('❌ Não foi possível publicar o painel. Tenta novamente mais tarde.');
  }
};

const command: BotCommand = { data, execute, guildOnly: true };

export default command;
