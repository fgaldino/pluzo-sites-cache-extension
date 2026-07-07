import {
  domainLabel,
  isUrlMonitored,
  makeMonitorDomain,
  normalizeDomainInput,
  originToMatchPattern
} from "./domains";
import { diagnoseRequest, headersArrayToMap, requestFromHarEntry } from "./diagnostics";
import {
  clearRequests,
  findStoredRequestMatch,
  getRequests,
  getSettings,
  getState,
  saveSettings,
  upsertRequest
} from "./storage";
import type {
  ExtensionMessage,
  HarLikeEntry,
  MessageResponse,
  PerformanceSnapshot,
  Settings,
  StoredRequest
} from "./types";

const CONTENT_SCRIPT_ID = "pluzo-performance-observer";
const DASHBOARD_PATH = "src/dashboard.html";
const partials = new Map<string, Partial<StoredRequest>>();
let dashboardWindowId: number | undefined;

chrome.runtime.onInstalled.addListener(() => {
  void syncContentScripts();
});

chrome.runtime.onStartup.addListener(() => {
  void syncContentScripts();
});

chrome.action.onClicked.addListener(() => {
  void openDashboard();
});

chrome.permissions.onAdded.addListener(() => {
  void syncContentScripts();
});

chrome.permissions.onRemoved.addListener(() => {
  void syncContentScripts();
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (dashboardWindowId === windowId) dashboardWindowId = undefined;
});

chrome.windows.onBoundsChanged.addListener((windowInfo) => {
  if (windowInfo.id !== dashboardWindowId || windowInfo.state !== "normal") return;
  void saveDashboardBounds(windowInfo);
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    void handleBeforeRequest(details);
  },
  { urls: ["http://*/*", "https://*/*"] }
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    void handleHeadersReceived(details);
  },
  { urls: ["http://*/*", "https://*/*"] },
  ["responseHeaders", "extraHeaders"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    void handleCompleted(details);
  },
  { urls: ["http://*/*", "https://*/*"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    partials.delete(details.requestId);
  },
  { urls: ["http://*/*", "https://*/*"] }
);

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then((data) => sendResponse({ ok: true, data } satisfies MessageResponse))
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      } satisfies MessageResponse);
    });
  return true;
});

void syncContentScripts();

async function handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case "GET_STATE":
      return getState();
    case "OPEN_DASHBOARD":
      await openDashboard();
      return getState();
    case "ADD_DOMAIN":
      return addDomain(message.origin);
    case "REMOVE_DOMAIN":
      return removeDomain(message.origin);
    case "CLEAR_REQUESTS":
      await clearRequests();
      await broadcastState();
      return getState();
    case "SET_PAUSED":
      await saveSettings({ ...(await getSettings()), paused: message.paused });
      await broadcastState();
      return getState();
    case "SET_RELEVANT_ONLY":
      await saveSettings({ ...(await getSettings()), relevantOnly: message.relevantOnly });
      await broadcastState();
      return getState();
    case "PERFORMANCE_ENTRIES":
      await handlePerformanceEntries(message.entries, sender.tab?.id);
      return getState();
    case "DEVTOOLS_ENTRY":
      await handleDevtoolsEntry(message.entry);
      return getState();
    case "EXPORT_STATE":
      return getState();
  }
}

async function addDomain(input: string): Promise<Settings> {
  const origin = normalizeDomainInput(input);
  const settings = await getSettings();
  const exists = settings.domains.some((domain) => domain.origin === origin);
  const next = exists
    ? {
        ...settings,
        domains: settings.domains.map((domain) =>
          domain.origin === origin ? { ...domain, enabled: true, label: domainLabel(origin) } : domain
        )
      }
    : {
        ...settings,
        domains: [...settings.domains, makeMonitorDomain(origin)]
      };

  await saveSettings(next);
  await syncContentScripts();
  await broadcastState();
  return next;
}

async function removeDomain(input: string): Promise<Settings> {
  const origin = normalizeDomainInput(input);
  const settings = await getSettings();
  const next = {
    ...settings,
    domains: settings.domains.filter((domain) => domain.origin !== origin)
  };

  await saveSettings(next);
  await syncContentScripts();
  await broadcastState();
  return next;
}

async function handleBeforeRequest(details: chrome.webRequest.WebRequestBodyDetails): Promise<void> {
  const settings = await getSettings();
  if (settings.paused || !isUrlMonitored(details.url, settings.domains)) return;

  partials.set(details.requestId, {
    id: `wr:${details.requestId}`,
    requestId: details.requestId,
    tabId: details.tabId >= 0 ? details.tabId : undefined,
    url: details.url,
    method: details.method,
    type: details.type,
    source: "webRequest",
    timestamp: details.timeStamp,
    responseHeaders: {}
  });
}

async function handleHeadersReceived(details: chrome.webRequest.WebResponseHeadersDetails): Promise<void> {
  const settings = await getSettings();
  if (settings.paused || !isUrlMonitored(details.url, settings.domains)) return;

  const previous = partials.get(details.requestId) ?? {};
  const responseHeaders = headersArrayToMap(details.responseHeaders);
  const request = withDiagnostic({
    id: `wr:${details.requestId}`,
    requestId: details.requestId,
    tabId: details.tabId >= 0 ? details.tabId : undefined,
    url: details.url,
    method: details.method,
    type: details.type,
    statusCode: details.statusCode,
    source: "webRequest",
    timestamp: previous.timestamp ?? details.timeStamp,
    responseHeaders,
    performance: previous.performance
  });

  partials.set(details.requestId, request);
  await saveAndBroadcastRequest(request);
}

