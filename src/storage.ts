import { DEFAULT_DOMAIN_ORIGINS, makeMonitorDomain } from "./domains";
import type { ExtensionState, Settings, StoredRequest } from "./types";

const SETTINGS_KEY = "pluzoSettings";
const REQUESTS_KEY = "pluzoRequests";
let requestWriteQueue = Promise.resolve<StoredRequest[]>([]);

const DEFAULT_SETTINGS: Settings = {
  domains: DEFAULT_DOMAIN_ORIGINS.map((origin) => makeMonitorDomain(origin, 0)),
  paused: false,
  relevantOnly: true,
  historyLimit: 500,
  dashboardBounds: {
    width: 560,
    height: 760
  }
};

export async function getSettings(): Promise<Settings> {
  const stored = await getItem<Settings>(SETTINGS_KEY);
  if (!stored) return structuredClone(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    domains: stored.domains ?? DEFAULT_SETTINGS.domains,
    dashboardBounds: {
      ...DEFAULT_SETTINGS.dashboardBounds,
      ...stored.dashboardBounds
    }
  };
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  await setItem(SETTINGS_KEY, settings);
  return settings;
}

export async function updateSettings(mutator: (settings: Settings) => Settings): Promise<Settings> {
  const next = mutator(await getSettings());
  return saveSettings(next);
}

export async function getRequests(): Promise<StoredRequest[]> {
  return (await getItem<StoredRequest[]>(REQUESTS_KEY)) ?? [];
}

export async function saveRequests(requests: StoredRequest[]): Promise<StoredRequest[]> {
  await setItem(REQUESTS_KEY, requests);
  return requests;
}

export async function upsertRequest(request: StoredRequest): Promise<StoredRequest[]> {
  requestWriteQueue = requestWriteQueue
    .catch(() => [])
    .then(async () => {
      const settings = await getSettings();
      const requests = await getRequests();
      const index = requests.findIndex((item) => item.id === request.id || item.requestId === request.requestId);
      const next = index >= 0 ? [...requests] : [request, ...requests];
      if (index >= 0) next[index] = request;
      next.sort((a, b) => b.timestamp - a.timestamp);
      return saveRequests(next.slice(0, settings.historyLimit));
    });
  return requestWriteQueue;
}

export async function clearRequests(): Promise<void> {
  await setItem(REQUESTS_KEY, []);
}

export async function getState(): Promise<ExtensionState> {
  const [settings, requests] = await Promise.all([getSettings(), getRequests()]);
  return { settings, requests };
}

function getItem<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key] as T | undefined));
  });
}

function setItem<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}
