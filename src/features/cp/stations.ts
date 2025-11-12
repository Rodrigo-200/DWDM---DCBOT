import type { APISelectMenuOption } from 'discord.js';

export type StationLine = 'cascais' | 'santarem' | 'sintra';

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
    id: 'cascais',
    label: 'Linha de Cascais',
    placeholder: 'Escolhe uma estação da Linha de Cascais',
    options: [
      { code: '94-69005', label: 'Cais do Sodré', line: 'cascais' },
      { code: '94-69013', label: 'Santos', line: 'cascais' },
      { code: '94-69039', label: 'Alcântara-Mar', line: 'cascais' },
      { code: '94-69054', label: 'Belém', line: 'cascais' },
      { code: '94-69088', label: 'Algés', line: 'cascais' },
      { code: '94-69104', label: 'Cruz Quebrada', line: 'cascais' },
      { code: '94-69120', label: 'Caxias', line: 'cascais' },
      { code: '94-69146', label: 'Paço de Arcos', line: 'cascais' },
      { code: '94-69161', label: 'Santo Amaro', line: 'cascais' },
      { code: '94-69179', label: 'Oeiras', line: 'cascais' },
      { code: '94-69187', label: 'Carcavelos', line: 'cascais' },
      { code: '94-69203', label: 'Parede', line: 'cascais' },
      { code: '94-69229', label: 'São Pedro do Estoril', line: 'cascais' },
      { code: '94-69237', label: 'São João do Estoril', line: 'cascais' },
      { code: '94-69245', label: 'Estoril', line: 'cascais' },
      { code: '94-69252', label: 'Monte Estoril', line: 'cascais' },
      { code: '94-69260', label: 'Cascais', line: 'cascais' }
    ]
  },
  {
    id: 'santarem',
    label: 'Linha do Norte (Lisboa ⇄ Santarém)',
    placeholder: 'Escolhe uma estação entre Lisboa e Santarém',
    options: [
      { code: '94-30007', label: 'Lisboa Santa Apolónia', line: 'santarem' },
      { code: '94-31005', label: 'Braço de Prata', line: 'santarem' },
      { code: '94-31039', label: 'Lisboa Oriente', line: 'santarem' },
      { code: '94-31047', label: 'Moscavide', line: 'santarem' },
      { code: '94-31062', label: 'Sacavém', line: 'santarem' },
      { code: '94-31070', label: 'Bobadela', line: 'santarem' },
      { code: '94-31112', label: 'Santa Iria', line: 'santarem' },
      { code: '94-31146', label: 'Póvoa', line: 'santarem' },
      { code: '94-31187', label: 'Alverca', line: 'santarem' },
      { code: '94-31278', label: 'Vila Franca de Xira', line: 'santarem' },
      { code: '94-31310', label: 'Castanheira do Ribatejo', line: 'santarem' },
      { code: '94-31336', label: 'Carregado', line: 'santarem' },
      { code: '94-33084', label: 'Reguengo / Vale da Pedra', line: 'santarem' },
      { code: '94-33043', label: 'Virtudes', line: 'santarem' },
      { code: '94-33001', label: 'Azambuja', line: 'santarem' },
      { code: '94-32102', label: 'Vale de Santarém', line: 'santarem' },
      { code: '94-32185', label: 'Santarém', line: 'santarem' }
    ]
  },
  {
    id: 'sintra',
    label: 'Linha de Sintra',
    placeholder: 'Escolhe uma estação da Linha de Sintra',
    options: [
      { code: '94-59006', label: 'Lisboa Rossio', line: 'sintra' },
      { code: '94-60004', label: 'Campolide', line: 'sintra' },
      { code: '94-60046', label: 'Benfica', line: 'sintra' },
      { code: '94-60038', label: 'Santa Cruz - Damaia', line: 'sintra' },
      { code: '94-60095', label: 'Reboleira', line: 'sintra' },
      { code: '94-60087', label: 'Amadora', line: 'sintra' },
      { code: '94-60103', label: 'Queluz - Belas', line: 'sintra' },
      { code: '94-60111', label: 'Monte Abraão', line: 'sintra' },
      { code: '94-60137', label: 'Massamá - Barcarena', line: 'sintra' },
      { code: '94-61002', label: 'Agualva - Cacém', line: 'sintra' },
      { code: '94-62042', label: 'Mira Sintra - Meleças', line: 'sintra' },
      { code: '94-61044', label: 'Rio de Mouro', line: 'sintra' },
      { code: '94-61051', label: 'Mercês', line: 'sintra' },
      { code: '94-61093', label: 'Portela de Sintra', line: 'sintra' },
      { code: '94-61101', label: 'Sintra', line: 'sintra' }
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
