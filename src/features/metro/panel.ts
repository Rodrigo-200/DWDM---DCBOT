import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';

import type { MetroLine, MetroStation } from '../../services/metroClient.js';
import {
  METRO_LINE_ORDER,
  METRO_LINE_STYLE,
  METRO_STATION_SELECT_PREFIX
} from './constants.js';

const MAX_OPTIONS_PER_MENU = 25;

const chunk = <T>(items: T[], size: number): T[][] => {
  if (items.length <= size) {
    return [items];
  }
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const buildDescription = (station: MetroStation): string | undefined => {
  if (station.zone) {
    return `Zona ${station.zone}`;
  }
  if (station.lines.length > 1) {
    return station.lines.join(' · ');
  }
  return undefined;
};

interface BuildPanelOptions {
  nonce?: string;
}

export const buildMetroPanelMessage = (
  stations: MetroStation[],
  options: BuildPanelOptions = {}
) => {
  const nonce = options.nonce ?? Date.now().toString(36);
  const embed = new EmbedBuilder()
    .setColor(0x0074c7)
    .setTitle('🚇 Monitorização — Metro Lisboa')
    .setDescription(
      [
        '**Como funciona**',
        '1. Escolhe a **linha** e a **estação** nos menus abaixo.',
        '2. Um painel efémero abre com os próximos comboios.',
        '3. Usa o seletor de **sentido** ou o botão "Atualizar tempos" para refrescar os dados.',
        '',
        'Fonte oficial: API EstadoServicoML (Metropolitano de Lisboa)'
      ].join('\n')
    )
    .setFooter({ text: 'Confirma sempre a sinalética oficial da estação.' });

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  const sortedStations = [...stations].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-PT', { sensitivity: 'base' })
  );

  for (const line of METRO_LINE_ORDER) {
    const lineStations = sortedStations.filter((station) => station.lines.includes(line));
    if (lineStations.length === 0) {
      continue;
    }

    const chunks = chunk(lineStations, MAX_OPTIONS_PER_MENU);
    chunks.forEach((stationsChunk, index) => {
      const info = METRO_LINE_STYLE[line];
      const suffix = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : '';
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`${METRO_STATION_SELECT_PREFIX}|${line}|${index}|${nonce}`)
        .setPlaceholder(`${info.emoji} ${info.label}${suffix}`)
        .setMinValues(1)
        .setMaxValues(1);

      for (const station of stationsChunk) {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(station.name)
          .setValue(station.id);

        const description = buildDescription(station);
        if (description) {
          option.setDescription(description);
        }

        menu.addOptions(option);
      }

      components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
    });
  }

  return { embed, components } as const;
};
