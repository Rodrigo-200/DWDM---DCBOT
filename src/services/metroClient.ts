import axios, { AxiosError, type AxiosInstance } from 'axios';

import type { Env } from '../utils/env.js';
import { MetroAuthManager } from './metroAuth.js';
import { createMetroHttpsAgent } from './metroHttpsAgent.js';

export type MetroLine = 'Azul' | 'Amarela' | 'Verde' | 'Vermelha';

export interface MetroStation {
  id: string;
  name: string;
  lines: MetroLine[];
  latitude?: number;
  longitude?: number;
  zone?: string;
  urls: string[];
}

export interface MetroDestination {
  id: string;
  name: string;
  lines: MetroLine[];
}

export interface MetroWaitPrediction {
  trainId: string;
  etaSeconds: number | null;
}

export interface MetroWaitEntry {
  stationId: string;
  platformId: string;
  destinationId: string;
  destinationName: string;
  destinationLines: MetroLine[];
  trains: MetroWaitPrediction[];
  timestamp: Date | null;
  rawTimestamp?: string;
  serviceLeaving?: boolean;
  unitType?: string;
}

type RawStation = {
  stop_id?: string;
  stop_name?: string;
  stop_lat?: string;
  stop_lon?: string;
  stop_url?: string;
  linha?: string;
  zone_id?: string;
};

type RawDestination = {
  id_destino?: string;
  nome_destino?: string;
};

type RawWaitEntry = {
  stop_id?: string;
  cais?: string;
  hora?: string;
  comboio?: string;
  comboio2?: string;
  comboio3?: string;
  tempoChegada1?: string;
  tempoChegada2?: string;
  tempoChegada3?: string;
  destino?: string;
  sairServico?: string;
  UT?: string;
};

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const STATIONS_CACHE_TTL = 1000 * 60 * 60 * 12; // 12h
const DESTINATIONS_CACHE_TTL = 1000 * 60 * 60 * 12; // 12h

const LINE_NAME_LOOKUP: Record<string, MetroLine> = {
  azul: 'Azul',
  'linha azul': 'Azul',
  amarela: 'Amarela',
  'linha amarela': 'Amarela',
  verde: 'Verde',
  'linha verde': 'Verde',
  vermelha: 'Vermelha',
  'linha vermelha': 'Vermelha'
};

const normalizeName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim();

const parseListField = (value?: string | null): string[] => {
  if (!value) {
    return [];
  }
  const trimmed = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!trimmed) {
    return [];
  }
  return trimmed
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

