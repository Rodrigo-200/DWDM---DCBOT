import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Interaction,
  MessageFlags,
  StringSelectMenuInteraction
} from 'discord.js';

import { CpClient, type TrainTimetableResponse, type TrainStop } from '../../services/cpClient.js';
import type { Env } from '../../utils/env.js';
import { logger } from '../../utils/logger.js';
import { CP_STATION_SELECT_PREFIX } from './panel.js';
import { getStationByCode, type StationLine } from './stations.js';

const DAY_MINUTES = 24 * 60;
const CP_TRAIN_DETAIL_PREFIX = 'cp-train';
const CP_PAGE_PREFIX = 'cp-page';
const TRAINS_PER_PAGE = 5;

const DEFAULT_OCCUPANCY = 'Sem informação';

const OCCUPANCY_MAP: Record<number, string> = {
  0: DEFAULT_OCCUPANCY,
  1: 'Lotação baixa',
  2: 'Lotação média',
  3: 'Lotação alta'
};

const STATUS_MAP: Record<string, string> = {
  AT_STATION: 'No cais',
  ON_ROUTE: 'Em marcha',
  IN_TRANSIT: 'Em marcha',
  ENDED: 'Terminado',
  SUPPRESSED: 'Suprimido'
};

const LINE_COLORS: Record<StationLine, number> = {
  oeste: 0x0099ff, // blue - Cascais
  norte: 0x2b6cb0, // darker blue - Santarém
  noroeste: 0x6b46c1 // purple - Sintra
};

interface StationBoardEntry {
  trainNumber: string;
  service: string;
  direction: string;
  origin: string;
  scheduledTime: string;
  estimatedTime?: string | null;
  scheduledDate: string;
  absoluteMinutes: number;
  platform?: string;
  occupancy?: string;
  delayMinutes: number | null;
  isArrival: boolean;
}

interface StationBoardResult {
  entries: StationBoardEntry[];
  referenceLabel: string;
  absoluteNow: number;
}

interface NormalizedTrainStop {
  stationCode: string;
  stationName: string;
  scheduledArrival?: string | null;
  scheduledDeparture?: string | null;
  estimatedArrival?: string | null;
  estimatedDeparture?: string | null;
  platform?: string;
  absoluteMinutes: number | null;
  latitude?: number;
  longitude?: number;
}

interface CpInteractionHandlerOptions {
  env: Env;
  cpClient: CpClient;
}

