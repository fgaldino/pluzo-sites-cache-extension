import type {
  CacheControlDirectives,
  CacheOrigin,
  DiagnosticAlert,
  DiagnosticResult,
  HarLikeEntry,
  HeaderMap,
  PerformanceSnapshot,
  ServerTimingMetric,
  SsrDiagnostic,
  StoredRequest
} from "./types";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token"
]);

const CACHEABLE_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/imoveis(?:\/)?$/,
  /^\/imovel\/[^/?#]+/,
  /^\/api\/(?:filtros|filtro-opcoes|bairros)(?:\?|$|\/)/,
  /^\/sitemap\.xml$/,
  /^\/portais\/[^/?#]+\.xml$/
];

export function headersArrayToMap(
  headers: chrome.webRequest.HttpHeader[] | Array<{ name: string; value?: string }> | undefined
): HeaderMap {
  const map: HeaderMap = {};
  for (const header of headers ?? []) {
    const name = header.name.toLowerCase();
    if (SENSITIVE_HEADERS.has(name)) continue;
    const value = "value" in header && typeof header.value === "string" ? header.value : "";
    map[name] = value;
  }
  return map;
}

export function sanitizeHeaders(headers: HeaderMap): HeaderMap {
  const clean: HeaderMap = {};
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (!SENSITIVE_HEADERS.has(key)) {
      clean[key] = value;
    }
  }
  return clean;
}

export function parseCacheControl(value: string | undefined): CacheControlDirectives {
  const directives: CacheControlDirectives = {};
  if (!value) return directives;

  for (const part of value.split(",")) {
    const [rawName, rawValue] = part.trim().split("=", 2);
    const name = rawName?.trim().toLowerCase();
    if (!name) continue;
    directives[name] = rawValue === undefined ? true : rawValue.trim().replace(/^"|"$/g, "");
  }

  return directives;
}

export function parseSsrDiagnostic(value: string | undefined): SsrDiagnostic {
  const ssr: SsrDiagnostic = {};
  if (!value) return ssr;

  ssr.raw = value;
  ssr.tenantRestCount = numberFrom(value, /tenantRestCount\s*[:=]\s*(\d+)/i);
  ssr.masterD1 = numberFrom(value, /masterD1\s*[:=]\s*(\d+)/i);
  ssr.metadataMemoryHit = booleanFrom(value, /metadataMemoryHit\s*[:=]\s*(true|false|1|0)/i);
  ssr.publicReadModelHit = booleanFrom(value, /publicReadModelHit\s*[:=]\s*(true|false|1|0)/i);
  ssr.subrequests = textFrom(value, /subrequests\s*[:=]\s*([^;,\s]+)/i);
  return ssr;
}

export function parseServerTiming(value: string | undefined): ServerTimingMetric[] {
  if (!value) return [];

  return value
    .split(",")
    .map((metric) => {
      const [rawName, ...rawParts] = metric.trim().split(";");
      const name = rawName?.trim();
      if (!name) return undefined;

      const parsed: ServerTimingMetric = { name };
      for (const part of rawParts) {
        const [key, rawValue] = part.trim().split("=", 2);
        const valuePart = rawValue?.trim().replace(/^"|"$/g, "");
        if (key === "dur" && valuePart) {
          const durationMs = Number(valuePart);
          if (Number.isFinite(durationMs)) parsed.durationMs = durationMs;
        }
        if (key === "desc" && valuePart) parsed.description = valuePart;
      }
      return parsed;
    })
    .filter((metric): metric is ServerTimingMetric => Boolean(metric));
}

export function isRelevantUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return CACHEABLE_ROUTE_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
  } catch {
    return false;
  }
}

export function diagnoseRequest(input: {
  url: string;
  type: string;
  statusCode?: number;
  responseHeaders: HeaderMap;
  fromCache?: boolean;
  performance?: PerformanceSnapshot;
}): DiagnosticResult {
  const headers = sanitizeHeaders(input.responseHeaders);
  const cacheControl = parseCacheControl(headers["cache-control"]);
  const ssr = parseSsrDiagnostic(headers["x-pluzo-ssr-diag"]);
  const serverTiming = parseServerTiming(headers["server-timing"]);
  const isRelevant = isRelevantUrl(input.url);
  const evidence: string[] = [];
  const alerts: DiagnosticAlert[] = [];

  const cfCacheStatus = headers["cf-cache-status"]?.toUpperCase();
  const xCache = headers["x-cache"]?.toUpperCase();
  const transferSize = input.performance?.transferSize;

  if (input.fromCache) evidence.push("webRequest indicou fromCache=true");
  if (transferSize === 0) evidence.push("Performance API indicou transferSize=0");
  if (cfCacheStatus) evidence.push(`cf-cache-status=${cfCacheStatus}`);
  if (headers["age"]) evidence.push(`age=${headers["age"]}`);
  if (xCache) evidence.push(`x-cache=${xCache}`);
  if (headers["x-cache-ttl"]) evidence.push(`x-cache-ttl=${headers["x-cache-ttl"]}`);
  if (ssr.tenantRestCount !== undefined) evidence.push(`tenantRestCount=${ssr.tenantRestCount}`);
  if (ssr.masterD1 !== undefined) evidence.push(`masterD1=${ssr.masterD1}`);
  if (ssr.subrequests) evidence.push(`subrequests=${ssr.subrequests}`);

  const origin = classifyOrigin({ cfCacheStatus, xCache, ssr, input });
  alerts.push(...policyAlerts({ cacheControl, cfCacheStatus, headers, isRelevant, ssr, xCache }));

  if (origin === "Indeterminado") {
    alerts.push({ severity: "info", message: "Sem headers suficientes para cravar origem." });
  }

  if (cfCacheStatus === "HIT" && xCache === "HIT" && ssr.tenantRestCount === 0) {
    alerts.push({ severity: "ok", message: "Caminho quente OK: Cloudflare/Worker HIT sem tenant REST." });
  }

  return { origin, isRelevant, cacheControl, ssr, serverTiming, evidence, alerts };
}

