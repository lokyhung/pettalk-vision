import type { ActivityEvent, ActivitySummary, AppSettings, HomeZone } from "../types";

const EVENTS_KEY = "pettalk.v2.events";
const ZONES_KEY = "pettalk.v2.zones";
const SETTINGS_KEY = "pettalk.v2.settings";
const SUMMARIES_KEY = "pettalk.v2.summaries";

export const DEFAULT_SETTINGS: AppSettings = {
  minActivitySeconds: 4,
  debugMode: false,
  storyMode: false,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadEvents(): ActivityEvent[] {
  return read<ActivityEvent[]>(EVENTS_KEY, []);
}

export function saveEvents(events: ActivityEvent[]) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-200)));
}

export function loadZones(): HomeZone[] {
  return read<HomeZone[]>(ZONES_KEY, []);
}

export function saveZones(zones: HomeZone[]) {
  localStorage.setItem(ZONES_KEY, JSON.stringify(zones));
}

export function loadSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<AppSettings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadSummaries(): ActivitySummary[] {
  return read<ActivitySummary[]>(SUMMARIES_KEY, []);
}

export function saveSummaries(rows: ActivitySummary[]) {
  localStorage.setItem(SUMMARIES_KEY, JSON.stringify(rows.slice(-40)));
}

export function clearActivityHistory() {
  localStorage.removeItem(EVENTS_KEY);
  localStorage.removeItem(SUMMARIES_KEY);
}