async function handleCompleted(details: chrome.webRequest.WebResponseCacheDetails): Promise<void> {
  const settings = await getSettings();
  if (settings.paused || !isUrlMonitored(details.url, settings.domains)) return;

  const previous = partials.get(details.requestId) ?? (await getRequests()).find((request) => request.requestId === details.requestId) ?? {};
  const request = withDiagnostic({
    id: `wr:${details.requestId}`,
    requestId: details.requestId,
    tabId: details.tabId >= 0 ? details.tabId : undefined,
    url: details.url,
    method: details.method,
    type: details.type,
    statusCode: details.statusCode,
    source: "webRequest",
    timestamp: previous.timestamp ?? details.timeStamp,
    completedAt: details.timeStamp,
    durationMs: previous.timestamp ? Math.max(0, details.timeStamp - previous.timestamp) : undefined,
    fromCache: details.fromCache,
    responseHeaders: previous.responseHeaders ?? {},
    performance: previous.performance
  });

  partials.delete(details.requestId);
  await saveAndBroadcastRequest(request);
}

async function handlePerformanceEntries(entries: PerformanceSnapshot[], tabId?: number): Promise<void> {
  const settings = await getSettings();
  if (settings.paused) return;

  for (const entry of entries) {
    if (!isUrlMonitored(entry.url, settings.domains)) continue;
    const requests = await getRequests();
    const recentMatch = requests.find(
      (request) => request.url === entry.url && (!tabId || request.tabId === tabId) && Date.now() - request.timestamp < 30_000
    );
    const request = withDiagnostic({
      ...(recentMatch ?? {
        id: `perf:${tabId ?? "tab"}:${hashString(entry.url)}:${Math.round(entry.startTime)}`,
        tabId,
        url: entry.url,
        method: "GET",
        type: entry.initiatorType || "resource",
        source: "performance",
        timestamp: entry.observedAt,
        responseHeaders: {}
      }),
      performance: entry
    });
    await saveAndBroadcastRequest(request);
  }
}

async function handleDevtoolsEntry(entry: HarLikeEntry): Promise<void> {
  const settings = await getSettings();
  const url = entry.request?.url;
  if (!url || settings.paused || !isUrlMonitored(url, settings.domains)) return;

  const request = requestFromHarEntry(entry, `dt:${hashString(JSON.stringify(entry))}:${Date.now()}`);
  if (!request) return;
  await saveAndBroadcastRequest(request);
}

async function openDashboard(): Promise<void> {
  const existingWindowId = await findExistingDashboardWindow();
  if (existingWindowId !== undefined) {
    dashboardWindowId = existingWindowId;
    await chrome.windows.update(existingWindowId, { focused: true });
    return;
  }

  const settings = await getSettings();
  const windowInfo = await chrome.windows.create({
    type: "popup",
    url: chrome.runtime.getURL(DASHBOARD_PATH),
    focused: true,
    width: settings.dashboardBounds?.width ?? 560,
    height: settings.dashboardBounds?.height ?? 760,
    left: settings.dashboardBounds?.left,
    top: settings.dashboardBounds?.top
  });
  dashboardWindowId = windowInfo.id;
}

async function findExistingDashboardWindow(): Promise<number | undefined> {
  if (dashboardWindowId !== undefined) {
    try {
      await chrome.windows.get(dashboardWindowId);
      return dashboardWindowId;
    } catch {
      dashboardWindowId = undefined;
    }
  }

  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL(DASHBOARD_PATH) });
  return tabs[0]?.windowId;
}

async function saveDashboardBounds(windowInfo: chrome.windows.Window): Promise<void> {
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    dashboardBounds: {
      left: windowInfo.left,
      top: windowInfo.top,
      width: windowInfo.width,
      height: windowInfo.height
    }
  });
}

async function syncContentScripts(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  } catch {
    // Registro pode nao existir ainda.
  }

  const settings = await getSettings();
  const matches = settings.domains.filter((domain) => domain.enabled).map((domain) => originToMatchPattern(domain.origin));
  if (matches.length === 0) return;

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        matches,
        js: ["src/content.js"],
        runAt: "document_idle"
      }
    ]);
  } catch (error) {
    console.warn("Falha ao registrar content script Pluzo", error);
  }
}

function withDiagnostic(request: Omit<StoredRequest, "diagnostic">): StoredRequest {
  return {
    ...request,
    diagnostic: diagnoseRequest(request)
  };
}

async function saveAndBroadcastRequest(request: StoredRequest): Promise<void> {
  const requests = await upsertRequest(request);
  await broadcastRequest(findStoredRequestMatch(requests, request) ?? request);
}

async function broadcastRequest(request: StoredRequest): Promise<void> {
  chrome.runtime.sendMessage({ type: "REQUEST_UPDATED", request }).catch(() => undefined);
  chrome.runtime.sendMessage({ type: "STATE_UPDATED", state: await getState() }).catch(() => undefined);
}

async function broadcastState(): Promise<void> {
  chrome.runtime.sendMessage({ type: "STATE_UPDATED", state: await getState() }).catch(() => undefined);
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
