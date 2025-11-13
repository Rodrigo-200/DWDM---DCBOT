import type { APISelectMenuOption } from 'discord.js';

export type StationLine = 'oeste' | 'norte' | 'noroeste';

export interface StationOption {
  code: string;
  label: string;
  description?: string;
  line: StationLine;
}

export interface StationGroup {
  id: StationLine;
  label: string;
  placeholder: string;
  options: StationOption[];
}

export const STATION_GROUPS: StationGroup[] = [
  {
    id: 'oeste',
    label: '🌊 Oeste — Cascais, Estoril',
    placeholder: 'Cascais, Estoril, Oeiras, Cais do Sodré...',
    options: [
      { code: '94-69005', label: 'Cais do Sodré', line: 'oeste' },
      { code: '94-69013', label: 'Santos', line: 'oeste' },
      { code: '94-69039', label: 'Alcântara-Mar', line: 'oeste' },
      { code: '94-69054', label: 'Belém', line: 'oeste' },
      { code: '94-69088', label: 'Algés', line: 'oeste' },
      { code: '94-69104', label: 'Cruz Quebrada', line: 'oeste' },
      { code: '94-69120', label: 'Caxias', line: 'oeste' },
      { code: '94-69146', label: 'Paço de Arcos', line: 'oeste' },
      { code: '94-69161', label: 'Santo Amaro', line: 'oeste' },
      { code: '94-69179', label: 'Oeiras', line: 'oeste' },
      { code: '94-69187', label: 'Carcavelos', line: 'oeste' },
      { code: '94-69203', label: 'Parede', line: 'oeste' },
      { code: '94-69229', label: 'São Pedro do Estoril', line: 'oeste' },
      { code: '94-69237', label: 'São João do Estoril', line: 'oeste' },
      { code: '94-69245', label: 'Estoril', line: 'oeste' },
      { code: '94-69252', label: 'Monte Estoril', line: 'oeste' },
      { code: '94-69260', label: 'Cascais', line: 'oeste' }
    ]
  },
  {
    id: 'norte',
    label: '⬆️ Norte — Oriente, Santarém, Azambuja',
    placeholder: 'Santa Apolónia, Oriente, Moscavide, Santarém...',
    options: [
      { code: '94-30007', label: 'Lisboa Santa Apolónia', line: 'norte' },
      { code: '94-31005', label: 'Braço de Prata', line: 'norte' },
      { code: '94-31039', label: 'Lisboa Oriente', line: 'norte' },
      { code: '94-31047', label: 'Moscavide', line: 'norte' },
      { code: '94-31062', label: 'Sacavém', line: 'norte' },
      { code: '94-31070', label: 'Bobadela', line: 'norte' },
      { code: '94-31112', label: 'Santa Iria', line: 'norte' },
      { code: '94-31146', label: 'Póvoa', line: 'norte' },
      { code: '94-31187', label: 'Alverca', line: 'norte' },
      { code: '94-31278', label: 'Vila Franca de Xira', line: 'norte' },
      { code: '94-31310', label: 'Castanheira do Ribatejo', line: 'norte' },
      { code: '94-31336', label: 'Carregado', line: 'norte' },
      { code: '94-33084', label: 'Reguengo / Vale da Pedra', line: 'norte' },
      { code: '94-33043', label: 'Virtudes', line: 'norte' },
      { code: '94-33001', label: 'Azambuja', line: 'norte' },
      { code: '94-32102', label: 'Vale de Santarém', line: 'norte' },
      { code: '94-32185', label: 'Santarém', line: 'norte' }
    ]
  },
  {
    id: 'noroeste',
    label: '↖️ Noroeste — Sintra, Amadora',
    placeholder: 'Rossio, Roma-Areeiro, Sintra, Queluz, Amadora...',
    options: [
      { code: '94-59006', label: 'Lisboa Rossio', line: 'noroeste' },
      { code: '94-66035', label: 'Roma - Areeiro', line: 'noroeste' },
      { code: '94-66050', label: 'Entrecampos', line: 'noroeste' },
      { code: '94-66076', label: 'Sete Rios', line: 'noroeste' },
      { code: '94-60004', label: 'Campolide', line: 'noroeste' },
      { code: '94-60046', label: 'Benfica', line: 'noroeste' },
      { code: '94-60038', label: 'Santa Cruz - Damaia', line: 'noroeste' },
      { code: '94-60095', label: 'Reboleira', line: 'noroeste' },
      { code: '94-60087', label: 'Amadora', line: 'noroeste' },
      { code: '94-60103', label: 'Queluz - Belas', line: 'noroeste' },
      { code: '94-60111', label: 'Monte Abraão', line: 'noroeste' },
      { code: '94-60137', label: 'Massamá - Barcarena', line: 'noroeste' },
      { code: '94-61002', label: 'Agualva - Cacém', line: 'noroeste' },
      { code: '94-61044', label: 'Rio de Mouro', line: 'noroeste' },
      { code: '94-61051', label: 'Mercês', line: 'noroeste' },
      { code: '94-61069', label: 'Algueirão - Mem Martins', line: 'noroeste' },
      { code: '94-62042', label: 'Mira Sintra - Meleças', line: 'noroeste' },
      { code: '94-61093', label: 'Portela de Sintra', line: 'noroeste' },
      { code: '94-61101', label: 'Sintra', line: 'noroeste' }
    ]
  }
];

const stationEntries = STATION_GROUPS.flatMap((group) => group.options.map((option) => [option.code, option] as const));

export const STATIONS_BY_CODE = new Map<string, StationOption>(stationEntries);

export const getStationByCode = (code: string): StationOption | undefined => STATIONS_BY_CODE.get(code);

export const toSelectOption = (option: StationOption): APISelectMenuOption => ({
  label: option.label,
  value: option.code,
  description: option.description
});
