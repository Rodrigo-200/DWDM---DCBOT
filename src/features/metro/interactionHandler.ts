import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Interaction,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder
} from 'discord.js';

import type { MetroClient, MetroLine, MetroStation, MetroWaitEntry } from '../../services/metroClient.js';
import type { Env } from '../../utils/env.js';
import { logger } from '../../utils/logger.js';
import {
  METRO_DIRECTION_SELECT_PREFIX,
  METRO_LINE_ORDER,
  METRO_LINE_STYLE,
  METRO_REFRESH_BUTTON_PREFIX,
  METRO_STATION_SELECT_PREFIX
} from './constants.js';
import { buildMetroPanelMessage } from './panel.js';

interface MetroInteractionHandlerOptions {
  env: Env;
  metroClient: MetroClient;
}

interface DirectionGroup {
  destinationId: string;
  destinationName: string;
  entries: MetroWaitEntry[];
}

const MAX_FIELDS = 5;

const groupByDestination = (entries: MetroWaitEntry[]): DirectionGroup[] => {
  const map = new Map<string, DirectionGroup>();

  for (const entry of entries) {
    const key = entry.destinationId;
    if (!map.has(key)) {
      map.set(key, {
        destinationId: key,
        destinationName: entry.destinationName,
        entries: []
      });
    }
    map.get(key)?.entries.push(entry);
  }

  const groups = Array.from(map.values());
  for (const group of groups) {
    group.entries.sort((a, b) => {
      const nextA = a.trains[0]?.etaSeconds ?? Number.POSITIVE_INFINITY;
      const nextB = b.trains[0]?.etaSeconds ?? Number.POSITIVE_INFINITY;
      return nextA - nextB;
    });
  }

  groups.sort((a, b) => {
    const nextA = a.entries[0]?.trains[0]?.etaSeconds ?? Number.POSITIVE_INFINITY;
    const nextB = b.entries[0]?.trains[0]?.etaSeconds ?? Number.POSITIVE_INFINITY;
    return nextA - nextB;
  });

  return groups;
};

const formatEta = (etaSeconds: number | null): string => {
  if (etaSeconds == null) {
    return 'Sem previsão';
  }
  if (etaSeconds < 60) {
    return `${etaSeconds}s`;
  }
  const minutes = Math.floor(etaSeconds / 60);
  const seconds = etaSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
};

const resolveLine = (
  station: MetroStation,
  direction: DirectionGroup,
  preferredLine?: MetroLine
): MetroLine => {
  if (preferredLine && station.lines.includes(preferredLine)) {
    return preferredLine;
  }

  const availableLines = direction.entries[0]?.destinationLines ?? [];
  const intersection = availableLines.find((line) => station.lines.includes(line));
  if (intersection) {
    return intersection;
  }
  const firstStationLine = station.lines[0];
  if (firstStationLine) {
    return firstStationLine;
  }
  const fallback = availableLines[0];
  if (fallback) {
    return fallback;
  }
  return 'Verde';
};

const pickLatestTimestamp = (group: DirectionGroup): Date | null => {
  const timestamps = group.entries
    .map((entry) => entry.timestamp?.getTime())
    .filter((value): value is number => typeof value === 'number');
  if (timestamps.length === 0) {
    return null;
  }
  return new Date(Math.max(...timestamps));
};

const formatPlatformField = (entry: MetroWaitEntry): { name: string; value: string } => {
  const lines = entry.trains.map((train, index) => {
    const label = train.trainId ? `comboio ${train.trainId}` : `comboio ${index + 1}`;
    return `• ${formatEta(train.etaSeconds)} — ${label}`;
  });

  if (lines.length === 0) {
    lines.push('Sem previsões disponíveis.');
  }

  return {
    name: `Cais ${entry.platformId}`,
    value: lines.join('\n')
  };
};

const buildDirectionSelect = (
  stationId: string,
  directions: DirectionGroup[],
  selected: string
) => {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${METRO_DIRECTION_SELECT_PREFIX}|${stationId}`)
    .setPlaceholder('Seleciona o sentido')
    .setMinValues(1)
    .setMaxValues(1);

  for (const group of directions) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(group.destinationName)
        .setValue(group.destinationId)
        .setDefault(group.destinationId === selected)
    );
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
};

const buildRefreshRow = (stationId: string, destinationId: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${METRO_REFRESH_BUTTON_PREFIX}|${stationId}|${destinationId}`)
      .setLabel('Atualizar tempos')
      .setStyle(ButtonStyle.Primary)
  );

