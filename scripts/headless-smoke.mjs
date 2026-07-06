import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const chromium = process.env.CHROME_BIN || "/usr/bin/chromium";
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync("/tmp/opencode/pluzo-chrome-");
const validationUrls = ["https://pluzo.top/", "https://pluzo.shop/"];

if (!existsSync(join(dist, "manifest.json"))) {
  throw new Error("dist/manifest.json nao existe. Rode npm run build antes.");
}

if (!existsSync(chromium)) {
  throw new Error(`Chromium nao encontrado em ${chromium}. Defina CHROME_BIN.`);
}

const chrome = spawn(
  chromium,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    "about:blank"
  ],
  { stdio: "ignore", detached: true }
);

try {
  await waitForDevtools(port);
  const serviceWorker = await waitForServiceWorker(port);
  await delay(1000);
  for (const url of validationUrls) {
    await openTarget(port, url);
    await delay(3000);
  }

  if (!serviceWorker?.webSocketDebuggerUrl) {
    throw new Error("Service worker da extensao nao apareceu no CDP.");
  }

  const requests = await waitForHomeRequests(serviceWorker.webSocketDebuggerUrl);
  const homes = validationUrls.map((expectedUrl) => findHomeRequest(requests, expectedUrl));

  const homeRequests = homes.filter(Boolean);

  if (homeRequests.length === 0) {
    throw new Error("Nenhum request home foi registrado pela extensao.");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        captured: requests.length,
        homes: homeRequests.map((request) => ({
          url: request.url,
          origin: request.diagnostic?.origin,
          cfCacheStatus: request.responseHeaders?.["cf-cache-status"],
          xCache: request.responseHeaders?.["x-cache"],
          tenantRestCount: request.diagnostic?.ssr?.tenantRestCount
        }))
      },
      null,
      2
    )
  );
} finally {
  await stopChrome(chrome);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (error) {
    console.warn(`Nao foi possivel remover perfil temporario ${profile}:`, error.message);
  }
}

async function waitForHomeRequests(webSocketDebuggerUrl) {
  const deadline = Date.now() + 15_000;
  let lastRequests = [];

  while (Date.now() < deadline) {
    const storage = await evaluateJson(webSocketDebuggerUrl, "chrome.storage.local.get(null)");
    lastRequests = storage.pluzoRequests ?? [];
    const allHomesPresent = validationUrls.every((expectedUrl) => findHomeRequest(lastRequests, expectedUrl));
    if (allHomesPresent) return lastRequests;
    await delay(500);
  }

  throw new Error(
    `Nem todas as homes esperadas foram registradas pela extensao. Capturados: ${lastRequests.length} ` +
      lastRequests.map((request) => request.url).join(" | ")
  );
}

function findHomeRequest(requests, expectedUrl) {
  const expected = new URL(expectedUrl);
  return requests.find((request) => {
    try {
      const url = new URL(request.url);
      return url.origin === expected.origin && (url.pathname === "/" || url.pathname === "");
    } catch {
      return false;
    }
  });
}

async function waitForDevtools(debugPort) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await json(`http://127.0.0.1:${debugPort}/json/version`);
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("Chromium nao abriu porta de debug a tempo.");
}

async function waitForServiceWorker(debugPort) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const targets = await json(`http://127.0.0.1:${debugPort}/json/list`);
    const serviceWorker = targets.find(
      (target) => target.type === "service_worker" && target.url.includes("/src/background.js")
    );
    if (serviceWorker) return serviceWorker;
    await delay(250);
  }
  throw new Error("Service worker da extensao nao apareceu no CDP.");
}

async function openTarget(debugPort, url) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT"
  });
  if (!response.ok) throw new Error(`Falha ao abrir ${url}: ${response.status}`);
}

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} retornou ${response.status}`);
  return response.json();
}

function evaluateJson(webSocketDebuggerUrl, expression) {
  return new Promise((resolvePromise, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();

    socket.addEventListener("open", () => {
      send("Runtime.enable");
      send("Runtime.evaluate", {
        expression: `${expression}.then((value) => JSON.stringify(value))`,
        awaitPromise: true,
        returnByValue: true
      }).then((result) => {
        socket.close();
        const value = result.result?.value;
        resolvePromise(typeof value === "string" ? JSON.parse(value) : value);
      }, reject);
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { resolve, reject: rejectMessage } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectMessage(new Error(message.error.message));
      else resolve(message.result);
    });

    socket.addEventListener("error", () => reject(new Error("Falha no WebSocket CDP.")));

    function send(method, params = {}) {
      const messageId = ++id;
      socket.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, rejectMessage) => {
        pending.set(messageId, { resolve, reject: rejectMessage });
      });
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopChrome(processHandle) {
  return new Promise((resolve) => {
    const pid = processHandle.pid;
    const kill = (signal) => {
      try {
        if (pid) process.kill(-pid, signal);
        else processHandle.kill(signal);
      } catch {
        // Processo ja saiu.
      }
    };

    if (processHandle.killed || processHandle.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      kill("SIGKILL");
      setTimeout(resolve, 1000);
    }, 3000);
    processHandle.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    kill("SIGTERM");
  });
}
