import { formatDataAccess } from "./diagnostics";
import type { StoredRequest } from "./types";

const REPEATED_NO_CACHE_WINDOW_MS = 5 * 60 * 1000;

export interface CacheProblem {
  key: string;
  occurrences: StoredRequest[];
  prompt: string;
}

export function detectRepeatedNoCacheProblem(
  request: StoredRequest,
  allRequests: StoredRequest[]
): CacheProblem | undefined {
  if (!isNoCacheCandidate(request)) return undefined;

  const key = exactRequestKey(request);
  const occurrences = allRequests
    .filter((candidate) => {
      return (
        Math.abs(candidate.timestamp - request.timestamp) <= REPEATED_NO_CACHE_WINDOW_MS &&
        exactRequestKey(candidate) === key &&
        isNoCacheCandidate(candidate)
      );
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  // REGRESSION-GUARD: Mostra prompt IA quando mesma URL exata aparece 2+ vezes em 5 min sem cache.
  // Alterar somente com pedido/autorizacao explicita de Fernando.
  if (occurrences.length < 2) return undefined;

  return {
    key,
    occurrences,
    prompt: buildCacheProblemPrompt(key, occurrences)
  };
}

export function exactRequestKey(request: StoredRequest): string {
  // REGRESSION-GUARD: Agrupamento/detector de request usa URL exata escolhida por Fernando, incluindo query string.
  // Alterar somente com pedido/autorizacao explicita de Fernando.
  return `${request.method.toUpperCase()} ${request.url}`;
}

function isNoCacheCandidate(request: StoredRequest): boolean {
  if (!request.diagnostic.isRelevant) return false;
  if (request.method.toUpperCase() !== "GET") return false;
  if (!request.statusCode || request.statusCode >= 500) return false;
  if (isCacheHit(request)) return false;
  return request.source !== "performance" || Object.keys(request.responseHeaders).length > 0;
}

function isCacheHit(request: StoredRequest): boolean {
  const cf = request.responseHeaders["cf-cache-status"]?.toUpperCase();
  const worker = request.responseHeaders["x-cache"]?.toUpperCase();
  const hasServerHeaders = Object.keys(request.responseHeaders).length > 0;

  // REGRESSION-GUARD: browser cache vence headers antigos MISS/D1; D1/REST desses headers e geracao original, nao uso atual.
  // Alterar somente com pedido/autorizacao explicita de Fernando.
  if (request.diagnostic.browserCacheReplay) return true;

  if (
    hasServerHeaders &&
    (worker === "MISS" ||
      ["MISS", "BYPASS", "DYNAMIC", "EXPIRED", "REVALIDATED"].includes(cf ?? "") ||
      (request.diagnostic.ssr.tenantRestCount ?? 0) > 0 ||
      (request.diagnostic.ssr.masterD1 ?? 0) > 0)
  ) {
    return false;
  }

  return (
    request.diagnostic.origin === "Cloudflare + Worker HIT" ||
    request.diagnostic.origin === "Cloudflare HIT" ||
    request.diagnostic.origin === "Worker cache HIT" ||
    cf === "HIT" ||
    worker === "HIT" ||
    request.diagnostic.origin === "Browser cache" ||
    (request.fromCache === true && !hasServerHeaders)
  );
}

function buildCacheProblemPrompt(key: string, occurrences: StoredRequest[]): string {
  const first = occurrences[0];
  const last = occurrences[occurrences.length - 1];
  const evidence = occurrences.map((request, index) => requestSummary(request, index + 1)).join("\n\n");

  return `Analise este possivel problema de cache em um site Pluzo.

Situacao detectada pela extensao Pluzo Sites Cache:
- Mesmo request exato: ${key}
- Ocorrencias sem cache: ${occurrences.length}
- Janela analisada: 5 minutos
- Primeira ocorrencia: ${new Date(first.timestamp).toISOString()}
- Ultima ocorrencia: ${new Date(last.timestamp).toISOString()}

Regra do alerta:
O mesmo request exato foi requisitado 2 ou mais vezes em ate 5 minutos e nenhuma resposta apresentou evidencia de browser cache, Cloudflare HIT ou Worker cache HIT.

Evidencias coletadas:
${evidence}

Tarefa:
1. Explique a causa mais provavel para o endpoint continuar sem usar cache.
2. Diga quais headers, regras de cache, Worker SSR, Cloudflare Cache Rules ou chamadas D1/tenant REST devo verificar.
3. Proponha uma correcao segura e um plano de validacao.
4. Se os dados forem insuficientes, diga exatamente quais evidencias faltam.`;
}

function requestSummary(request: StoredRequest, index: number): string {
  const headers = request.responseHeaders;
  const alerts = request.diagnostic.alerts.map((alert) => `${alert.severity}: ${alert.message}`).join(" | ") || "nenhum";
  const evidence = request.diagnostic.evidence.join(" | ") || "sem evidencia explicita";
  return `#${index}
- URL: ${request.url}
- Hora: ${new Date(request.timestamp).toISOString()}
- Status: ${request.statusCode ?? "-"}
- Tempo: ${formatDuration(request.durationMs ?? request.performance?.durationMs)}
- Origem classificada: ${request.diagnostic.origin}
- cf-cache-status: ${headers["cf-cache-status"] ?? "-"}
- x-cache: ${headers["x-cache"] ?? "-"}
- x-pluzo-cache-status: ${request.diagnostic.pluzoCache.status ?? "-"}
- x-pluzo-cache-route: ${request.diagnostic.pluzoCache.route ?? "-"}
- x-pluzo-cache-reason: ${request.diagnostic.pluzoCache.reason ?? "-"}
- x-pluzo-data-source: ${request.diagnostic.pluzoCache.dataSource ?? "-"}
- x-pluzo-cache-normalized-path: ${request.diagnostic.pluzoCache.normalizedPath ?? "-"}
- x-pluzo-ssr-diag-at: ${request.diagnostic.pluzoCache.diagAt ?? "-"}
- x-pluzo-response-id: ${request.diagnostic.pluzoCache.responseId ?? "-"}
- x-pluzo-response-generated-at: ${request.diagnostic.pluzoCache.responseGeneratedAt ?? "-"}
- x-pluzo-current-data-access: ${headers["x-pluzo-current-data-access"] ?? "-"}
- x-pluzo-generated-data-access: ${headers["x-pluzo-generated-data-access"] ?? "-"}
- D1/REST nesta ocorrencia: ${formatOccurrenceDataAccess(request)}
- D1/REST na geracao original: ${formatGeneratedDataAccess(request)}
- cache-control: ${headers["cache-control"] ?? "-"}
- x-cache-ttl: ${headers["x-cache-ttl"] ?? "-"}
- x-pluzo-ssr-diag: ${headers["x-pluzo-ssr-diag"] ?? "-"}
- Evidencias: ${evidence}
- Alertas: ${alerts}`;
}

function formatDuration(durationMs: number | undefined): string {
  return Number.isFinite(durationMs) ? `${Math.round(durationMs ?? 0)}ms` : "-";
}

function formatOccurrenceDataAccess(request: StoredRequest): string {
  if (request.diagnostic.browserCacheReplay) return "nao (browser cache)";
  return request.diagnostic.currentDataAccess ? formatDataAccess(request.diagnostic.currentDataAccess) : "indeterminado";
}

function formatGeneratedDataAccess(request: StoredRequest): string {
  return request.diagnostic.generatedDataAccess ? formatDataAccess(request.diagnostic.generatedDataAccess) : "indeterminado";
}
