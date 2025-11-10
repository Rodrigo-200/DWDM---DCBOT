import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

type SlashCommandDefinition =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export interface CommandContext {
  readyTimestamp: number;
}

export interface BotCommand {
  data: SlashCommandDefinition;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
  guildOnly?: boolean;
}
