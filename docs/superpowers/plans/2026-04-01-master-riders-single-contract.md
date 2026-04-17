# Master Riders Single Contract Implementation Plan

> 状态说明（历史计划）：这份计划记录的是 master riders impersonate 收口时的实施步骤；文中的红灯预期属于当时 contract 收敛过程，不应直接当作当前实现状态。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 master riders 链路收口为“站内单入口 + 单契约”，让页面层只消费 canonical impersonate 数据。

**Architecture:** `src/pages/api/master/impersonate-shop.ts` 成为唯一兼容边界，负责把 foos2Go 的 legacy impersonate 返回翻译成 canonical `{ ok, data }`。`src/lib/master-rider-status-loader.ts` 只请求该站内代理并只解析 canonical impersonate，继续保留跨店遍历、去重、状态分组；riders 列表本轮仍使用现有主格式 `{ success, riders }`。

**Tech Stack:** Astro API routes、TypeScript、Node built-in test runner、pnpm

---

## File map

- `src/pages/api/master/impersonate-shop.ts`
  - 统一处理 GET/POST
  - 读取 upstream legacy impersonate 结果
  - 输出 canonical envelope
- `src/pages/api/master/impersonate-shop.test.ts`
  - 新增代理层测试，锁住 legacy → canonical 转换与错误分支
- `src/lib/master-rider-status-loader.ts`
  - 改为只请求站内 `/api/master/impersonate-shop?id=...`
  - 删除 impersonate 兼容猜测逻辑
  - 保留 riders 主格式消费、跨店去重、状态分组
- `src/lib/master-rider-status-loader.test.ts`
  - 删除 impersonate legacy fallback 测试
  - 改成只验证 canonical impersonate 输入与 riders 主格式

## Scope guardrails

- 不改 `src/pages/master/index.astro`
- 不新增 `/api/master/riders`
- 不改 foos2Go 后端
- 不调整 riders UI 样式
- 不把 `/api/admin/riders` 也升级成 canonical

### Task 1: 收口 master impersonate 代理为唯一兼容边界

**Files:**
- Create: `src/pages/api/master/impersonate-shop.test.ts`
- Modify: `src/pages/api/master/impersonate-shop.ts`
- Reference: `src/lib/master-auth.ts`

- [ ] **Step 1: Write the failing test**

在 `src/pages/api/master/impersonate-shop.test.ts` 写下面这组测试，先锁住目标行为：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { GET, POST } from './impersonate-shop.ts';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createCookies() {
  const store = new Map<string, { value: string; options?: Record<string, unknown> }>();
  return {
    store,
    get(name: string) {
      const entry = store.get(name);
      return entry ? { value: entry.value } : undefined;
    },
    set(name: string, value: string, options?: Record<string, unknown>) {
      store.set(name, { value, options });
    },
  };
}

test('GET translates legacy upstream impersonate payload into canonical envelope', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    slug: 'shop-11',
    token: 'legacy-admin-token',
    impersonated: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const cookies = createCookies();
  cookies.set('master_token', 'master-secret');

  const request = new Request('http://localhost:3000/api/master/impersonate-shop?id=11', {
    method: 'GET',
  });

  const response = await GET({ request, cookies } as never);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    ok: true,
    data: {
      slug: 'shop-11',
      token: 'legacy-admin-token',
      impersonated: true,
    },
  });
  assert.equal(cookies.get('admin_token')?.value, 'legacy-admin-token');
});

test('POST keeps working and also returns canonical envelope', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    slug: 'shop-22',
    token: 'legacy-admin-token-22',
    impersonated: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const cookies = createCookies();
  cookies.set('master_token', 'master-secret');

  const request = new Request('http://localhost:3000/api/master/impersonate-shop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 22 }),
  });

  const response = await POST({ request, cookies } as never);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.slug, 'shop-22');
  assert.equal(payload.data.token, 'legacy-admin-token-22');
});