const parseNumber = (value?: string | number | null): number | undefined => {
  if (value == null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseEta = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === '--') {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseTimestamp = (value?: string | null): Date | null => {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );
  return date;
};

const toBoolean = (value?: string | number | null): boolean | undefined => {
  if (value == null) {
    return undefined;
  }
  const normalized = String(value).trim();
  if (!normalized) {
    return undefined;
  }
  return ['1', 'true', 'yes', 'y'].includes(normalized.toLowerCase());
};

interface MetroClientOptions {
  env: Env;
  authManager?: MetroAuthManager;
}

export class MetroClient {
  private readonly env: Env;
  private readonly http: AxiosInstance;
  private readonly authManager: MetroAuthManager;
  private stationsCache: CacheEntry<MetroStation[]> | null = null;
  private destinationsCache: CacheEntry<Map<string, MetroDestination>> | null = null;
  private stationIdIndex = new Map<string, MetroStation>();
  private stationNameIndex = new Map<string, MetroStation>();

  constructor({ env, authManager }: MetroClientOptions) {
  this.env = env;
  const baseURL = env.METRO_API_BASE_URL.replace(/\/$/, '');
  this.authManager = authManager ?? new MetroAuthManager({ env });
  const httpsAgent = createMetroHttpsAgent(env);
    this.http = axios.create({
      baseURL,
      timeout: 15_000,
      httpsAgent
    });
  }

  async listStations(): Promise<MetroStation[]> {
    if (this.stationsCache && this.stationsCache.expiresAt > Date.now()) {
      return this.stationsCache.value;
    }

    const response = await this.get<{ resposta?: RawStation[] }>('infoEstacao/todos');
    const stations = (response.resposta ?? [])
      .map((raw) => this.toStation(raw))
      .filter((station): station is MetroStation => Boolean(station));

    this.stationIdIndex = new Map(stations.map((station) => [station.id, station]));
    this.stationNameIndex = new Map(
      stations.map((station) => [normalizeName(station.name), station])
    );

    this.stationsCache = {
      value: stations,
      expiresAt: Date.now() + STATIONS_CACHE_TTL
    };

    return stations;
  }

  async getStationById(id: string): Promise<MetroStation | undefined> {
    const normalized = id.trim().toUpperCase();
    const cached = this.stationIdIndex.get(normalized);
    if (cached) {
      return cached;
    }
    await this.listStations();
    return this.stationIdIndex.get(normalized);
  }

  async listDestinations(): Promise<Map<string, MetroDestination>> {
    if (this.destinationsCache && this.destinationsCache.expiresAt > Date.now()) {
      return this.destinationsCache.value;
    }

    await this.listStations();
    const response = await this.get<{ resposta?: RawDestination[] }>('infoDestinos/todos');

    const destinations = new Map<string, MetroDestination>();
    for (const raw of response.resposta ?? []) {
      const id = this.toString(raw.id_destino);
      const name = this.toString(raw.nome_destino);
      if (!id || !name) {
        continue;
      }
      const normalizedName = normalizeName(name);
      const station = this.stationNameIndex.get(normalizedName);
      destinations.set(id, {
        id,
        name,
        lines: station?.lines ?? []
      });
    }

    this.destinationsCache = {
      value: destinations,
      expiresAt: Date.now() + DESTINATIONS_CACHE_TTL
    };

    return destinations;
  }

  async getStationWaitTimes(stationId: string): Promise<MetroWaitEntry[]> {
    const response = await this.get<{ resposta?: RawWaitEntry[] }>(
      `tempoEspera/Estacao/${encodeURIComponent(stationId)}`
    );
    const destinations = await this.listDestinations();

    const entries = (response.resposta ?? [])
      .map((row) => this.toWaitEntry(row, destinations))
      .filter((entry): entry is MetroWaitEntry => Boolean(entry));

    entries.sort((a, b) => {
      const aEta = a.trains[0]?.etaSeconds ?? Number.POSITIVE_INFINITY;
      const bEta = b.trains[0]?.etaSeconds ?? Number.POSITIVE_INFINITY;
      return aEta - bEta;
    });

    return entries;
  }

  private toStation(raw: RawStation): MetroStation | null {
    const id = this.toString(raw.stop_id);
    if (!id) {
      return null;
    }
    const name = this.toString(raw.stop_name) || id;

    const lines = parseListField(raw.linha)
      .map((line) => LINE_NAME_LOOKUP[line.toLowerCase()] ?? null)
      .filter((line): line is MetroLine => Boolean(line));

    const urls = parseListField(raw.stop_url);
    const latitude = parseNumber(raw.stop_lat);
    const longitude = parseNumber(raw.stop_lon);
    const zone = this.toString(raw.zone_id);

    return {
      id: id.toUpperCase(),
      name,
      lines,
      latitude,
      longitude,
      zone,
      urls
    };
  }

  private toWaitEntry(
    raw: RawWaitEntry,
    destinations: Map<string, MetroDestination>
  ): MetroWaitEntry | null {
    const stationId = this.toString(raw.stop_id);
    const destinationId = this.toString(raw.destino);
    if (!stationId || !destinationId) {
      return null;
    }

    const destination = destinations.get(destinationId);
    const trains = [
      { trainId: this.toString(raw.comboio), etaSeconds: parseEta(raw.tempoChegada1) },
      { trainId: this.toString(raw.comboio2), etaSeconds: parseEta(raw.tempoChegada2) },
      { trainId: this.toString(raw.comboio3), etaSeconds: parseEta(raw.tempoChegada3) }
    ].filter((prediction) => prediction.trainId || prediction.etaSeconds !== null);

    return {
      stationId,
      platformId: this.toString(raw.cais) || '—',
      destinationId,
      destinationName: destination?.name ?? destinationId,
      destinationLines: destination?.lines ?? [],
      trains,
      timestamp: parseTimestamp(raw.hora),
      rawTimestamp: this.toString(raw.hora),
      serviceLeaving: toBoolean(raw.sairServico),
      unitType: this.toString(raw.UT)
    };
  }

  private toString(value?: string | number | null): string {
    if (value == null) {
      return '';
    }
    return String(value).trim();
  }

  private async get<T>(path: string): Promise<T> {
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

    const request = async (forceRefresh: boolean) => {
      const token = await this.authManager.getAccessToken(forceRefresh);
      return this.http.get<T>(normalizedPath, { headers: this.buildHeaders(token) });
    };

    try {
      const { data } = await request(false);
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        this.authManager.invalidateToken();
        try {
          const { data } = await request(true);
          return data;
        } catch (retryError) {
          throw new Error(`Falha ao contactar a API do Metro: ${this.extractErrorMessage(retryError)}`);
        }
      }
      throw new Error(`Falha ao contactar a API do Metro: ${this.extractErrorMessage(error)}`);
    }
  }

  private buildHeaders(token: string): Record<string, string> {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    };
  }

  private extractErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const status = axiosError.response?.status;
      const detail = axiosError.response?.data?.message ?? axiosError.message;
      return status ? `${status} ${detail}` : detail;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
