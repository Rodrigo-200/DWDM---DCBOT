import https from 'node:https';
import { readFileSync } from 'node:fs';

import type { Env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

export const createMetroHttpsAgent = (env: Env): https.Agent => {
  let ca: Buffer | undefined;
  const caPath = env.METRO_CA_CERT_PATH?.trim();

  if (caPath) {
    try {
      ca = readFileSync(caPath);
    } catch (error) {
      throw new Error(
        `Falha ao ler METRO_CA_CERT_PATH (${caPath}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    logger.info('Metro HTTPS agent carregou certificado personalizado', { caPath });
  }

  return new https.Agent({
    rejectUnauthorized: env.METRO_TLS_REJECT_UNAUTHORIZED,
    ca
  });
};
