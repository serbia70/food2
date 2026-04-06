import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const routePath = resolve(process.cwd(), 'src/pages/api/admin/settings/master.ts');

async function loadRoute() {
  let source = await readFile(routePath, 'utf8');
  source = source.replace("import { API_BASE_URL } from '../../../../config';", "const API_BASE_URL = 'https://api.test.local';");
  source = source.replace(
    "import { proxyAdminRequest } from '../../../../lib/admin-api-route';",
    `const proxyAdminRequest = ({ url, method = 'GET', headers = {}, body }) => fetch(url, { method, headers, ...(body !== undefined ? { body } : {}) });`,
  );
  const js = stripTypeScriptTypes(source, { mode: 'strip' });
  return import(`data:text/javascript,${encodeURIComponent(js)}`);
}

test('GET master settings proxies admin settings read request upstream', async () => {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init });
      return new Response(JSON.stringify({ settings: { telegramBotToken: 'read-token' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const mod = await loadRoute();
    assert.equal(typeof mod.GET, 'function');

    const response = await mod.GET({
      request: new Request('http://localhost:3000/api/admin/settings/master', {
        method: 'GET',
        headers: { cookie: 'admin_token=admin-token-1' },
      }),
      cookies: {
        get(name: string) {
          if (name === 'admin_token') return { value: 'admin-token-1' };
          return undefined;
        },
      },
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.url, 'https://api.test.local/api/admin/settings/master');
    assert.equal(String(fetchCalls[0]?.init?.method || 'GET').toUpperCase(), 'GET');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { settings: { telegramBotToken: 'read-token' } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