test('returns 502 when legacy upstream misses token', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    slug: 'shop-11',
    impersonated: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const cookies = createCookies();
  cookies.set('master_token', 'master-secret');

  const request = new Request('http://localhost:3000/api/master/impersonate-shop?id=11', {
    method: 'GET',
  });

  const response = await GET({ request, cookies } as never);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'impersonate_failed');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/pages/api/master/impersonate-shop.test.ts`

历史红灯预期：，原因应是当前文件没有 `GET` 导出，且当前实现仍用 `parseJsonEnvelope()` 解析 canonical upstream，无法通过 legacy → canonical 的断言。

- [ ] **Step 3: Write minimal implementation**

把 `src/pages/api/master/impersonate-shop.ts` 收口成“兼容只在代理层”的实现。直接替换为下面结构：

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { createApiError, createApiSuccess } from '../../../domain/api/api-envelope.ts';
import { resolveMasterAuth } from '../../../lib/master-auth.ts';

export const prerender = false;

const isProd = Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD);

type LegacyImpersonateResponse = {
  success?: unknown;
  slug?: unknown;
  token?: unknown;
  impersonated?: unknown;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readShopId(request: Request, body: unknown): number {
  if (request.method === 'GET') {
    return Number(new URL(request.url).searchParams.get('id') || 0);
  }
  return Number(body && typeof body === 'object' ? (body as { id?: unknown }).id || 0 : 0);
}

async function handleImpersonate(request: Request, cookies: Parameters<APIRoute>[0]['cookies']) {
  const auth = resolveMasterAuth(request, cookies);
  if (!auth) {
    return json(createApiError('unauthorized', 'Unauthorized'), 401);
  }

  const body = request.method === 'POST'
    ? await request.json().catch(() => ({}))
    : {};
  const id = readShopId(request, body);
  if (!id) {
    return json(createApiError('invalid_shop_id', 'Invalid shop id'), 400);
  }

  const upstream = await fetch(`${API_BASE_URL}/api/master/impersonate-shop?id=${encodeURIComponent(String(id))}`, {
    method: 'GET',
    headers: { Authorization: auth },
  });

  if (!upstream.ok) {
    return json(createApiError('impersonate_failed', 'Impersonate failed'), upstream.status || 502);
  }

  const legacy = await upstream.json().catch(() => null) as LegacyImpersonateResponse | null;
  const success = legacy?.success === true;
  const slug = String(legacy?.slug || '').trim();
  const token = String(legacy?.token || '').trim();
  const impersonated = legacy?.impersonated === true;

  if (!success || !slug || !token || !impersonated) {
    return json(createApiError('impersonate_failed', 'Impersonate failed'), 502);
  }

  const secure = isProd || new URL(request.url).protocol === 'https:';
  cookies.set('admin_token', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 60 * 60 * 2,
  });
  cookies.set('admin_impersonated', '1', {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure,
    maxAge: 60 * 60 * 2,
  });
  cookies.set('master_impersonated', '1', {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure,
    maxAge: 60 * 60 * 2,
  });

  return json(createApiSuccess({ slug, token, impersonated: true }));
}

export const GET: APIRoute = async ({ request, cookies }) => handleImpersonate(request, cookies);
export const POST: APIRoute = async ({ request, cookies }) => handleImpersonate(request, cookies);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/pages/api/master/impersonate-shop.test.ts`

