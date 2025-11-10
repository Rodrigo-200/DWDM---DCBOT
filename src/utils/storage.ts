import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { logger } from './logger.js';

export class JsonStorage<T> {
  constructor(private readonly filePath: string, private readonly fallback: T) {}

  async read(): Promise<T> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as T;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        logger.info('Storage file not found, using default state', { file: this.filePath });
      } else {
        logger.warn('Failed reading storage, using default state', {
          file: this.filePath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      return this.fallback;
    }
  }

  async write(data: T): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }
}
