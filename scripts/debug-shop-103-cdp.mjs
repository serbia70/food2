import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000/103';
const DEBUG_PORT = Number(process.env.DEBUG_PORT || '9223');
const profileDir = await mkdtemp(join(tmpdir(), 'food103-edge-'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  return res.json();
}

async function waitForWebSocketUrl(retries = 40) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const page = Array.isArray(list)
        ? list.find((item) => String(item?.url || '').startsWith(TARGET_URL)) || list.find((item) => item?.type === 'page')
        : null;
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('webSocketDebuggerUrl not available');
}

function createCdpClient(wsUrl) {
  let nextId = 1;
  const pending = new Map();
  const events = new Map();
  const ws = new WebSocket(wsUrl);

  ws.addEventListener('message', (event) => {
    const payload = JSON.parse(String(event.data));
    if (payload.id) {
      const entry = pending.get(payload.id);
      if (!entry) return;
      pending.delete(payload.id);
      if (payload.error) entry.reject(new Error(payload.error.message || 'CDP error'));
      else entry.resolve(payload.result);
      return;
    }
    const handlers = events.get(payload.method) || [];
    handlers.forEach((handler) => {
      try { handler(payload.params || {}); } catch {}
    });
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  return {
    ready,
    on(method, handler) {
      const list = events.get(method) || [];
      list.push(handler);
      events.set(method, list);
    },
    async send(method, params = {}) {
      await ready;
      const id = nextId++;
      const message = JSON.stringify({ id, method, params });
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(message);
      });
    },
    close() {
      try { ws.close(); } catch {}
    },
  };
}

const browser = spawn(EDGE, [
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profileDir.replace(/\\/g, '/')}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--new-window',
  TARGET_URL,
], {
  stdio: 'ignore',
  detached: false,
  windowsHide: true,
});

const cleanup = async () => {
  try { browser.kill(); } catch {}
  try { await rm(profileDir, { recursive: true, force: true }); } catch {}
};

try {
  const wsUrl = await waitForWebSocketUrl();
  const cdp = createCdpClient(wsUrl);
  const runtimeErrors = [];
  const consoleEntries = [];
  const requestFailures = [];

  cdp.on('Runtime.exceptionThrown', (params) => {
    const details = params?.exceptionDetails || {};
    runtimeErrors.push({
      text: details?.text || '',
      url: details?.url || details?.stackTrace?.callFrames?.[0]?.url || '',
      lineNumber: details?.lineNumber,
      columnNumber: details?.columnNumber,
      description: details?.exception?.description || '',
    });
  });

  cdp.on('Runtime.consoleAPICalled', (params) => {
    consoleEntries.push({
      type: params?.type,
      values: Array.isArray(params?.args) ? params.args.map((arg) => arg?.value ?? arg?.description ?? arg?.type) : [],
      stack: params?.stackTrace?.callFrames?.[0]?.url || '',
    });
  });

  cdp.on('Network.loadingFailed', (params) => {
    requestFailures.push({
      url: params?.url || '',
      errorText: params?.errorText || '',
      canceled: params?.canceled || false,
      type: params?.type || '',
    });
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Log.enable');

  await cdp.send('Page.bringToFront');
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(4000);

  const snapshotBefore = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const plusButtons = Array.from(document.querySelectorAll('button')).filter((el) => el.textContent?.trim() === '+');
      const firstPlus = plusButtons[0] || null;
      const cartBadge = document.querySelector('.nav-cart-badge');
      return {
        title: document.title,
        readyState: document.readyState,
        plusButtonCount: plusButtons.length,
        firstPlusText: firstPlus?.textContent || '',
        firstPlusDisabled: !!firstPlus?.disabled,
        firstPlusTag: firstPlus?.tagName || '',
        cartBadgeText: cartBadge?.textContent || '',
        cartBadgeDisplay: cartBadge ? getComputedStyle(cartBadge).display : 'missing',
        hasPreactMarker: !!document.querySelector('astro-island'),
      };
    })()`,
    returnByValue: true,
  });

  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const plusButtons = Array.from(document.querySelectorAll('button')).filter((el) => el.textContent?.trim() === '+');
      const firstPlus = plusButtons[0] || null;
      if (!firstPlus) return { clicked: false };
      firstPlus.click();
      return { clicked: true };
    })()`,
    returnByValue: true,
  });

  await sleep(1500);

  const snapshotAfter = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cartBadge = document.querySelector('.nav-cart-badge');
      const qtyNodes = Array.from(document.querySelectorAll('span')).map((el) => (el.textContent || '').trim()).filter(Boolean);
      return {
        cartBadgeText: cartBadge?.textContent || '',
        cartBadgeDisplay: cartBadge ? getComputedStyle(cartBadge).display : 'missing',
        visibleQtyTexts: qtyNodes.slice(0, 40),
        localUser: (() => { try { return localStorage.getItem('food_order_user'); } catch (e) { return 'ERR:' + (e?.message || e); } })(),
        localSession: (() => { try { return localStorage.getItem('user_session'); } catch (e) { return 'ERR:' + (e?.message || e); } })(),
      };
    })()`,
    returnByValue: true,
  });

  console.log(JSON.stringify({
    snapshotBefore: snapshotBefore?.result?.value || null,
    snapshotAfter: snapshotAfter?.result?.value || null,
    runtimeErrors,
    consoleEntries,
    requestFailures,
  }, null, 2));

  cdp.close();
  await cleanup();
} catch (error) {
  console.error(error?.stack || String(error));
  await cleanup();
  process.exitCode = 1;
}
