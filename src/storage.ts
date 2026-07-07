import { DEFAULT_DOMAIN_ORIGINS, makeMonitorDomain } from "./domains";
import { diagnoseRequest } from "./diagnostics";
import type { ExtensionState, Settings, StoredRequest } from "./types";

const SETTINGS_KEY = "pluzoSettings";
const REQUESTS_KEY = "pluzoRequests";
const DUPLICATE_CAPTURE_WINDOW_MS = 2_000;
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
      const index = requests.findIndex((item) => isSameCapturedRequest(item, request));
      const next = index >= 0 ? [...requests] : [request, ...requests];
      if (index >= 0) next[index] = mergeCapturedRequest(next[index], request);
      next.sort((a, b) => b.timestamp - a.timestamp);
      return saveRequests(next.slice(0, settings.historyLimit));
    });
  return requestWriteQueue;
}

export function findStoredRequestMatch(requests: StoredRequest[], request: StoredRequest): StoredRequest | undefined {
  return requests.find((item) => isSameCapturedRequest(item, request));
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

function isSameCapturedRequest(left: StoredRequest, right: StoredRequest): boolean {
  if (left.id === right.id) return true;
  if (left.requestId && right.requestId) return left.requestId === right.requestId;
  if (left.method.toUpperCase() !== right.method.toUpperCase()) return false;
  if (left.url !== right.url) return false;
  if (left.tabId !== undefined && right.tabId !== undefined && left.tabId !== right.tabId) return false;

  const leftResponseId = left.diagnostic.pluzoCache.responseId;
  const rightResponseId = right.diagnostic.pluzoCache.responseId;
  if (leftResponseId && rightResponseId && leftResponseId === rightResponseId) return true;

  // REGRESSION-GUARD: mesma request capturada por webRequest/Performance/DevTools vira uma linha; requests webRequest distintos nao colapsam.
  // Alterar somente com pedido/autorizacao explicita de Fernando.
  if (left.requestId && right.requestId && left.requestId !== right.requestId) return false;
  return Math.abs(left.timestamp - right.timestamp) <= DUPLICATE_CAPTURE_WINDOW_MS;
}

function mergeCapturedRequest(existing: StoredRequest, incoming: StoredRequest): StoredRequest {
  const preferred = sourceRank(incoming.source) >= sourceRank(existing.source) ? incoming : existing;
  const fallback = preferred === incoming ? existing : incoming;
  const requestId = existing.requestId ?? incoming.requestId;
  const responseHeaders = chooseHeaders(existing, incoming);
  const merged: Omit<StoredRequest, "diagnostic"> = {
    ...fallback,
    ...preferred,
    id: requestId ? `wr:${requestId}` : preferred.id,
    requestId,
    tabId: preferred.tabId ?? fallback.tabId,
    timestamp: Math.min(existing.timestamp, incoming.timestamp),
    completedAt: maxNumber(existing.completedAt, incoming.completedAt),
    durationMs: preferred.durationMs ?? fallback.durationMs,
    fromCache: preferred.fromCache ?? fallback.fromCache,
    responseHeaders,
    performance: preferred.performance ?? fallback.performance,
  };
  return { ...merged, diagnostic: diagnoseRequest(merged) };
}

function sourceRank(source: StoredRequest["source"]): number {
  if (source === "webRequest") return 3;
  if (source === "devtools") return 2;
  return 1;
}

function chooseHeaders(left: StoredRequest, right: StoredRequest): StoredRequest["responseHeaders"] {
  const leftScore = headerScore(left.responseHeaders);
  const rightScore = headerScore(right.responseHeaders);
  return rightScore > leftScore ? right.responseHeaders : left.responseHeaders;
}

function headerScore(headers: StoredRequest["responseHeaders"]): number {
  let score = Object.keys(headers).length;
  if (headers["x-pluzo-cache-status"]) score += 20;
  if (headers["x-pluzo-ssr-diag"]) score += 20;
  if (headers["cf-cache-status"]) score += 10;
  if (headers["x-cache"]) score += 10;
  return score;
}

function maxNumber(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.max(left, right);
}
