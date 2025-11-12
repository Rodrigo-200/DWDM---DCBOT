import axios, { AxiosError, type AxiosInstance } from 'axios';

import type { Env } from '../utils/env.js';

export interface StationRef {
  code?: string;
  designation?: string;
}

export interface StationStop {
  trainNumber?: number | string;
  trainService?: StationRef & { code?: string };
  trainOrigin?: StationRef;
  trainDestination?: StationRef;
  arrivalTime?: string | null;
  departureTime?: string | null;
  platform?: string | number | null;
  delay?: string | number | null;
  occupancy?: string | number | null;
  supression?: string | null;
  ETA?: string | null;
  ETD?: string | null;
}

export interface StationTimetableResponse {
  stationStops?: StationStop[];
}

export interface TrainStop {
  station?: (StationRef & { latitude?: number | string | null; longitude?: number | string | null });
  arrival?: string | null;
  departure?: string | null;
  ETA?: string | null;
  ETD?: string | null;
  platform?: string | number | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  delay?: string | number | null;
}

export interface TrainTimetableResponse {
  trainNumber?: number | string;
  trainService?: StationRef & { code?: string };
  status?: string | null;
  delay?: string | number | null;
  occupancy?: string | number | null;
  lastStationCode?: string | null;
  duration?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  trainStops?: TrainStop[];
}

interface CpClientOptions {
  env: Env;
}

export class CpClient {
  private readonly env: Env;
  private readonly http: AxiosInstance;

  constructor({ env }: CpClientOptions) {
    this.env = env;
    const baseURL = env.CP_API_BASE_URL.replace(/\/?$/, '');
    this.http = axios.create({
      baseURL,
      timeout: 20_000
    });
  }

  async getStationTimetable(stationCode: string, date: string): Promise<StationTimetableResponse> {
    return this.get<StationTimetableResponse>(`/cp/services/travel-api/stations/${stationCode}/timetable/${date}`);
  }

  async getTrainTimetable(trainNumber: string | number, date: string): Promise<TrainTimetableResponse> {
    return this.get<TrainTimetableResponse>(`/cp/services/travel-api/trains/${trainNumber}/timetable/${date}`);
  }

  private async get<T>(path: string): Promise<T> {
    try {
      const { data } = await this.http.get<T>(path, { headers: this.buildHeaders() });
      return data;
    } catch (error) {
      const message = this.extractErrorMessage(error);
      throw new Error(`Falha ao contactar a API da CP: ${message}`);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json'
    };

    if (this.env.CP_X_API_KEY) {
      headers['x-api-key'] = this.env.CP_X_API_KEY;
    }
    if (this.env.CP_CONNECT_ID) {
      headers['x-cp-connect-id'] = this.env.CP_CONNECT_ID;
    }
    if (this.env.CP_CONNECT_SECRET) {
      headers['x-cp-connect-secret'] = this.env.CP_CONNECT_SECRET;
    }

    return headers;
  }

  private extractErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ detail?: unknown }>;
      const status = axiosError.response?.status;
      const detail = axiosError.response?.data?.detail ?? axiosError.message;
      return status ? `${status} ${String(detail)}` : String(detail ?? axiosError.message);
    }
    return error instanceof Error ? error.message : String(error);
  }
}