export const createCpInteractionHandler = ({ env, cpClient }: CpInteractionHandlerOptions) => {
  const timezone = env.TIMEZONE || 'Europe/Lisbon';
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const displayDateFormatter = new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  });
  const timeFormatter = new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const formatDelay = (value: number | null): string => {
    if (!value || Number.isNaN(value) || value <= 0) {
      return 'Pontual';
    }
    return `+${value} min`;
  };

  const formatRelativeTime = (target: number, reference: number): string => {
    const delta = Math.round(target - reference);
    if (Math.abs(delta) <= 1) {
      return 'agora';
    }

    const absoluteDelta = Math.abs(delta);
    if (absoluteDelta >= 60) {
      const hours = Math.floor(absoluteDelta / 60);
      const minutes = absoluteDelta % 60;
      const formatted = minutes > 0 ? `${hours}h${minutes.toString().padStart(2, '0')}m` : `${hours}h`;
      return delta > 0 ? `em ${formatted}` : `há ${formatted}`;
    }

    return delta > 0 ? `em ${absoluteDelta} min` : `há ${absoluteDelta} min`;
  };

  const formatOccupancy = (value: string | number | null | undefined): string => {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      const resolved = OCCUPANCY_MAP[parsed as keyof typeof OCCUPANCY_MAP];
      if (resolved) {
        return resolved;
      }
    }
    return DEFAULT_OCCUPANCY;
  };

  const parseTimeToMinutes = (value: string | null | undefined): number | null => {
    if (!value) {
      return null;
    }
    const match = value.match(/^(?<hours>\d{1,2}):(?<minutes>\d{2})$/);
    if (!match || !match.groups) {
      return null;
    }
    const hours = Number(match.groups.hours);
    const minutes = Number(match.groups.minutes);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }
    return hours * 60 + minutes;
  };

  const diffDays = (source: string, target: string): number => {
    const parse = (value: string) => {
      const [yearRaw, monthRaw, dayRaw] = value.split('-');
      const year = Number(yearRaw);
      const month = Number(monthRaw);
      const day = Number(dayRaw);
      if ([year, month, day].some((part) => Number.isNaN(part))) {
        return 0;
      }
      return Date.UTC(year, month - 1, day);
    };
    const delta = parse(target) - parse(source);
    return Math.round(delta / (24 * 60 * 60 * 1000));
  };

  const formatBoardEntry = (entry: StationBoardEntry, absoluteNow: number): string => {
    const baseTime = entry.estimatedTime && entry.estimatedTime !== entry.scheduledTime ? `${entry.estimatedTime} (previsto)` : entry.scheduledTime;
    const destination = entry.isArrival ? entry.origin : entry.direction;
    const movementIcon = entry.isArrival ? '⬅️' : '➡️';
    const movementLabel = entry.isArrival ? 'Chegada' : 'Partida';
    const directionLabel = entry.isArrival ? `de ${destination}` : `para ${destination}`;
    const relative = formatRelativeTime(entry.absoluteMinutes, absoluteNow);
    const occupancy = entry.occupancy ?? OCCUPANCY_MAP[0];
    const platform = entry.platform ?? '—';
    const delay = formatDelay(entry.delayMinutes);

    return [
      `${movementIcon} ${baseTime} — ${movementLabel} ${directionLabel} • ${relative}`,
      `Comboio ${entry.trainNumber} • ${entry.service}`,
      `Plataforma ${platform} • Lotação ${occupancy} • ${delay}`
    ].join('\n');
  };

  const resolveStationBoard = async (stationCode: string, limit: number): Promise<StationBoardResult> => {
    const now = new Date();
    const nowMinutes = parseTimeToMinutes(timeFormatter.format(now)) ?? 0;
    const entries: StationBoardEntry[] = [];

    for (let dayOffset = 0; dayOffset <= 1 && entries.length < limit; dayOffset += 1) {
      const date = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dateStr = dateFormatter.format(date);
      const response = await cpClient.getStationTimetable(stationCode, dateStr);
      const stationStops = response.stationStops ?? [];

      logger.info('CP Station Board Debug', {
        stationCode,
        dateStr,
        totalStops: stationStops.length,
        dayOffset,
        nowMinutes,
        currentTime: timeFormatter.format(now)
      });

      for (const stop of stationStops) {
        if (stop.supression) {
          continue;
        }

        const pick = (...values: (string | null | undefined)[]) =>
          values.find((value) => Boolean(value)) ?? null;

        const scheduledDeparture = stop.departureTime ?? null;
        const estimatedDeparture = stop.ETD ?? null;
        const scheduledArrival = stop.arrivalTime ?? null;
        const estimatedArrival = stop.ETA ?? null;

        const hasDeparture = Boolean(scheduledDeparture ?? estimatedDeparture);
        const hasArrival = Boolean(scheduledArrival ?? estimatedArrival);
        if (!hasDeparture && !hasArrival) {
          continue;
        }

        const timeReference = pick(estimatedDeparture, scheduledDeparture, estimatedArrival, scheduledArrival);
        if (!timeReference) {
          continue;
        }

        const minutes = parseTimeToMinutes(timeReference);
        if (minutes === null) {
          continue;
        }

        if (dayOffset === 0 && minutes < nowMinutes) {
          continue;
        }

        const scheduledTime = hasDeparture
          ? (pick(scheduledDeparture, estimatedDeparture, scheduledArrival, estimatedArrival) ?? timeReference)
          : (pick(scheduledArrival, estimatedArrival, scheduledDeparture, estimatedDeparture) ?? timeReference);

        const estimatedTime = hasDeparture
          ? pick(estimatedDeparture, scheduledDeparture, estimatedArrival, scheduledArrival)
          : pick(estimatedArrival, scheduledArrival, estimatedDeparture, scheduledDeparture);

        const entry: StationBoardEntry = {
          trainNumber: String(stop.trainNumber ?? '—').trim(),
          service: stop.trainService?.designation ?? stop.trainService?.code ?? 'Serviço CP',
          direction: stop.trainDestination?.designation ?? stop.trainOrigin?.designation ?? '—',
          origin: stop.trainOrigin?.designation ?? '—',
          scheduledTime,
          estimatedTime,
          scheduledDate: dateStr,
          absoluteMinutes: dayOffset * DAY_MINUTES + minutes,
          platform: stop.platform ? String(stop.platform) : undefined,
          occupancy: formatOccupancy(stop.occupancy),
          delayMinutes: stop.delay != null ? Number(stop.delay) || 0 : null,
          isArrival: !hasDeparture && hasArrival
        };

        entries.push(entry);
      }
    }

    entries.sort((a, b) => a.absoluteMinutes - b.absoluteMinutes);

    const filtered = entries.slice(0, limit);
    const reference = filtered[0]?.scheduledDate ?? dateFormatter.format(now);
    const referenceLabel = displayDateFormatter.format(new Date(`${reference}T00:00:00Z`));

    return { entries: filtered, referenceLabel, absoluteNow: nowMinutes };
  };

  const toNumber = (value: unknown): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const normalizeTrainStops = (stops: TrainStop[]): NormalizedTrainStop[] => {
    const normalized: NormalizedTrainStop[] = [];
    let previousMinutes: number | null = null;
    let dayOffset = 0;

    for (const stop of stops) {
      const arrival = stop.arrival ?? null;
      const departure = stop.departure ?? null;
      const eta = stop.ETA ?? null;
      const etd = stop.ETD ?? null;
      const timeCandidate = etd ?? departure ?? eta ?? arrival;
      const minutes = parseTimeToMinutes(timeCandidate);

      if (minutes !== null) {
        if (previousMinutes !== null && minutes < previousMinutes) {
          dayOffset += 1;
        }
        previousMinutes = minutes;
      }

      const latitude = toNumber(stop.latitude ?? stop.station?.latitude);
      const longitude = toNumber(stop.longitude ?? stop.station?.longitude);

      normalized.push({
        stationCode: stop.station?.code ?? '',
        stationName: stop.station?.designation ?? '—',
        scheduledArrival: arrival,
        scheduledDeparture: departure,
        estimatedArrival: eta,
        estimatedDeparture: etd,
        platform: stop.platform ? String(stop.platform) : undefined,
        absoluteMinutes: minutes === null ? null : minutes + dayOffset * DAY_MINUTES,
        latitude,
        longitude
      });
    }

    return normalized;
  };

  const buildStaticMapUrl = (stops: NormalizedTrainStop[], liveLat?: number, liveLon?: number): string | null => {
    const points = stops
      .map((stop) => {
        if (stop.latitude == null || stop.longitude == null) {
          return null;
        }
        return { lat: stop.latitude, lon: stop.longitude };
      })
      .filter((point): point is { lat: number; lon: number } => Boolean(point));

    if (points.length < 2 && (liveLat == null || liveLon == null)) {
      return null;
    }

    const sampledPoints = samplePoints(points, 10);
    const params = new URLSearchParams();
    params.set('size', '640x360');
    params.set('scale', '1');

    const center = liveLat != null && liveLon != null
      ? { lat: liveLat, lon: liveLon }
      : points[Math.floor(points.length / 2)] ?? points[0];
    if (center) {
      params.set('center', `${center.lat.toFixed(5)},${center.lon.toFixed(5)}`);
    }

    params.set('zoom', liveLat != null && liveLon != null ? '11' : '9');

    if (sampledPoints.length >= 2) {
      const route = sampledPoints
        .map((point) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`)
        .join('|');
      params.append('path', `color:0x0050c8|weight:3|${route}`);
    }

    const origin = points[0];
    const destination = points[points.length - 1];
    if (origin) {
      params.append('markers', `${origin.lat.toFixed(5)},${origin.lon.toFixed(5)},blue`);
    }
    if (destination) {
      params.append('markers', `${destination.lat.toFixed(5)},${destination.lon.toFixed(5)},red`);
    }
    if (liveLat != null && liveLon != null) {
      params.append('markers', `${liveLat.toFixed(5)},${liveLon.toFixed(5)},green`);
    }

    return `https://staticmap.openstreetmap.de/staticmap.php?${params.toString()}`;
  };

  const samplePoints = (points: { lat: number; lon: number }[], max: number): { lat: number; lon: number }[] => {
    if (points.length <= max) {
      return points;
    }
    const sampled: { lat: number; lon: number }[] = [];
    const step = (points.length - 1) / (max - 1);
    const used = new Set<number>();

    for (let index = 0; index < max; index += 1) {
      const raw = Math.round(index * step);
      const clamped = Math.max(0, Math.min(points.length - 1, raw));
      if (used.has(clamped)) {
        continue;
      }
      const point = points[clamped];
      if (!point) {
        continue;
      }
      sampled.push(point);
      used.add(clamped);
    }

    if (!used.has(points.length - 1)) {
      const tail = points[points.length - 1];
      if (tail) {
        sampled.push(tail);
      }
    }

    return sampled;
  };

  const handleStationSelect = async (interaction: StringSelectMenuInteraction, page = 0): Promise<void> => {
    const stationCode = interaction.values.at(0);
    if (!stationCode) {
      await interaction.reply({
        content: 'Não consegui perceber qual foi a estação selecionada.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const station = getStationByCode(stationCode);
    if (!station) {
      await interaction.reply({
        content: 'Estação desconhecida. Atualiza o painel para garantir que está correto.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
      const board = await resolveStationBoard(stationCode, 50);
      if (board.entries.length === 0) {
        await interaction.editReply({
          content: 'Não existem comboios previstos para esta estação nas próximas horas.',
          components: [],
          embeds: []
        });
        return;
      }

      const totalPages = Math.ceil(board.entries.length / TRAINS_PER_PAGE);
      const currentPage = Math.max(0, Math.min(page, totalPages - 1));
      const startIdx = currentPage * TRAINS_PER_PAGE;
      const endIdx = startIdx + TRAINS_PER_PAGE;
      const pageEntries = board.entries.slice(startIdx, endIdx);

      const embedColor = LINE_COLORS[station.line] ?? 0x2b6cb0;

      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`🚉 ${station.label}`)
        .setDescription(`Horários previstos — ${board.referenceLabel}`)
        .setTimestamp(new Date())
        .setFooter({ 
          text: totalPages > 1 
            ? `Página ${currentPage + 1} de ${totalPages} • Horários em ${timezone}`
            : `Horários em ${timezone}` 
        });

      const departures = pageEntries.filter((entry) => !entry.isArrival);
      const arrivals = pageEntries.filter((entry) => entry.isArrival);

      embed.addFields(
        {
          name: 'Partidas',
          value: departures.length > 0
            ? departures.map((entry) => formatBoardEntry(entry, board.absoluteNow)).join('\n\n')
            : 'Sem partidas previstas nesta página.'
        },
        {
          name: 'Chegadas',
          value: arrivals.length > 0
            ? arrivals.map((entry) => formatBoardEntry(entry, board.absoluteNow)).join('\n\n')
            : 'Sem chegadas previstas nesta página.'
        }
      );

      const components: ActionRowBuilder<ButtonBuilder>[] = [];

      // Train detail buttons
      const buttonsRow = new ActionRowBuilder<ButtonBuilder>();
      for (const entry of pageEntries) {
        const customId = `${CP_TRAIN_DETAIL_PREFIX}|${entry.trainNumber}|${entry.scheduledDate}`;
        buttonsRow.addComponents(
          new ButtonBuilder()
            .setCustomId(customId)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`Detalhes ${entry.trainNumber}`)
        );
      }
      components.push(buttonsRow);

      // Pagination buttons (only if multiple pages)
      if (totalPages > 1) {
        const paginationRow = new ActionRowBuilder<ButtonBuilder>();
        
        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`${CP_PAGE_PREFIX}|${stationCode}|${currentPage - 1}`)
            .setStyle(ButtonStyle.Primary)
            .setLabel('◀ Anterior')
            .setDisabled(currentPage === 0)
        );

        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`cp-page-info|${stationCode}|${currentPage}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`${currentPage + 1}/${totalPages}`)
            .setDisabled(true)
        );

        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`${CP_PAGE_PREFIX}|${stationCode}|${currentPage + 1}`)
            .setStyle(ButtonStyle.Primary)
            .setLabel('Seguinte ▶')
            .setDisabled(currentPage === totalPages - 1)
        );

        components.push(paginationRow);
      }

      await interaction.editReply({
        embeds: [embed],
        components
      });
    } catch (error) {
      logger.error('Falha ao obter estação CP', {
        stationCode,
        error: error instanceof Error ? error.message : String(error)
      });
      await interaction.editReply({
        content: 'Não foi possível obter a informação desta estação neste momento.',
        components: []
      });
    }
  };

  const handlePageNavigation = async (interaction: ButtonInteraction): Promise<void> => {
    const [_, stationCode, pageStr] = interaction.customId.split('|');
    const page = toNumber(pageStr) ?? 0;

    if (!stationCode) {
      await interaction.reply({
        content: 'Não consegui identificar a estação.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }

    const station = getStationByCode(stationCode);
    if (!station) {
      await interaction.editReply({
        content: 'Estação desconhecida.',
        components: []
      });
      return;
    }

    try {
      const board = await resolveStationBoard(stationCode, 50);
      if (board.entries.length === 0) {
        await interaction.editReply({
          content: 'Não existem comboios previstos para esta estação nas próximas horas.',
          components: [],
          embeds: []
        });
        return;
      }

      const totalPages = Math.ceil(board.entries.length / TRAINS_PER_PAGE);
      const currentPage = Math.max(0, Math.min(page, totalPages - 1));
      const startIdx = currentPage * TRAINS_PER_PAGE;
      const endIdx = startIdx + TRAINS_PER_PAGE;
      const pageEntries = board.entries.slice(startIdx, endIdx);

      const embedColor = LINE_COLORS[station.line] ?? 0x2b6cb0;

      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`🚉 ${station.label}`)
        .setDescription(`Horários previstos — ${board.referenceLabel}`)
        .setTimestamp(new Date())
        .setFooter({ 
          text: totalPages > 1 
            ? `Página ${currentPage + 1} de ${totalPages} • Horários em ${timezone}`
            : `Horários em ${timezone}` 
        });

      const departures = pageEntries.filter((entry) => !entry.isArrival);
      const arrivals = pageEntries.filter((entry) => entry.isArrival);

      embed.addFields(
        {
          name: 'Partidas',
          value: departures.length > 0
            ? departures.map((entry) => formatBoardEntry(entry, board.absoluteNow)).join('\n\n')
            : 'Sem partidas previstas nesta página.'
        },
        {
          name: 'Chegadas',
          value: arrivals.length > 0
            ? arrivals.map((entry) => formatBoardEntry(entry, board.absoluteNow)).join('\n\n')
            : 'Sem chegadas previstas nesta página.'
        }
      );

      const components: ActionRowBuilder<ButtonBuilder>[] = [];

      // Train detail buttons
      const buttonsRow = new ActionRowBuilder<ButtonBuilder>();
      for (const entry of pageEntries) {
        const customId = `${CP_TRAIN_DETAIL_PREFIX}|${entry.trainNumber}|${entry.scheduledDate}`;
        buttonsRow.addComponents(
          new ButtonBuilder()
            .setCustomId(customId)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`Detalhes ${entry.trainNumber}`)
        );
      }
      components.push(buttonsRow);

      // Pagination buttons
      if (totalPages > 1) {
        const paginationRow = new ActionRowBuilder<ButtonBuilder>();
        
        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`${CP_PAGE_PREFIX}|${stationCode}|${currentPage - 1}`)
            .setStyle(ButtonStyle.Primary)
            .setLabel('◀ Anterior')
            .setDisabled(currentPage === 0)
        );

        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`cp-page-info|${stationCode}|${currentPage}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`${currentPage + 1}/${totalPages}`)
            .setDisabled(true)
        );

        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`${CP_PAGE_PREFIX}|${stationCode}|${currentPage + 1}`)
            .setStyle(ButtonStyle.Primary)
            .setLabel('Seguinte ▶')
            .setDisabled(currentPage === totalPages - 1)
        );

        components.push(paginationRow);
      }

      await interaction.editReply({
        embeds: [embed],
        components
      });
    } catch (error) {
      logger.error('Falha ao navegar páginas CP', {
        stationCode,
        page,
        error: error instanceof Error ? error.message : String(error)
      });
      await interaction.editReply({
        content: 'Não foi possível carregar esta página.',
        components: []
      });
    }
  };

  const handleTrainDetails = async (interaction: ButtonInteraction): Promise<void> => {
    const [_, trainNumberRaw, date] = interaction.customId.split('|');
    const trainNumber = trainNumberRaw?.trim();

    if (!trainNumber || !date) {
      await interaction.reply({
        content: 'Não consegui identificar o comboio selecionado.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
      const timetable = await cpClient.getTrainTimetable(trainNumber, date);
      const embed = buildTrainDetailEmbed({
        timetable,
        trainNumber,
        date
      });

      await interaction.editReply({ embeds: [embed], components: [] });
    } catch (error) {
      logger.error('Falha ao obter detalhe de comboio CP', {
        trainNumber,
        date,
        error: error instanceof Error ? error.message : String(error)
      });
      await interaction.editReply({
        content: 'Não foi possível obter os detalhes deste comboio. Tenta novamente dentro de instantes.',
        components: []
      });
    }
  };

  const buildTrainDetailEmbed = ({
    timetable,
    trainNumber,
    date
  }: {
    timetable: TrainTimetableResponse;
    trainNumber: string;
    date: string;
  }): EmbedBuilder => {
    const trainStops = normalizeTrainStops(timetable.trainStops ?? []);
    const origin = trainStops[0];
    const destination = trainStops[trainStops.length - 1];
    const service = timetable.trainService?.designation ?? timetable.trainService?.code ?? 'Serviço CP';
    const statusRaw = timetable.status ?? '';
    const status = STATUS_MAP[statusRaw] ?? (statusRaw || '—');
    const delay = timetable.delay != null ? Number(timetable.delay) || 0 : null;
    const occupancy = formatOccupancy(timetable.occupancy);

    const now = new Date();
    const nowDateStr = dateFormatter.format(now);
    const dayOffset = diffDays(date, nowDateStr);
    const nowMinutes = parseTimeToMinutes(timeFormatter.format(now)) ?? 0;
    const absoluteNow = nowMinutes + dayOffset * DAY_MINUTES;

    const upcomingStops = trainStops
      .filter((stop) => stop.absoluteMinutes != null && stop.absoluteMinutes >= absoluteNow)
      .slice(0, 4);

    const lastStationCode = timetable.lastStationCode ?? '';
    const lastStation = lastStationCode
      ? trainStops.find((stop) => stop.stationCode === lastStationCode)
      : undefined;

    let liveLat = toNumber(timetable.latitude);
    let liveLon = toNumber(timetable.longitude);

    if (liveLat == null || liveLon == null) {
      liveLat = undefined;
      liveLon = undefined;
    } else if (Math.abs(liveLat) < 0.0001 && Math.abs(liveLon) < 0.0001) {
      liveLat = undefined;
      liveLon = undefined;
    }

    const mapUrl = buildStaticMapUrl(trainStops, liveLat, liveLon);

    const embed = new EmbedBuilder()
      .setColor(0x2b6cb0)
      .setTitle(`Comboio ${timetable.trainNumber ?? trainNumber}`)
      .setDescription(`Serviço ${service}`)
      .setTimestamp(new Date())
      .setFooter({ text: `Horário ${date} • ${timezone}` });

    embed.addFields(
      {
        name: 'Situação',
        value: [
          `Estado: ${status}`,
          `Atraso: ${formatDelay(delay)}`,
          `Lotação: ${occupancy}`
        ].join('\n')
      }
    );

    if (origin || destination) {
      const originLabel = origin ? `${origin.stationName} (${origin.estimatedDeparture ?? origin.scheduledDeparture ?? '—'})` : '—';
      const destinationLabel = destination
        ? `${destination.stationName} (${destination.estimatedArrival ?? destination.scheduledArrival ?? '—'})`
        : '—';
      const duration = timetable.duration ? `\nDuração prevista: ${timetable.duration}` : '';
      embed.addFields({
        name: 'Percurso',
        value: [`Origem: ${originLabel}`, `Destino: ${destinationLabel}${duration}`].join('\n')
      });
    }

    if (upcomingStops.length > 0) {
      const nextValue = upcomingStops
        .map((stop) => {
          const time = stop.estimatedDeparture ?? stop.estimatedArrival ?? stop.scheduledDeparture ?? stop.scheduledArrival ?? '—';
          return `• ${time} — ${stop.stationName}`;
        })
        .join('\n');
      embed.addFields({ name: 'Próximas paragens', value: nextValue });
    } else {
      embed.addFields({ name: 'Próximas paragens', value: 'Sem paragens futuras — serviço concluído ou não iniciado.' });
    }

    const infoLines = [] as string[];
    if (lastStation) {
      infoLines.push(`Última estação conhecida: ${lastStation.stationName}`);
    }
    if (liveLat != null && liveLon != null) {
      infoLines.push(`Posição estimada: ${liveLat.toFixed(4)}, ${liveLon.toFixed(4)}`);
    }
    if (infoLines.length > 0) {
      embed.addFields({ name: 'Última atualização', value: infoLines.join('\n') });
    }

    if (mapUrl) {
      embed.setImage(mapUrl);
    }

    return embed;
  };

  return async (interaction: Interaction): Promise<boolean> => {
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(CP_STATION_SELECT_PREFIX)) {
      await handleStationSelect(interaction);
      return true;
    }

    if (interaction.isButton() && interaction.customId.startsWith(CP_PAGE_PREFIX)) {
      await handlePageNavigation(interaction);
      return true;
    }

    if (interaction.isButton() && interaction.customId.startsWith(CP_TRAIN_DETAIL_PREFIX)) {
      await handleTrainDetails(interaction);
      return true;
    }

    return false;
  };
};
