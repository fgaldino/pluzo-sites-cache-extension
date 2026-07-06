import { detectRepeatedNoCacheProblem, exactRequestKey as cacheProblemRequestKey } from "./cache-problems";
import type { ExtensionMessage, ExtensionState, MessageResponse, StoredRequest } from "./types";

interface AppOptions {
  mode: "window" | "panel";
}

type SortKey = "time" | "request" | "origin" | "status" | "duration" | "alerts" | "ai" | "headers" | "evidence";
type SortDirection = "asc" | "desc";

let state: ExtensionState | undefined;
let sortKey: SortKey = "time";
let sortDirection: SortDirection = "desc";
let groupByRequest = false;
const selectedOrigins = new Set<string>();

export function startMonitorApp(options: AppOptions): void {
  document.addEventListener("DOMContentLoaded", () => {
    bindStaticControls(options);
    void loadState(options);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "STATE_UPDATED") {
      state = message.state as ExtensionState;
      render(options);
    }
    if (message?.type === "REQUEST_UPDATED" && state) {
      const request = message.request as StoredRequest;
      state = {
        ...state,
        requests: [request, ...state.requests.filter((item) => item.id !== request.id)]
      };
      render(options);
    }
  });
}

function bindStaticControls(options: AppOptions): void {
  text("appMode", options.mode === "window" ? "Janela destacada" : "Painel DevTools");
  byId<HTMLButtonElement>("openDashboard")?.addEventListener("click", () => send({ type: "OPEN_DASHBOARD" }));
  byId<HTMLButtonElement>("openOptions")?.addEventListener("click", () => chrome.runtime.openOptionsPage());
  byId<HTMLButtonElement>("clearRequests")?.addEventListener("click", () => send({ type: "CLEAR_REQUESTS" }));
  byId<HTMLButtonElement>("exportJson")?.addEventListener("click", exportJson);
  byId<HTMLInputElement>("paused")?.addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLInputElement | null;
    if (target) void send({ type: "SET_PAUSED", paused: target.checked });
  });
  byId<HTMLInputElement>("relevantOnly")?.addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLInputElement | null;
    if (target) void send({ type: "SET_RELEVANT_ONLY", relevantOnly: target.checked });
  });
  byId<HTMLInputElement>("groupByRequest")?.addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLInputElement | null;
    groupByRequest = target?.checked ?? false;
    render(options);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-sort]").forEach((button) => {
    button.dataset.label = button.textContent ?? "";
    button.addEventListener("click", () => {
      const nextSort = button.dataset.sort as SortKey;
      if (sortKey === nextSort) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
      } else {
        sortKey = nextSort;
        sortDirection = defaultDirectionFor(nextSort);
      }
      render(options);
    });
  });
}

async function loadState(options: AppOptions): Promise<void> {
  state = await send<ExtensionState>({ type: "GET_STATE" });
  render(options);
}

function render(options: AppOptions): void {
  if (!state) return;

  text("appMode", options.mode === "window" ? "Janela destacada" : "Painel DevTools");
  const paused = byId<HTMLInputElement>("paused");
  if (paused) paused.checked = state.settings.paused;
  const relevantOnly = byId<HTMLInputElement>("relevantOnly");
  if (relevantOnly) relevantOnly.checked = state.settings.relevantOnly;

  renderDomains();
  renderOriginFilters(options);
  renderSortHeaders();
  renderSummary();
  renderRequests(options);
}

function renderDomains(): void {
  const list = byId("domainList");
  if (!list || !state) return;
  list.replaceChildren(
    ...state.settings.domains.map((domain) => {
      const item = document.createElement("span");
      item.className = `pill ${domain.enabled ? "pill-ok" : "pill-muted"}`;
      item.textContent = domain.label;
      return item;
    })
  );
}