Expected: PASS；GET/POST 都输出 canonical，下游缺字段分支返回 502。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/master/impersonate-shop.ts src/pages/api/master/impersonate-shop.test.ts && git commit -m "$(cat <<'EOF'
fix: normalize master impersonate proxy contract
EOF
)"
```

### Task 2: 让 riders loader 只消费 canonical impersonate

**Files:**
- Modify: `src/lib/master-rider-status-loader.ts`
- Modify: `src/lib/master-rider-status-loader.test.ts`

- [ ] **Step 1: Write the failing test**

先把 `src/lib/master-rider-status-loader.test.ts` 中 legacy impersonate 相关测试替换成下面两组，保证 loader 只消费 canonical impersonate：

```ts
test('loadMasterRiderStatusData reads canonical impersonate proxy payload only', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'https://food2.serbia70.com/api/master/impersonate-shop?id=11') {
        assert.equal(init?.method, 'GET');
        return new Response(JSON.stringify({
          ok: true,
          data: {
            slug: 'shop-11',
            token: 'Bearer admin-token-11',
            impersonated: true,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://food2.serbia70.com/api/admin/riders') {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('authorization'), 'Bearer admin-token-11');
        return new Response(JSON.stringify({
          success: true,
          riders: [{ id: 1, name: 'canonical-rider', status: 'available' }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterRiderStatusData({
      authHeader: 'Bearer master-token',
      shopRows: [{ id: 11, name: 'Shop 11' }],
    });

    assert.equal(result.error, '');
    assert.equal(result.payload.summary.total_riders, 1);
    assert.equal(result.payload.groups.available[0].name, 'canonical-rider');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterRiderStatusData skips shop when impersonate proxy is not canonical', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'https://food2.serbia70.com/api/master/impersonate-shop?id=11') {
        assert.equal(init?.method, 'GET');
        return new Response(JSON.stringify({
          success: true,
          slug: 'shop-11',
          token: 'legacy-admin-token',
          impersonated: true,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterRiderStatusData({
      authHeader: 'Bearer master-token',
      shopRows: [{ id: 11, name: 'Shop 11' }],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.summary, {
      total_riders: 0,
      available_riders: 0,
      busy_riders: 0,
      offline_riders: 0,
      active_order_count: 0,
      cod_order_count: 0,
      delivery_fee_total: 0,
      cod_amount_total: 0,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

保留现有第一组“跨店去重”测试，但把 riders 返回统一成当前主格式：

```ts
return new Response(JSON.stringify({
  success: true,
  riders: [
    { id: 1, name: 'A', phone: '111', status: 'available' },
    { id: 2, name: 'B', phone: '222', status: 'busy' },
  ],
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
```

并删除当前这两类旧测试：

- `accepts legacy/raw impersonate response from backend`
- `accepts legacy rows riders payload from backend backup path`

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-rider-status-loader.test.ts`

历史红灯预期：；因为当前 loader 仍接受 legacy impersonate 顶层 `token`，且还兼容 `rows/items`。

- [ ] **Step 3: Write minimal implementation**

把 `src/lib/master-rider-status-loader.ts` 收口到下面这个形状：

```ts
import { API_BASE_URL } from '../config.ts';

type ShopSummary = {
  id?: unknown;
  name?: unknown;
};

type RiderStatus = 'available' | 'busy' | 'offline';

type RiderSummary = {
  id?: unknown;
  name?: unknown;
  phone?: unknown;
  status?: RiderStatus | string;
};

type CanonicalImpersonatePayload = {
  slug?: unknown;
  token?: unknown;
  impersonated?: unknown;
};

type MasterRiderStatusPayload = {
  summary: {
    total_riders: number;
    available_riders: number;
    busy_riders: number;
    offline_riders: number;
    active_order_count: number;
    cod_order_count: number;
    delivery_fee_total: number;
    cod_amount_total: number;
  };
  groups: {
    available: RiderSummary[];
    busy: RiderSummary[];
    offline: RiderSummary[];
  };
};

export type LoadMasterRiderStatusDataInput = {
  authHeader: string;
  shopRows: ShopSummary[];
};

export type LoadMasterRiderStatusDataResult = {
  payload: MasterRiderStatusPayload;
  error: string;
};

const EMPTY_MASTER_RIDER_STATUS_PAYLOAD: MasterRiderStatusPayload = {
  summary: {
    total_riders: 0,
    available_riders: 0,
    busy_riders: 0,
    offline_riders: 0,
    active_order_count: 0,
    cod_order_count: 0,
    delivery_fee_total: 0,
    cod_amount_total: 0,
  },
  groups: {
    available: [],
    busy: [],
    offline: [],
  },
};

function normalizeRiderRows(payload: unknown): RiderSummary[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as { success?: unknown; riders?: unknown };
  if (record.success === true && Array.isArray(record.riders)) {
    return record.riders as RiderSummary[];
  }
  return [];
}

function normalizeStatus(status: unknown): RiderStatus {
  const value = String(status || '').trim();
  if (value === 'available' || value === 'busy') return value;
  return 'offline';
}

function buildRiderDedupKey(rider: RiderSummary): string {
  const riderId = String(rider?.id ?? '').trim();
  if (riderId) return `id:${riderId}`;
  return `fallback:${String(rider?.name ?? '').trim()}::${String(rider?.phone ?? '').trim()}`;
}

function readCanonicalImpersonatePayload(payload: unknown): CanonicalImpersonatePayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const envelope = payload as { ok?: unknown; data?: unknown };
  if (envelope.ok !== true || !envelope.data || typeof envelope.data !== 'object') return null;
  return envelope.data as CanonicalImpersonatePayload;
}

export async function loadMasterRiderStatusData({ authHeader, shopRows }: LoadMasterRiderStatusDataInput): Promise<LoadMasterRiderStatusDataResult> {
  if (!authHeader) {
    return {
      payload: EMPTY_MASTER_RIDER_STATUS_PAYLOAD,
      error: '',
    };
  }

  const groups: MasterRiderStatusPayload['groups'] = {
    available: [],
    busy: [],
    offline: [],
  };
  const seenRiders = new Set<string>();

  try {
    for (const shop of shopRows) {
      const shopId = Number(shop?.id || 0);
      if (!shopId) continue;

      const impersonateRes = await fetch(`${API_BASE_URL}/api/master/impersonate-shop?id=${encodeURIComponent(String(shopId))}`, {
        method: 'GET',
        headers: { Authorization: authHeader },
      });
      const impersonateJson = await impersonateRes.json().catch(() => null);
      const impersonatePayload = readCanonicalImpersonatePayload(impersonateJson);
      const adminAuthHeader = String(impersonatePayload?.token || '').trim();
      if (!impersonateRes.ok || !adminAuthHeader) continue;

      const ridersRes = await fetch(`${API_BASE_URL}/api/admin/riders`, {
        method: 'GET',
        headers: { Authorization: adminAuthHeader },
      });
      const ridersData = await ridersRes.json().catch(() => null);
      if (!ridersRes.ok) continue;

      for (const rider of normalizeRiderRows(ridersData)) {
        const dedupKey = buildRiderDedupKey(rider);
        if (seenRiders.has(dedupKey)) continue;
        seenRiders.add(dedupKey);
        groups[normalizeStatus(rider?.status)].push(rider);
      }
    }

    return {
      payload: {
        summary: {
          total_riders: groups.available.length + groups.busy.length + groups.offline.length,
          available_riders: groups.available.length,
          busy_riders: groups.busy.length,
          offline_riders: groups.offline.length,
          active_order_count: 0,
          cod_order_count: 0,
          delivery_fee_total: 0,
          cod_amount_total: 0,
        },
        groups,
      },
      error: '',
    };
  } catch (error) {
    return {
      payload: EMPTY_MASTER_RIDER_STATUS_PAYLOAD,
      error: error instanceof Error ? error.message : '骑手状态加载失败',
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-rider-status-loader.test.ts`

Expected: PASS；loader 只认 canonical impersonate，仍可完成跨店去重与 riders 主格式聚合。

- [ ] **Step 5: Commit**

```bash
git add src/lib/master-rider-status-loader.ts src/lib/master-rider-status-loader.test.ts && git commit -m "$(cat <<'EOF'
fix: simplify master riders loader contract
EOF
)"
```

### Task 3: 回归验证 master riders 页面契约

**Files:**
- Test: `src/tests/pages/master/master-riders-ui.test.ts`
- Verify build: project root

- [ ] **Step 1: Run riders UI contract test**

Run: `node --test src/tests/pages/master/master-riders-ui.test.ts`

Expected: PASS；说明本轮契约收口没有破坏现有 riders 面板与卡片源码约定。

- [ ] **Step 2: Run full targeted regression set**

Run: `node --test src/pages/api/master/impersonate-shop.test.ts src/lib/master-rider-status-loader.test.ts src/tests/pages/master/master-riders-ui.test.ts`

Expected: PASS；代理层、loader、UI 契约三个层面的测试全部通过。

- [ ] **Step 3: Run build verification**

Run: `pnpm build`

Expected: PASS；Astro 路由与 SSR 构建无回归。

- [ ] **Step 4: Commit final verification state**

如果前两次提交后此任务没有新增代码改动，则这一步不再创建新提交；只记录验证结果并保持工作树干净。如果因验证失败而产生修正代码，则按实际改动创建一条 Conventional Commit，例如：

```bash
git add <修正过的文件> && git commit -m "$(cat <<'EOF'
fix: finalize master riders single-contract cleanup
EOF
)"
```

## Self-review checklist

- Spec coverage:
  - 代理层成为唯一兼容边界 → Task 1
  - loader 只认 canonical impersonate → Task 2
  - 保留跨店去重与 riders 主格式 → Task 2
  - UI 契约与构建回归 → Task 3
- Placeholder scan:
  - 无 `TBD` / `TODO` / “类似任务 N” 之类占位写法
- Type consistency:
  - canonical impersonate 统一使用 `{ ok, data }`
  - loader 内部统一使用 `readCanonicalImpersonatePayload()`
  - riders 主格式统一使用 `{ success, riders }`
