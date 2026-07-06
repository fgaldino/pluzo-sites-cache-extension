import type { ExtensionMessage, PerformanceSnapshot } from "./types";

const pending: PerformanceSnapshot[] = [];
let flushTimer: number | undefined;

enqueueEntries([
  ...performance.getEntriesByType("navigation"),
  ...performance.getEntriesByType("resource")
]);

try {
  const observer = new PerformanceObserver((list) => {
    enqueueEntries(list.getEntries());
  });
  observer.observe({ entryTypes: ["resource"] });
} catch {
  // PerformanceObserver pode variar por contexto; a captura inicial ainda cobre reloads simples.
}

function enqueueEntries(entries: PerformanceEntry[]): void {
  const observedAt = Date.now();
  for (const entry of entries) {
    const snapshot = toSnapshot(entry, observedAt);
    if (snapshot) pending.push(snapshot);
  }

  if (pending.length > 0 && flushTimer === undefined) {
    flushTimer = window.setTimeout(flush, 250);
  }
}

function toSnapshot(entry: PerformanceEntry, observedAt: number): PerformanceSnapshot | undefined {
  const name = entry.name;
  if (!/^https?:\/\//i.test(name)) return undefined;

  const resource = entry as PerformanceResourceTiming;
  return {
    url: name,
    initiatorType: resource.initiatorType || entry.entryType,
    transferSize: resource.transferSize ?? 0,
    encodedBodySize: resource.encodedBodySize ?? 0,
    decodedBodySize: resource.decodedBodySize ?? 0,
    durationMs: entry.duration,
    startTime: entry.startTime,
    observedAt
  };
}

function flush(): void {
  flushTimer = undefined;
  const entries = pending.splice(0, pending.length);
  const message: ExtensionMessage = { type: "PERFORMANCE_ENTRIES", entries };
  chrome.runtime.sendMessage(message).catch(() => undefined);
}
