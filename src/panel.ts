import { startMonitorApp } from "./dashboard-app";
import type { ExtensionMessage, HarLikeEntry } from "./types";

startMonitorApp({ mode: "panel" });
connectDevtoolsCapture();

function connectDevtoolsCapture(): void {
  if (!chrome.devtools?.network) return;

  chrome.devtools.network.getHAR((harLog) => {
    for (const entry of harLog.entries as HarLikeEntry[]) {
      sendDevtoolsEntry(entry);
    }
  });

  chrome.devtools.network.onRequestFinished.addListener((request) => {
    sendDevtoolsEntry(request as unknown as HarLikeEntry);
  });
}

function sendDevtoolsEntry(entry: HarLikeEntry): void {
  const message: ExtensionMessage = { type: "DEVTOOLS_ENTRY", entry };
  chrome.runtime.sendMessage(message).catch(() => undefined);
}