export function requestFromHarEntry(entry: HarLikeEntry, id: string): StoredRequest | undefined {
  const url = entry.request?.url;
  if (!url) return undefined;

  const responseHeaders = headersArrayToMap(entry.response?.headers);
  const timestamp = entry.startedDateTime ? Date.parse(entry.startedDateTime) : Date.now();
  const request: Omit<StoredRequest, "diagnostic"> = {
    id,
    url,
    method: entry.request?.method ?? "GET",
    type: entry.response?.content?.mimeType ?? "devtools",
    statusCode: entry.response?.status,
    source: "devtools",
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    durationMs: entry.time,
    responseHeaders
  };

  return {
    ...request,
    diagnostic: diagnoseRequest(request)
  };
}

function classifyOrigin(args: {
  cfCacheStatus?: string;
  xCache?: string;
  ssr: SsrDiagnostic;
  input: { fromCache?: boolean; responseHeaders: HeaderMap; performance?: PerformanceSnapshot };
}): CacheOrigin {
  const hasServerHeaders = Object.keys(args.input.responseHeaders).length > 0;
  if ((args.input.fromCache || args.input.performance?.transferSize === 0) && !hasServerHeaders) {
    return "Browser cache";
  }
  if (args.cfCacheStatus === "HIT" && args.xCache === "HIT") return "Cloudflare + Worker HIT";
  if (args.xCache === "HIT") return "Worker cache HIT";
  if (args.cfCacheStatus === "HIT") return "Cloudflare HIT";
  if (args.ssr.tenantRestCount !== undefined && args.ssr.tenantRestCount > 0) {
    return "Tenant REST usado";
  }
  if (args.ssr.masterD1 !== undefined && args.ssr.masterD1 > 0) {
    return "D1 master usado";
  }
  if (["MISS", "BYPASS", "DYNAMIC", "EXPIRED", "REVALIDATED"].includes(args.cfCacheStatus ?? "")) {
    return "MISS gerado";
  }
  if (args.xCache && args.xCache !== "HIT") return "MISS gerado";
  if (args.input.fromCache || args.input.performance?.transferSize === 0) return "Browser cache";
  return "Indeterminado";
}

function policyAlerts(args: {
  cacheControl: CacheControlDirectives;
  cfCacheStatus?: string;
  headers: HeaderMap;
  isRelevant: boolean;
  ssr: SsrDiagnostic;
  xCache?: string;
}): DiagnosticAlert[] {
  const alerts: DiagnosticAlert[] = [];
  if (!args.isRelevant) return alerts;

  if (args.cacheControl["max-age"] !== "60") {
    alerts.push({ severity: "warn", message: "Rota cacheavel sem max-age=60." });
  }
  if (args.cacheControl["s-maxage"] !== "2592000") {
    alerts.push({ severity: "warn", message: "Rota cacheavel sem s-maxage=2592000." });
  }
  if (args.ssr.tenantRestCount !== undefined && args.ssr.tenantRestCount > 0) {
    alerts.push({ severity: "error", message: "tenantRestCount>0: houve fallback tenant REST." });
  }
  if (!args.headers["x-cache"]) {
    alerts.push({ severity: "warn", message: "Rota cacheavel sem header x-cache." });
  }
  if (["BYPASS", "DYNAMIC", "MISS"].includes(args.cfCacheStatus ?? "")) {
    alerts.push({ severity: "warn", message: `Cloudflare ${args.cfCacheStatus}: rota esperada quente nao veio HIT.` });
  }
  if (args.xCache && args.xCache !== "HIT") {
    alerts.push({ severity: "warn", message: `Worker cache ${args.xCache}: rota nao veio HIT.` });
  }

  return alerts;
}

function numberFrom(value: string, pattern: RegExp): number | undefined {
  const match = value.match(pattern);
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanFrom(value: string, pattern: RegExp): boolean | undefined {
  const match = value.match(pattern);
  if (!match?.[1]) return undefined;
  return match[1] === "true" || match[1] === "1";
}

function textFrom(value: string, pattern: RegExp): string | undefined {
  return value.match(pattern)?.[1];
}
