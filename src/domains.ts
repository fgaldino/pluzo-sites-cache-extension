import type { MonitorDomain } from "./types";

export const DEFAULT_DOMAIN_ORIGINS = ["https://pluzo.top", "https://pluzo.shop"];

export function normalizeDomainInput(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new Error("Informe um dominio ou origem.");
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : `https://${raw}`;
  const url = new URL(withProtocol);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Use somente http ou https.");
  }

  return `${url.protocol}//${url.host.toLowerCase()}`;
}

export function originToMatchPattern(origin: string): string {
  const url = new URL(origin);
  return `${url.protocol}//${url.host}/*`;
}

export function domainLabel(origin: string): string {
  return new URL(origin).host;
}

export function makeMonitorDomain(origin: string, createdAt = Date.now()): MonitorDomain {
  const normalized = normalizeDomainInput(origin);
  return {
    id: normalized,
    origin: normalized,
    label: domainLabel(normalized),
    enabled: true,
    createdAt
  };
}

export function isUrlMonitored(url: string, domains: MonitorDomain[]): boolean {
  try {
    const target = new URL(url);
    return domains.some((domain) => {
      if (!domain.enabled) return false;
      const origin = new URL(domain.origin);
      return target.protocol === origin.protocol && target.host === origin.host;
    });
  } catch {
    return false;
  }
}