function renderOriginFilters(options: AppOptions): void {
  const container = byId("originFilters");
  if (!container || !state) return;

  const origins = distinctOrigins(state.requests);
  if (origins.length === 0) {
    container.replaceChildren();
    return;
  }

  const label = document.createElement("span");
  label.className = "muted filter-label";
  label.textContent = "Origem:";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `filter-chip ${selectedOrigins.size === 0 ? "filter-chip-active" : ""}`;
  allButton.textContent = "Todas";
  allButton.addEventListener("click", () => {
    selectedOrigins.clear();
    render(options);
  });

  const buttons = origins.map((origin) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip ${selectedOrigins.size === 0 || selectedOrigins.has(origin) ? "filter-chip-active" : ""}`;
    button.textContent = origin;
    button.addEventListener("click", () => {
      if (selectedOrigins.size === 0) {
        selectedOrigins.add(origin);
      } else if (selectedOrigins.has(origin)) {
        selectedOrigins.delete(origin);
      } else {
        selectedOrigins.add(origin);
      }
      render(options);
    });
    return button;
  });

  container.replaceChildren(label, allButton, ...buttons);
}

function renderSortHeaders(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-sort]").forEach((button) => {
    const key = button.dataset.sort as SortKey;
    const label = button.dataset.label ?? button.textContent ?? "";
    button.textContent = key === sortKey ? `${label} ${sortDirection === "asc" ? "↑" : "↓"}` : label;
    button.setAttribute("aria-pressed", key === sortKey ? "true" : "false");
  });
}

function renderSummary(): void {
  if (!state) return;
  const requests = state.requests;
  const visibleRequests = filteredRequests();
  const errors = requests.filter((request) => request.diagnostic.alerts.some((alert) => alert.severity === "error")).length;
  const warnings = requests.filter((request) => request.diagnostic.alerts.some((alert) => alert.severity === "warn")).length;
  const browser = requests.filter((request) => request.diagnostic.origin === "Browser cache").length;
  const cfHit = requests.filter((request) =>
    ["Cloudflare HIT", "Cloudflare + Worker HIT"].includes(request.diagnostic.origin)
  ).length;
  const worker = requests.filter((request) =>
    ["Worker cache HIT", "Cloudflare + Worker HIT"].includes(request.diagnostic.origin)
  ).length;
  const slow = requests.filter((request) => ["D1 master usado", "Tenant REST usado"].includes(request.diagnostic.origin)).length;

  const metrics = [
    ["Total", requests.length.toString()],
    ["Visiveis", visibleRequests.length.toString()],
    ["Browser", browser.toString()],
    ["CF HIT", cfHit.toString()],
    ["Worker HIT", worker.toString()],
    ["D1/REST", slow.toString()],
    ["Alertas", (errors + warnings).toString()]
  ];

  const summary = byId("summary");
  if (!summary) return;
  summary.replaceChildren(
    ...metrics.map(([label, value]) => {
      const card = document.createElement("div");
      card.className = "metric";
      const number = document.createElement("strong");
      number.textContent = value;
      const caption = document.createElement("span");
      caption.textContent = label;
      card.append(number, caption);
      return card;
    })
  );
}

function renderRequests(options: AppOptions): void {
  const tbody = byId<HTMLTableSectionElement>("requestRows");
  const empty = byId("emptyState");
  if (!tbody || !state) return;

  const requests = sortedRequests(filteredRequests());
  const rows = groupByRequest ? groupedRows(requests, options.mode) : requests.map((request) => rowForRequest(request, options.mode));
  tbody.replaceChildren(...rows);
  if (empty) empty.hidden = requests.length > 0;
}

function rowForRequest(request: StoredRequest, mode: AppOptions["mode"]): HTMLTableRowElement {
  const row = document.createElement("tr");
  const severe = request.diagnostic.alerts.find((alert) => alert.severity === "error")
    ? "row-error"
    : request.diagnostic.alerts.find((alert) => alert.severity === "warn")
      ? "row-warn"
      : "";
  row.className = severe;
  const problem = state ? detectRepeatedNoCacheProblem(request, state.requests) : undefined;

  const visibleCells = [
    cell(formatTime(request.timestamp)),
    requestCell(request),
    chipCell(request.diagnostic.origin),
    cell(request.statusCode?.toString() ?? "-"),
    cell(formatDuration(request.durationMs ?? request.performance?.durationMs)),
    alertCell(request),
    promptCell(problem?.prompt)
  ];

  // DOC-GUARD: Dashboard principal nao exibe headers/evidencias; dados continuam em memoria/export JSON. Regra: docs/requisitos.md.
  if (mode === "panel") {
    visibleCells.splice(5, 0, cell(headerSummary(request)), cell(request.diagnostic.evidence.join(" | ") || "-"));
  }

  row.append(...visibleCells);
  return row;
}

function requestCell(request: StoredRequest): HTMLTableCellElement {
  const td = document.createElement("td");
  const url = new URL(request.url);
  const title = document.createElement("strong");
  title.textContent = `${url.pathname}${url.search}` || "/";
  const meta = document.createElement("span");
  meta.className = "muted block";
  meta.textContent = `${url.host} · ${request.method} · ${request.type}`;
  td.append(title, meta);
  return td;
}

function chipCell(value: string): HTMLTableCellElement {
  const td = document.createElement("td");
  const chip = document.createElement("span");
  chip.className = `chip ${classForOrigin(value)}`;
  chip.textContent = value;
  td.append(chip);
  return td;
}

function alertCell(request: StoredRequest): HTMLTableCellElement {
  const td = document.createElement("td");
  if (request.diagnostic.alerts.length === 0) {
    td.textContent = "-";
    return td;
  }
  const list = document.createElement("div");
  list.className = "alerts";
  for (const alert of request.diagnostic.alerts) {
    const item = document.createElement("span");
    item.className = `alert alert-${alert.severity}`;
    item.textContent = alert.message;
    list.append(item);
  }
  td.append(list);
  return td;
}

function promptCell(prompt: string | undefined): HTMLTableCellElement {
  const td = document.createElement("td");
  if (!prompt) {
    td.textContent = "-";
    return td;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-btn";
  button.textContent = "Copiar prompt";
  button.title = "Copiar prompt para IA diagnosticar o problema de cache";
  button.addEventListener("click", () => void copyPrompt(prompt, button));
  td.append(button);
  return td;
}

function headerSummary(request: StoredRequest): string {
  const headers = request.responseHeaders;
  const maxAge = request.diagnostic.cacheControl["max-age"] ?? "-";
  const sMaxAge = request.diagnostic.cacheControl["s-maxage"] ?? "-";
  return [
    `cf=${headers["cf-cache-status"] ?? "-"}`,
    `x=${headers["x-cache"] ?? "-"}`,
    `max=${maxAge}`,
    `smax=${sMaxAge}`,
    `tenant=${request.diagnostic.ssr.tenantRestCount ?? "-"}`,
    `d1=${request.diagnostic.ssr.masterD1 ?? "-"}`
  ].join(" · ");
}

function filteredRequests(): StoredRequest[] {
  if (!state) return [];
  return state.requests.filter((request) => {
    if (state?.settings.relevantOnly && !request.diagnostic.isRelevant) return false;
    if (selectedOrigins.size > 0 && !selectedOrigins.has(request.diagnostic.origin)) return false;
    return true;
  });
}

function sortedRequests(requests: StoredRequest[]): StoredRequest[] {
  return [...requests].sort((a, b) => {
    const result = compareValues(sortValue(a, sortKey), sortValue(b, sortKey));
    return sortDirection === "asc" ? result : -result;
  });
}

function groupedRows(requests: StoredRequest[], mode: AppOptions["mode"]): HTMLTableRowElement[] {
  const groups = new Map<string, StoredRequest[]>();
  for (const request of requests) {
    const key = cacheProblemRequestKey(request);
    groups.set(key, [...(groups.get(key) ?? []), request]);
  }

  return [...groups.entries()].flatMap(([key, items]) => [groupRow(key, items, mode), ...items.map((item) => rowForRequest(item, mode))]);
}

function groupRow(key: string, requests: StoredRequest[], mode: AppOptions["mode"]): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.className = "group-row";
  const columns = mode === "panel" ? 9 : 7;
  const cellElement = document.createElement("td");
  cellElement.colSpan = columns - 1;

  const latest = requests.reduce((current, request) => (request.timestamp > current.timestamp ? request : current), requests[0]);
  const maxDuration = Math.max(...requests.map((request) => request.durationMs ?? request.performance?.durationMs ?? 0));
  const errors = requests.filter((request) => request.diagnostic.alerts.some((alert) => alert.severity === "error")).length;
  const warnings = requests.filter((request) => request.diagnostic.alerts.some((alert) => alert.severity === "warn")).length;
  cellElement.textContent = `${key} · ${requests.length}x · ultima ${formatTime(latest.timestamp)} · max ${formatDuration(maxDuration)} · alertas ${errors + warnings}`;
  const problem = requests.map((request) => (state ? detectRepeatedNoCacheProblem(request, state.requests) : undefined)).find(Boolean);
  row.append(cellElement, promptCell(problem?.prompt));
  return row;
}

function sortValue(request: StoredRequest, key: SortKey): string | number {
  switch (key) {
    case "time":
      return request.timestamp;
    case "request":
      return cacheProblemRequestKey(request);
    case "origin":
      return request.diagnostic.origin;
    case "status":
      return request.statusCode ?? 0;
    case "duration":
      return request.durationMs ?? request.performance?.durationMs ?? 0;
    case "alerts":
      return request.diagnostic.alerts.length;
    case "ai":
      return state && detectRepeatedNoCacheProblem(request, state.requests) ? 1 : 0;
    case "headers":
      return headerSummary(request);
    case "evidence":
      return request.diagnostic.evidence.join(" | ");
  }
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
}

function distinctOrigins(requests: StoredRequest[]): string[] {
  return [...new Set(requests.map((request) => request.diagnostic.origin))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

function defaultDirectionFor(key: SortKey): SortDirection {
  return ["time", "status", "duration", "alerts", "ai"].includes(key) ? "desc" : "asc";
}

function exportJson(): void {
  if (!state) return;
  const payload = {
    exportedAt: new Date().toISOString(),
    monitoredDomains: state.settings.domains.map((domain) => domain.origin),
    requests: state.requests,
    summary: {
      total: state.requests.length,
      relevant: state.requests.filter((request) => request.diagnostic.isRelevant).length
    }
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pluzo-cache-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function cell(value: string): HTMLTableCellElement {
  const td = document.createElement("td");
  td.textContent = value;
  return td;
}

async function send<T = unknown>(message: ExtensionMessage): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as MessageResponse<T> | undefined;
  if (!response?.ok) throw new Error(response?.error ?? "Mensagem falhou.");
  return response.data as T;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function text(id: string, value: string): void {
  const element = byId(id);
  if (element) element.textContent = value;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

function formatDuration(durationMs: number | undefined): string {
  if (!Number.isFinite(durationMs)) return "-";
  if ((durationMs ?? 0) < 1000) return `${Math.round(durationMs ?? 0)}ms`;
  return `${((durationMs ?? 0) / 1000).toFixed(2)}s`;
}

async function copyPrompt(prompt: string, button: HTMLButtonElement): Promise<void> {
  await writeClipboard(prompt);
  const previous = button.textContent;
  button.textContent = "Copiado";
  window.setTimeout(() => {
    button.textContent = previous;
  }, 1400);
}

async function writeClipboard(textValue: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(textValue);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = textValue;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function classForOrigin(value: string): string {
  if (value.includes("Tenant")) return "chip-error";
  if (value.includes("D1") || value.includes("MISS")) return "chip-warn";
  if (value.includes("HIT") || value.includes("Browser")) return "chip-ok";
  return "chip-muted";
}
