import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from 'discord.js';

import { getEnv } from '../../utils/env.js';
import { JsonStorage } from '../../utils/storage.js';
import { defaultState, type PersistentState } from '../../state.js';
import type { BotCommand, CommandContext } from '../../types.js';
import { createScheduleWatcher } from '../../tasks/scheduleWatcher.js';
import { logger } from '../../utils/logger.js';

const data = new SlashCommandBuilder()
  .setName('schedule')
  .setDescription('Controla os embeds do horário')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand.setName('create').setDescription('Atualiza imediatamente os embeds do horário')
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('clear').setDescription('Remove o embed de alterações recentes do horário')
  );

const execute = async (interaction: ChatInputCommandInteraction, _context: CommandContext) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const env = getEnv();
  const stateStorage = new JsonStorage<PersistentState>('data/state.json', defaultState);
  const subcommand = interaction.options.getSubcommand();

  try {
    if (subcommand === 'create') {
      const runScheduleCheck = createScheduleWatcher({
        client: interaction.client,
        env,
        stateStorage
      });
      await runScheduleCheck();
      await interaction.editReply('✅ Horário atualizado.');
      return;
    }

    if (subcommand === 'clear') {
      const state = await stateStorage.read();
      const channel = await interaction.client.channels.fetch(env.SCHEDULE_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) {
  await interaction.editReply('❌ Não consegui encontrar o canal configurado para o horário.');
        return;
      }

      const messageId = state.scheduleChangeMessageId;
      if (!messageId) {
        await interaction.editReply('ℹ️ Não existe mensagem de alterações para limpar.');
        return;
      }

      try {
        const message = await channel.messages.fetch(messageId);
        await message.delete();
      } catch (error) {
        logger.warn('Falha ao apagar mensagem de alterações do horário', {
          channelId: channel.id,
          messageId,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      await stateStorage.write({
        ...state,
        scheduleChangeMessageId: null
      });

      await interaction.editReply('✅ Mensagem de alterações do horário removida.');
      return;
    }

    await interaction.editReply('❌ Comando não suportado.');
  } catch (error) {
    logger.error('Falha ao executar comando /schedule', {
      subcommand,
      error: error instanceof Error ? error.message : String(error)
    });
    await interaction.editReply('❌ Algo correu mal ao executar o comando.');
  }
};

const command: BotCommand = { data, execute };

export default command;
