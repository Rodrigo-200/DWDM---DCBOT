import { readdir } from 'node:fs/promises';
import { join, parse } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Collection } from 'discord.js';

import { logger } from './logger.js';
import type { BotCommand } from '../types.js';

const commandsDir = fileURLToPath(new URL('../commands/', import.meta.url));

const supportedExtensions = ['.js', '.ts'];

export const loadCommands = async (): Promise<BotCommand[]> => {
  const results: BotCommand[] = [];
  const stack = [commandsDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      const { ext } = parse(entryPath);
      if (!supportedExtensions.includes(ext)) {
        continue;
      }

      try {
        const moduleUrl = pathToFileURL(entryPath).href;
        const imported = await import(moduleUrl);
        const command = imported.default as BotCommand | undefined;
        if (!command?.data || !command?.execute) {
          logger.warn('Skipping command without required exports', { entryPath });
          continue;
        }
        results.push(command);
      } catch (error) {
        logger.error('Failed loading command', {
          entryPath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  return results;
};

export const registerToCollection = (commands: BotCommand[]): Collection<string, BotCommand> => {
  const collection = new Collection<string, BotCommand>();
  for (const command of commands) {
    collection.set(command.data.name, command);
  }
  return collection;
};
