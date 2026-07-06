import type { ExtensionMessage, ExtensionState, MessageResponse, StoredRequest } from "./types";

interface AppOptions {
  mode: "window" | "panel";
}

let state: ExtensionState | undefined;

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

function renderSummary(): void {
  if (!state) return;
  const requests = state.requests;
  const visibleRequests = filteredRequests();
  const errors = requests.filter((request) => request.diagnostic.alerts.some((alert) => alert.severity === "error")).length;
  const warnings = requests.filter((request) => request.diagnostic.alerts.some((alert) => alert.severity === "warn")).length;
  const browser = requests.filter((request) => request.diagnostic.origin === "Browser cache").length;
  const cfHit = requests.filter((request) => request.diagnostic.origin === "Cloudflare HIT").length;
  const worker = requests.filter((request) => request.diagnostic.origin === "Worker cache HIT").length;
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

  const requests = filteredRequests();
  tbody.replaceChildren(...requests.map((request) => rowForRequest(request, options.mode)));
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

  const visibleCells = [
    cell(formatTime(request.timestamp)),
    requestCell(request),
    chipCell(request.diagnostic.origin),
    cell(request.statusCode?.toString() ?? "-"),
    alertCell(request)
  ];

  // DOC-GUARD: Dashboard principal nao exibe headers/evidencias; dados continuam em memoria/export JSON. Regra: docs/requisitos.md.
  if (mode === "panel") {
    visibleCells.splice(4, 0, cell(headerSummary(request)), cell(request.diagnostic.evidence.join(" | ") || "-"));
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
  return state.settings.relevantOnly
    ? state.requests.filter((request) => request.diagnostic.isRelevant)
    : state.requests;
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

function classForOrigin(value: string): string {
  if (value.includes("Tenant")) return "chip-error";
  if (value.includes("D1") || value.includes("MISS")) return "chip-warn";
  if (value.includes("HIT") || value.includes("Browser")) return "chip-ok";
  return "chip-muted";
}
