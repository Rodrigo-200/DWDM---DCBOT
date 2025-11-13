import { createHash } from 'node:crypto';

import type { Client, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';

import type { Env } from '../utils/env.js';
import type { JsonStorage } from '../utils/storage.js';
import type { PersistentState, StoredScheduleEntry } from '../state.js';
import { logger } from '../utils/logger.js';
import {
  ScheduleClient,
  ScheduleServiceUnavailableError,
  type ScheduleEntry
} from '../services/scheduleClient.js';

interface ScheduleWatcherOptions {
  client: Client;
  env: Env;
  stateStorage: JsonStorage<PersistentState>;
}

interface ScheduleDiff {
  added: ScheduleEntry[];
  updated: Array<{ previous: StoredScheduleEntry; current: ScheduleEntry }>;
  removed: StoredScheduleEntry[];
}

export const createScheduleWatcher = ({ client, env, stateStorage }: ScheduleWatcherOptions) => {
  const scheduleClient = new ScheduleClient({ env });

  return async () => {
    logger.info('Running schedule watcher');

    const attemptAt = new Date().toISOString();
    const state = await stateStorage.read();
    const previousEntries = state.scheduleEntries ?? [];
    const fallbackEntries = previousEntries.map(toScheduleEntry);

    let scheduleEntries: ScheduleEntry[] = [];
    let serviceUnavailable = false;
    let fetchSucceeded = false;

    let normalizedStoredEntries: StoredScheduleEntry[] = previousEntries;
    let scheduleHash = state.scheduleHash;
    let messageId = state.scheduleMessageId ?? null;
    let changeMessageId = state.scheduleChangeMessageId ?? null;
    let postedNewMessage = false;

    const previousSuccessAt = state.scheduleLastSuccessAt ?? null;
    let nextSuccessAt = previousSuccessAt;

    try {
      try {
        scheduleEntries = await scheduleClient.fetchSchedule();
        fetchSucceeded = true;
      } catch (error) {
        if (error instanceof ScheduleServiceUnavailableError) {
          serviceUnavailable = true;
          if (fallbackEntries.length) {
            scheduleEntries = fallbackEntries;
            logger.warn('NetPA service unavailable, using cached schedule snapshot');
          } else {
            logger.warn('NetPA service unavailable and no cached schedule entries found');
            scheduleEntries = [];
          }
        } else {
          throw error;
        }
      }

      if (!serviceUnavailable) {
        const now = Date.now();
        if (!hasUpcomingEntries(scheduleEntries, now) && scheduleEntries.length) {
          logger.info('All retrieved schedule entries are in the past, loading next week');
          try {
            scheduleEntries = await scheduleClient.fetchSchedule({ weekOffset: 1 });
            fetchSucceeded = true;
          } catch (error) {
            if (error instanceof ScheduleServiceUnavailableError) {
              serviceUnavailable = true;
              if (fallbackEntries.length) {
                scheduleEntries = fallbackEntries;
                logger.warn('NetPA became unavailable while loading next week, using cached schedule snapshot');
              } else {
                logger.warn('NetPA became unavailable while loading next week and no cached schedule entries were found');
                // keep the entries we already fetched even if they are in the past
              }
            } else {
              throw error;
            }
          }
        }
      }

      const diff = diffScheduleEntries(previousEntries, scheduleEntries);
      const diffHasChanges = diff.added.length > 0 || diff.updated.length > 0 || diff.removed.length > 0;

      normalizedStoredEntries = scheduleEntries.map(storeScheduleEntry).sort(compareEntries);

      scheduleHash = createHash('sha256')
        .update(JSON.stringify(normalizedStoredEntries))
        .digest('hex');

      const isFirstRun = !state.scheduleHash;
      const hasChanges = state.scheduleHash !== scheduleHash;
      const shouldSendPing = !isFirstRun && hasChanges && diffHasChanges;

      const channel = await client.channels.fetch(env.SCHEDULE_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) {
        logger.warn('Schedule channel not found or not text-based', {
          channelId: env.SCHEDULE_CHANNEL_ID
        });
        return;
      }

      const textChannel = channel as TextChannel;

      const previousMessageId = state.scheduleMessageId ?? null;

      const result = await upsertScheduleMessage({
        channel: textChannel,
        entries: scheduleEntries,
        existingMessageId: previousMessageId,
        serviceUnavailable
      });

      messageId = result.messageId ?? messageId;
      postedNewMessage = result.postedNewMessage;

      changeMessageId = state.scheduleChangeMessageId ?? null;

      if (shouldSendPing) {
        const changeResult = await upsertScheduleChangeMessage({
          channel: textChannel,
          diff,
          existingMessageId: changeMessageId
        });
        if (changeResult.messageId) {
          changeMessageId = changeResult.messageId;
        }
      } else if (isFirstRun) {
        logger.info('Initial schedule snapshot stored');
      } else if (hasChanges) {
        logger.info('Schedule hash changed but no actionable differences detected');
      } else {
        logger.info('No schedule changes detected');
      }

      if (postedNewMessage && isFirstRun) {
        logger.info('Schedule embed initialized');
      }

      if (fetchSucceeded) {
        nextSuccessAt = attemptAt;
      }
    } catch (error) {
      logger.error('Schedule watcher failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      await stateStorage.write({
        ...state,
        scheduleHash,
        scheduleMessageId: messageId,
        scheduleEntries: normalizedStoredEntries,
        scheduleChangeMessageId: changeMessageId,
        scheduleLastAttemptAt: attemptAt,
        scheduleLastSuccessAt: nextSuccessAt
      });
    }
  };
};

