export interface StoredScheduleEntry {
  title: string;
  time: string;
  location: string;
  lecturer: string;
  date?: string;
  start?: string;
}

export interface PersistentState {
  scheduleHash: string;
  scheduleMessageId: string | null;
  scheduleChangeMessageId: string | null;
  announcements: string[];
  scheduleEntries: StoredScheduleEntry[];
  scheduleLastAttemptAt?: string | null;
  scheduleLastSuccessAt?: string | null;
  cpPanelMessageId: string | null;
}

export const defaultState: PersistentState = {
  scheduleHash: '',
  scheduleMessageId: null,
  scheduleChangeMessageId: null,
  announcements: [],
  scheduleEntries: [],
  scheduleLastAttemptAt: null,
  scheduleLastSuccessAt: null,
  cpPanelMessageId: null
};
