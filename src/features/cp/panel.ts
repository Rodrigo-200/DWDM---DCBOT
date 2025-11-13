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
        '1. Escolhe a linha correta no menu abaixo.',
        '2. Seleciona a estação que queres monitorizar.',
        "3. Usa os botões 'Detalhes' para veres percurso e localização em tempo real.",
        'Podes repetir o processo sempre que precisares de outra estação.'
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
