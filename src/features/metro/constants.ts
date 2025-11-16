import type { MetroLine } from '../../services/metroClient.js';

export const METRO_STATION_SELECT_PREFIX = 'metro-station';
export const METRO_DIRECTION_SELECT_PREFIX = 'metro-direction';
export const METRO_REFRESH_BUTTON_PREFIX = 'metro-refresh';

export const METRO_LINE_ORDER: MetroLine[] = ['Amarela', 'Verde', 'Azul', 'Vermelha'];

export const METRO_LINE_STYLE: Record<MetroLine, { label: string; emoji: string; color: number }> = {
  Amarela: {
    label: 'Linha Amarela',
    emoji: '🟡',
    color: 0xf2c037
  },
  Verde: {
    label: 'Linha Verde',
    emoji: '🟢',
    color: 0x009739
  },
  Azul: {
    label: 'Linha Azul',
    emoji: '🔵',
    color: 0x0074c7
  },
  Vermelha: {
    label: 'Linha Vermelha',
    emoji: '🔴',
    color: 0xe3232c
  }
};
