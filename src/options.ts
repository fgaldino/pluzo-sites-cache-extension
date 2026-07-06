import { normalizeDomainInput, originToMatchPattern } from "./domains";
import type { ExtensionMessage, ExtensionState, MessageResponse } from "./types";

let state: ExtensionState | undefined;

document.addEventListener("DOMContentLoaded", () => {
  bindControls();
  void loadState();
});

function bindControls(): void {
  byId<HTMLFormElement>("domainForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void addDomain();
  });
  byId<HTMLButtonElement>("openDashboard")?.addEventListener("click", () => send({ type: "OPEN_DASHBOARD" }));
}

async function loadState(): Promise<void> {
  state = await send<ExtensionState>({ type: "GET_STATE" });
  render();
}

async function addDomain(): Promise<void> {
  const input = byId<HTMLInputElement>("domainInput");
  if (!input) return;

  try {
    setError("");
    const origin = normalizeDomainInput(input.value);
    const pattern = originToMatchPattern(origin);
    const hasPermission = await containsPermission(pattern);
    if (!hasPermission) {
      const granted = await requestPermission(pattern);
      if (!granted) throw new Error("Permissao de host negada.");
    }
    await send({ type: "ADD_DOMAIN", origin });
    input.value = "";
    await loadState();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

async function removeDomain(origin: string): Promise<void> {
  await send({ type: "REMOVE_DOMAIN", origin });
  await chrome.permissions.remove({ origins: [originToMatchPattern(origin)] }).catch(() => false);
  await loadState();
}

function render(): void {
  const list = byId("domains");
  if (!list || !state) return;

  list.replaceChildren(
    ...state.settings.domains.map((domain) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${domain.label} (${domain.origin})`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Remover";
      button.addEventListener("click", () => void removeDomain(domain.origin));
      item.append(label, button);
      return item;
    })
  );
}

async function send<T = unknown>(message: ExtensionMessage): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as MessageResponse<T> | undefined;
  if (!response?.ok) throw new Error(response?.error ?? "Mensagem falhou.");
  return response.data as T;
}

function containsPermission(origin: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [origin] });
}

function requestPermission(origin: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [origin] });
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setError(message: string): void {
  const error = byId("error");
  if (error) error.textContent = message;
}
