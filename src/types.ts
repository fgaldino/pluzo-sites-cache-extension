export type CacheOrigin =
  | "Browser cache"
  | "Cloudflare + Worker HIT"
  | "Cloudflare HIT"
  | "Worker cache HIT"
  | "Read-model publico"
  | "MISS gerado"
  | "D1 master usado"
  | "Tenant REST usado"
  | "Indeterminado";

export type AlertSeverity = "ok" | "info" | "warn" | "error";

export type HeaderMap = Record<string, string>;

export interface MonitorDomain {
  id: string;
  origin: string;
  label: string;
  enabled: boolean;
  createdAt: number;
}

export interface DashboardBounds {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

export interface Settings {
  domains: MonitorDomain[];
  paused: boolean;
  relevantOnly: boolean;
  historyLimit: number;
  dashboardBounds?: DashboardBounds;
}

export interface CacheControlDirectives {
  [directive: string]: string | true;
}

export interface SsrDiagnostic {
  tenantRestCount?: number;
  masterD1?: number;
  metadataMemoryHit?: boolean;
  publicReadModelHit?: boolean;
  subrequests?: string;
  raw?: string;
}

export interface PluzoCacheDiagnostic {
  status?: "hit" | "miss" | "bypass";
  route?: string;
  reason?: string;
  dataSource?: "worker-cache" | "public-read-model" | "tenant-rest" | "preview" | "none" | string;
  normalizedPath?: string;
  diagAt?: string;
  responseId?: string;
  responseGeneratedAt?: string;
  currentDataAccess?: DataAccessDiagnostic;
  generatedDataAccess?: DataAccessDiagnostic;
}

export interface DataAccessDiagnostic {
  masterD1?: number;
  tenantRest?: number;
  raw?: string;
}

export interface ServerTimingMetric {
  name: string;
  durationMs?: number;
  description?: string;
}

export interface PerformanceSnapshot {
  url: string;
  initiatorType: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  durationMs: number;
  startTime: number;
  observedAt: number;
}

export interface DiagnosticAlert {
  severity: AlertSeverity;
  message: string;
}

export interface DiagnosticResult {
  origin: CacheOrigin;
  isRelevant: boolean;
  browserCacheReplay: boolean;
  currentDataAccess?: DataAccessDiagnostic;
  generatedDataAccess?: DataAccessDiagnostic;
  cacheControl: CacheControlDirectives;
  ssr: SsrDiagnostic;
  pluzoCache: PluzoCacheDiagnostic;
  serverTiming: ServerTimingMetric[];
  evidence: string[];
  alerts: DiagnosticAlert[];
}

export interface StoredRequest {
  id: string;
  requestId?: string;
  tabId?: number;
  url: string;
  method: string;
  type: string;
  statusCode?: number;
  source: "webRequest" | "performance" | "devtools";
  timestamp: number;
  completedAt?: number;
  durationMs?: number;
  fromCache?: boolean;
  responseHeaders: HeaderMap;
  performance?: PerformanceSnapshot;
  diagnostic: DiagnosticResult;
}

export interface ExtensionState {
  settings: Settings;
  requests: StoredRequest[];
}

export interface HarLikeEntry {
  startedDateTime?: string;
  time?: number;
  request?: {
    method?: string;
    url?: string;
  };
  response?: {
    status?: number;
    headers?: Array<{ name: string; value: string }>;
    content?: {
      mimeType?: string;
    };
  };
}

export type ExtensionMessage =
  | { type: "GET_STATE" }
  | { type: "OPEN_DASHBOARD" }
  | { type: "ADD_DOMAIN"; origin: string }
  | { type: "REMOVE_DOMAIN"; origin: string }
  | { type: "CLEAR_REQUESTS" }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "SET_RELEVANT_ONLY"; relevantOnly: boolean }
  | { type: "PERFORMANCE_ENTRIES"; entries: PerformanceSnapshot[] }
  | { type: "DEVTOOLS_ENTRY"; entry: HarLikeEntry }
  | { type: "EXPORT_STATE" };

export interface MessageResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
