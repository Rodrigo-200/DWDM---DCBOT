import axios, { AxiosError } from 'axios';

import type { Env } from '../utils/env.js';
import { createMetroHttpsAgent } from './metroHttpsAgent.js';

interface MetroAuthManagerOptions {
  env: Env;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  token_type?: string;
}

export class MetroAuthManager {
  private readonly env: Env;
  private readonly httpsAgent: ReturnType<typeof createMetroHttpsAgent>;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private refreshing: Promise<string> | null = null;

  constructor({ env }: MetroAuthManagerOptions) {
  this.env = env;
  this.httpsAgent = createMetroHttpsAgent(env);
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    if (!this.refreshing) {
      this.refreshing = this.fetchToken().finally(() => {
        this.refreshing = null;
      });
    }

    return this.refreshing;
  }

  invalidateToken(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  private async fetchToken(): Promise<string> {
    try {
      const basic = Buffer.from(`${this.env.METRO_CLIENT_ID}:${this.env.METRO_CLIENT_SECRET}`, 'utf8').toString('base64');
      const body = new URLSearchParams({ grant_type: 'client_credentials' });
      const { data } = await axios.post<TokenResponse>(
        this.env.METRO_TOKEN_URL,
        body.toString(),
        {
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          httpsAgent: this.httpsAgent,
          timeout: 15_000
        }
      );

      const token = data.access_token;
      if (!token) {
        throw new Error('Resposta sem access_token');
      }

      const expiresIn = Number(data.expires_in) || 3600;
      const now = Date.now();
      this.cachedToken = token;
      this.tokenExpiresAt = now + Math.max(expiresIn - 60, 30) * 1000;

      return token;
    } catch (error) {
      throw new Error(`Falha ao obter token do Metro: ${this.extractErrorMessage(error)}`);
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error_description?: string; message?: string }>;
      const status = axiosError.response?.status;
      const detail = axiosError.response?.data?.error_description ?? axiosError.response?.data?.message ?? axiosError.message;
      return status ? `${status} ${detail}` : detail;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
