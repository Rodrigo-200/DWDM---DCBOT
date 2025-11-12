import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';

import { STATION_GROUPS } from './stations.js';

export const CP_STATION_SELECT_PREFIX = 'cp-station';

export const buildCpPanelMessage = () => {
  const embed = new EmbedBuilder()
    .setColor(0x2b6cb0)
    .setTitle('🚆 Monitorização CP — Área de Lisboa')
    .setDescription(
      [
        'Escolhe uma estação para veres os próximos comboios em tempo real.',
        'Depois de selecionar, utiliza os botões para consultar detalhes de cada serviço.'
      ].join('\n')
    )
    .setFooter({ text: 'Dados fornecidos pela CP. Atualiza sempre a sinalética da estação.' });

  const components = STATION_GROUPS.map((group) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${CP_STATION_SELECT_PREFIX}:${group.id}`)
      .setPlaceholder(group.placeholder)
      .setMinValues(1)
      .setMaxValues(1);

    for (const option of group.options) {
      menu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(option.label)
          .setValue(option.code)
          .setDescription(option.description ?? group.label)
      );
    }

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  });

  return { embed, components } as const;
};