const resetStationSelectMenus = async (metroClient: MetroClient, interaction: StringSelectMenuInteraction) => {
  try {
    const stations = await metroClient.listStations();
    const { embed, components } = buildMetroPanelMessage(stations);
    await interaction.message.edit({ embeds: [embed], components });
  } catch (error) {
    logger.warn('Metro handler: não consegui reiniciar os menus de estação', {
      messageId: interaction.message.id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

export const createMetroInteractionHandler = ({ env, metroClient }: MetroInteractionHandlerOptions) => {
  const timezone = env.TIMEZONE || 'Europe/Lisbon';
  const dateFormatter = new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const renderDirection = async (
    stationId: string,
    options?: { destinationId?: string; preferredLine?: MetroLine }
  ): Promise<{
    embed: EmbedBuilder;
    components: Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>>;
  }> => {
    const destinationId = options?.destinationId;
    const preferredLine = options?.preferredLine;

    const [station, waitTimes] = await Promise.all([
      metroClient.getStationById(stationId),
      metroClient.getStationWaitTimes(stationId)
    ]);

    if (!station) {
      throw new Error('Estação desconhecida.');
    }

    const directions = groupByDestination(waitTimes);
    if (directions.length === 0) {
      throw new Error('Sem previsões disponíveis para esta estação.');
    }

    const filteredDirections = preferredLine
      ? directions.filter((group) =>
          group.entries.some((entry) => entry.destinationLines.includes(preferredLine))
        )
      : directions;

    const effectiveDirections = filteredDirections.length > 0 ? filteredDirections : directions;

    const selectedGroup = destinationId
      ? effectiveDirections.find((group) => group.destinationId === destinationId) ??
        effectiveDirections[0]
      : effectiveDirections[0];

    if (!selectedGroup) {
      throw new Error('Não existem dados para o sentido selecionado.');
    }

    const line = resolveLine(station, selectedGroup, preferredLine);
    const style = METRO_LINE_STYLE[line];
    const latestTimestamp = pickLatestTimestamp(selectedGroup);

    const embed = new EmbedBuilder()
      .setColor(style.color)
      .setTitle(`🚇 ${station.name}`)
      .setDescription(`${style.emoji} ${style.label} • Sentido **${selectedGroup.destinationName}**`)
      .setFooter({
        text: latestTimestamp
          ? `Atualizado às ${dateFormatter.format(latestTimestamp)} • ${timezone}`
          : `Horário local: ${timezone}`
      });

    const fields = selectedGroup.entries.slice(0, MAX_FIELDS).map((entry) =>
      formatPlatformField(entry)
    );

    if (fields.length === 0) {
      embed.addFields({
        name: 'Próximos comboios',
        value: 'Sem previsões disponíveis neste sentido.'
      });
    } else {
      embed.addFields(fields);
    }

    if (station.zone || station.lines.length > 0) {
      const infoParts = [] as string[];
      if (station.zone) {
        infoParts.push(`Zona ${station.zone}`);
      }
      if (station.lines.length > 0) {
        infoParts.push(`Linhas: ${station.lines.join(', ')}`);
      }
      embed.addFields({ name: 'Estação', value: infoParts.join(' • ') });
    }

    const directionRow = buildDirectionSelect(
      stationId,
      effectiveDirections,
      selectedGroup.destinationId
    );
    const refreshRow = buildRefreshRow(stationId, selectedGroup.destinationId);

    return { embed, components: [directionRow, refreshRow] };
  };

  const handleStationSelect = async (interaction: StringSelectMenuInteraction) => {
    const stationId = interaction.values.at(0);
    if (!stationId) {
      await interaction.reply({
        content: 'Não consegui identificar a estação selecionada.',
        flags: MessageFlags.Ephemeral
      });
      await resetStationSelectMenus(metroClient, interaction);
      return;
    }

    const customIdParts = interaction.customId.split('|');
    const preferredLineRaw = customIdParts[1];
    const preferredLine =
      preferredLineRaw && METRO_LINE_ORDER.includes(preferredLineRaw as MetroLine)
        ? (preferredLineRaw as MetroLine)
        : undefined;

    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
      const { embed, components } = await renderDirection(stationId, { preferredLine });
      await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      logger.error('Metro handler: falha ao obter estação', {
        stationId,
        error: error instanceof Error ? error.message : String(error)
      });
      await interaction.editReply({
        content: 'Não foi possível obter os tempos desta estação neste momento.',
        components: []
      });
    } finally {
      await resetStationSelectMenus(metroClient, interaction);
    }
  };

  const handleDirectionSelect = async (interaction: StringSelectMenuInteraction) => {
    const stationId = interaction.customId.split('|')[1];
    const destinationId = interaction.values.at(0);

    if (!stationId || !destinationId) {
      await interaction.reply({
        content: 'Não consegui processar o sentido selecionado.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }

    try {
  const { embed, components } = await renderDirection(stationId, { destinationId });
      await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      logger.error('Metro handler: falha ao atualizar sentido', {
        stationId,
        destinationId,
        error: error instanceof Error ? error.message : String(error)
      });
      await interaction.editReply({
        content: 'Não consegui atualizar o sentido selecionado.',
        components: []
      });
    }
  };

  const handleRefresh = async (interaction: ButtonInteraction) => {
    const [, stationId, destinationId] = interaction.customId.split('|');
    if (!stationId || !destinationId) {
      await interaction.reply({
        content: 'Não consegui identificar o pedido de atualização.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }

    try {
  const { embed, components } = await renderDirection(stationId, { destinationId });
      await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      logger.error('Metro handler: falha ao atualizar dados', {
        stationId,
        destinationId,
        error: error instanceof Error ? error.message : String(error)
      });
      await interaction.editReply({
        content: 'Não consegui atualizar os dados neste momento.',
        components: []
      });
    }
  };

  return async (interaction: Interaction): Promise<boolean> => {
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(METRO_STATION_SELECT_PREFIX)) {
      await handleStationSelect(interaction);
      return true;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(METRO_DIRECTION_SELECT_PREFIX)) {
      await handleDirectionSelect(interaction);
      return true;
    }

    if (interaction.isButton() && interaction.customId.startsWith(METRO_REFRESH_BUTTON_PREFIX)) {
      await handleRefresh(interaction);
      return true;
    }

    return false;
  };
};