const upsertScheduleMessage = async ({
  channel,
  entries,
  existingMessageId,
  serviceUnavailable = false
}: {
  channel: TextChannel;
  entries: ScheduleEntry[];
  existingMessageId: string | null;
  serviceUnavailable?: boolean;
}) => {
  const embed = buildScheduleEmbed(entries, { serviceUnavailable });

  if (existingMessageId) {
    try {
      const message = await channel.messages.fetch(existingMessageId);
      await message.edit({ content: '', embeds: [embed], allowedMentions: { parse: [] } });
      return { messageId: message.id, postedNewMessage: false };
    } catch (error) {
      logger.warn('Could not edit existing schedule message, will post a new one', {
        messageId: existingMessageId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const message = await channel.send({ content: '', embeds: [embed], allowedMentions: { parse: [] } });
  return { messageId: message.id, postedNewMessage: true };
};

const upsertScheduleChangeMessage = async ({
  channel,
  diff,
  existingMessageId
}: {
  channel: TextChannel;
  diff: ScheduleDiff;
  existingMessageId: string | null;
}) => {
  const summaryLines = buildChangeSummary(diff);

  if (!summaryLines.length) {
    logger.warn('Schedule changed but no diff summary could be generated');
    return { messageId: existingMessageId, postedNewMessage: false };
  }

  const embed = new EmbedBuilder()
    .setColor(0x00_66_ff)
    .setTitle('Alterações mais recentes')
    .setDescription(summaryLines.join('\n'))
    .setTimestamp(new Date());

  const footer = buildChangeFooter(diff);
  if (footer) {
    embed.setFooter({ text: footer });
  }

  if (existingMessageId) {
    try {
      const message = await channel.messages.fetch(existingMessageId);
      await message.edit({
        content: 'O horário do NetPA foi atualizado.',
        embeds: [embed],
        allowedMentions: { parse: [] }
      });
      return { messageId: message.id, postedNewMessage: false };
    } catch (error) {
      logger.warn('Could not edit existing schedule change message, will post a new one', {
        messageId: existingMessageId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const message = await channel.send({
    content: 'O horário do NetPA foi atualizado.',
    allowedMentions: { parse: [] },
    embeds: [embed]
  });
  return { messageId: message.id, postedNewMessage: true };
};

const buildScheduleEmbed = (entries: ScheduleEntry[], options: { serviceUnavailable?: boolean } = {}) => {
  const { serviceUnavailable = false } = options;
  const sortedEntries = [...entries].sort(compareEntries);
  const now = new Date();

  const embed = new EmbedBuilder()
    .setTitle('📅 Horário semanal')
    .setColor(serviceUnavailable ? 0xf59e0b : 0x3b82f6)
    .setTimestamp(new Date())
    .setFooter({
      text: serviceUnavailable ? 'Último horário conhecido — NetPA indisponível' : 'Atualizado automaticamente'
    });

  if (!sortedEntries.length) {
    const lines: string[] = [];
    if (serviceUnavailable) {
      lines.push('⚠️ O NetPA está indisponível. A mostrar o último horário conhecido.');
      if (!entries.length) {
        lines.push('Ainda não existe um horário guardado para apresentar.');
      }
      lines.push('Vamos atualizar assim que o NetPA voltar a responder.');
    } else {
      lines.push('Nenhum evento encontrado para o período atual.');
      lines.push('Horário sincronizado automaticamente com o NetPA.');
    }
    embed.setDescription(lines.join('\n'));
    return embed;
  }

  const headerLines: string[] = [];
  if (serviceUnavailable) {
    headerLines.push('⚠️ O NetPA está indisponível. A mostrar o último horário conhecido.');
  }

  const rangeLabel = getScheduleRangeLabel(sortedEntries);
  
  // Find the next upcoming class (not already started)
  const nextEntry = sortedEntries.find((entry) => {
    const entryDate = getEntryDate(entry);
    return entryDate && entryDate.getTime() > now.getTime();
  });

  if (rangeLabel) {
    headerLines.push(`**Período:** ${rangeLabel}`);
  }

  if (nextEntry) {
    headerLines.push(`**Próxima aula:** ${formatHeadline(nextEntry)}`);
  }

  headerLines.push(
    serviceUnavailable
      ? 'Sincronização suspensa até o NetPA voltar a responder.'
      : 'Horário sincronizado automaticamente com o NetPA.'
  );
  embed.setDescription(headerLines.join('\n'));

  const grouped = groupEntriesByDay(sortedEntries);
  for (const { label, items } of grouped.slice(0, 5)) {
    const value = items
      .map((entry) => formatEntryLine(entry))
      .join('\n')
      .slice(0, 1_024);

    if (value) {
      embed.addFields({ name: label, value });
    }
  }

  return embed;
};

const groupEntriesByDay = (entries: ScheduleEntry[]) => {
  const weekdayFormatter = new Intl.DateTimeFormat('pt-PT', { weekday: 'long' });
  const dateFormatter = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' });

  const groups = new Map<string, ScheduleEntry[]>();

  for (const entry of entries) {
    let label = 'Eventos';

    const entryDate = getEntryDate(entry);
    if (entryDate) {
      const weekday = capitalizeFirst(weekdayFormatter.format(entryDate));
      const dayLabel = dateFormatter.format(entryDate);
      label = `${weekday} • ${dayLabel}`;
    } else {
      const match = entry.time.match(/^(\w{3}\s\d{1,2}\s\w{3})/);
      if (match?.[1]) {
        label = match[1];
      }
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(entry);
  }

  return [...groups.entries()].map(([label, items]) => ({ label, items }));
};

const capitalizeFirst = (value: string) => {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatEntryLine = (entry: ScheduleEntry, bulletSymbol = '•') => {
  const timeWithoutDate = entry.date ? entry.time.replace(/^[^ ]+\s/, '') : entry.time;
  const { plainName, courseCode } = parseCourseMeta(entry.title);

  const bulletPrefix = timeWithoutDate ? `${bulletSymbol} **${timeWithoutDate}**` : bulletSymbol;
  let line = `${bulletPrefix} **${plainName}**`;
  if (courseCode) {
    line += ` \`${courseCode}\``;
  }

  const details: string[] = [];
  if (entry.location) {
    details.push(`📍 ${entry.location}`);
  }
  if (entry.lecturer) {
    details.push(`👤 ${entry.lecturer}`);
  }

  if (details.length) {
    line += `\n  ${details.join('  •  ')}`;
  }

  return line.trimEnd();
};

const compareEntries = (a: ScheduleEntry | StoredScheduleEntry, b: ScheduleEntry | StoredScheduleEntry) => {
  const timestampA = getEntryTimestamp(a);
  const timestampB = getEntryTimestamp(b);
  return timestampA - timestampB;
};

const getEntryTimestamp = (entry: ScheduleEntry | StoredScheduleEntry) => {
  const date = getEntryDate(entry);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
};

const getEntryDate = (entry: ScheduleEntry | StoredScheduleEntry): Date | null => {
  if ('start' in entry && entry.start) {
    const startDate = new Date(entry.start);
    if (!Number.isNaN(startDate.getTime())) {
      return startDate;
    }
  }

  if (entry.date) {
    const normalizedDate = entry.date.includes('T') ? entry.date : `${entry.date}T00:00:00Z`;
    const baseDate = new Date(normalizedDate);
    if (!Number.isNaN(baseDate.getTime())) {
      const timeMatch = entry.time.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        baseDate.setUTCHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
      }
      return baseDate;
    }
  }

  const fallbackMatch = entry.time.match(/(\d{1,2})\/(\d{1,2}).*?(\d{1,2}):(\d{2})/);
  if (fallbackMatch) {
    const day = Number(fallbackMatch[1]);
    const month = Number(fallbackMatch[2]);
    const hours = Number(fallbackMatch[3]);
    const minutes = Number(fallbackMatch[4]);
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), month - 1, day, hours, minutes, 0, 0));
  }

  return null;
};

const hasUpcomingEntries = (entries: ScheduleEntry[], now: number) => {
  return entries.some((entry) => {
    const entryDate = getEntryDate(entry);
    if (!entryDate) {
      return true;
    }
    return entryDate.getTime() >= now;
  });
};

const parseCourseMeta = (title: string) => {
  const [rawCourse, rawCode] = title.split(' — ');
  const plainName = (rawCourse ?? title).trim();
  const courseCode = rawCode?.trim() ?? '';
  return { plainName, courseCode };
};

const getScheduleRangeLabel = (entries: ScheduleEntry[]) => {
  const dates = entries
    .map((entry) => getEntryDate(entry))
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());

  if (!dates.length) {
    return '';
  }

  const [first, last] = [dates[0], dates[dates.length - 1]];
  const formatter = new Intl.DateTimeFormat('pt-PT', {
    day: 'numeric',
    month: 'short'
  });

  const start = formatter.format(first);
  const end = formatter.format(last);
  if (start === end) {
    return start;
  }
  return `${start} → ${end}`;
};

const formatHeadline = (entry: ScheduleEntry) => {
  const entryDate = getEntryDate(entry);
  const dayFormatter = new Intl.DateTimeFormat('pt-PT', { weekday: 'short' });
  const time = entry.date ? entry.time.replace(/^[^ ]+\s/, '') : entry.time;
  const { plainName, courseCode } = parseCourseMeta(entry.title);

  const prefixParts: string[] = [];
  if (entryDate) {
    prefixParts.push(capitalizeFirst(dayFormatter.format(entryDate)));
  }
  if (time) {
    prefixParts.push(time);
  }

  const prefix = prefixParts.join(' • ');
  let headline = prefix ? `${prefix} — ${plainName}` : plainName;
  if (courseCode) {
    headline += ` (${courseCode})`;
  }
  if (entry.location) {
    headline += ` — ${entry.location}`;
  }
  return headline;
};

const storeScheduleEntry = (entry: ScheduleEntry): StoredScheduleEntry => ({
  title: entry.title,
  time: entry.time,
  location: entry.location,
  lecturer: entry.lecturer,
  date: entry.date,
  start: entry.start
});

const diffScheduleEntries = (
  previous: StoredScheduleEntry[],
  current: ScheduleEntry[]
): ScheduleDiff => {
  const added: ScheduleEntry[] = [];
  const updated: Array<{ previous: StoredScheduleEntry; current: ScheduleEntry }> = [];
  const previousIndex = new Map<string, StoredScheduleEntry[]>();
  const matchedPrevious = new Set<StoredScheduleEntry>();

  const indexPreviousEntry = (key: string, entry: StoredScheduleEntry) => {
    if (!previousIndex.has(key)) {
      previousIndex.set(key, []);
    }
    previousIndex.get(key)!.push(entry);
  };

  for (const entry of previous) {
    for (const key of getEntryKeyCandidates(entry)) {
      indexPreviousEntry(key, entry);
    }
  }

  const pullFromIndex = (key: string) => {
    const bucket = previousIndex.get(key);
    if (!bucket?.length) {
      return null;
    }
    while (bucket.length) {
      const candidate = bucket.shift()!;
      if (!matchedPrevious.has(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  for (const entry of current) {
    let previousEntry: StoredScheduleEntry | null = null;
    for (const key of getEntryKeyCandidates(entry)) {
      const candidate = pullFromIndex(key);
      if (candidate) {
        previousEntry = candidate;
        break;
      }
    }

    if (!previousEntry) {
      added.push(entry);
      continue;
    }

    matchedPrevious.add(previousEntry);

    if (buildEntryFullKey(entry) !== buildEntryFullKey(previousEntry)) {
      updated.push({ previous: previousEntry, current: entry });
    }
  }

  const removed = previous.filter((entry) => !matchedPrevious.has(entry));

  return { added, updated, removed };
};

const buildEntryBaseKey = (entry: ScheduleEntry | StoredScheduleEntry) => {
  if (entry.start) {
    return entry.start;
  }
  const datePart = entry.date ?? '';
  return `${datePart}|${entry.time}|${entry.title}`;
};

const getEntryKeyCandidates = (entry: ScheduleEntry | StoredScheduleEntry) => {
  const keys: string[] = [];
  if (entry.start) {
    keys.push(entry.start);
  }
  const fallback = `${entry.date ?? ''}|${entry.time}|${entry.title}`;
  if (!keys.includes(fallback)) {
    keys.push(fallback);
  }
  return keys;
};

const buildEntryFullKey = (entry: ScheduleEntry | StoredScheduleEntry) => {
  return `${buildEntryBaseKey(entry)}|${entry.location}|${entry.lecturer}`;
};

const buildChangeSummary = (diff: ScheduleDiff) => {
  const lines: string[] = [];

  for (const item of diff.updated) {
    const formatted = formatEntryLine(item.current, '✏️');
    const details = describeEntryChanges(item.previous, item.current);
    lines.push(details ? `${formatted}\n  ${details}` : formatted);
  }

  for (const entry of diff.added) {
    lines.push(formatEntryLine(entry, '➕'));
  }

  for (const entry of diff.removed) {
    lines.push(formatEntryLine(toScheduleEntry(entry), '➖'));
  }

  return lines.slice(0, 5);
};

const buildChangeFooter = (diff: ScheduleDiff) => {
  const parts: string[] = [];
  if (diff.added.length) {
    parts.push(`➕ ${diff.added.length}`);
  }
  if (diff.updated.length) {
    parts.push(`✏️ ${diff.updated.length}`);
  }
  if (diff.removed.length) {
    parts.push(`➖ ${diff.removed.length}`);
  }
  return parts.join('  •  ');
};

const describeEntryChanges = (previous: StoredScheduleEntry, current: ScheduleEntry) => {
  const deltas: string[] = [];

  if (previous.time !== current.time) {
    deltas.push(`🕘 ${previous.time || '—'} → ${current.time || '—'}`);
  }
  if ((previous.location || '') !== (current.location || '')) {
    deltas.push(`📍 ${previous.location || '—'} → ${current.location || '—'}`);
  }
  if ((previous.lecturer || '') !== (current.lecturer || '')) {
    deltas.push(`👤 ${previous.lecturer || '—'} → ${current.lecturer || '—'}`);
  }
  if ((previous.date || '') !== (current.date || '')) {
    deltas.push(`📅 ${previous.date || '—'} → ${current.date || '—'}`);
  }

  return deltas.join(' | ');
};

const toScheduleEntry = (entry: StoredScheduleEntry): ScheduleEntry => ({
  title: entry.title,
  time: entry.time,
  location: entry.location,
  lecturer: entry.lecturer,
  date: entry.date,
  start: entry.start
});
