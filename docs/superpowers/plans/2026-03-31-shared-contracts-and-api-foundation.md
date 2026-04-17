# Shared Contracts and API Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立前后端统一的领域契约、错误模型、会话边界与 BFF/proxy 基座，为后续公共前台、admin、master 重建提供稳定基础。

**Architecture:** 这一阶段不直接重写全部页面，而是先在 `food2astro` 建立 `domain / infra / application` 基础层，并在 `foos2Go` 建立统一的 HTTP response DTO、错误模型和会话/店铺核心接口。前端 BFF 只保留 cookie/session、入参校验、代理转发、错误映射四类职责，旧的历史兼容字段与散装 helper 在新基座稳定后逐步删除。

**Tech Stack:** Astro, TypeScript, Zod, Node.js built-in test runner (`node:test`), Go, Go test, existing Astro API routes, existing foos2Go HTTP handlers

---

## File Map

### Create — `food2astro`
- `src/domain/api/api-envelope.ts` — `ApiSuccess` / `ApiError` / helpers
- `src/domain/api/api-envelope.test.ts` — 锁定统一错误/成功结构
- `src/domain/auth/auth-session.ts` — `AuthSession` 类型与 schema
- `src/domain/auth/auth-session.test.ts` — 锁定 session schema
- `src/domain/shop/shop-contract.ts` — `Shop` / `MenuCategory` / `MenuProduct` schema
- `src/domain/shop/shop-contract.test.ts` — 锁定店铺与菜单契约
- `src/domain/master/master-settings-contract.ts` — `MasterSettings` schema
- `src/domain/master/master-settings-contract.test.ts` — 锁定 master settings 契约
- `src/domain/order/order-contract.ts` — `Order` / `Dispatch` / `Rider` 核心 schema
- `src/domain/order/order-contract.test.ts` — 锁定订单/骑手/派单契约
- `src/infra/http/http-json-client.ts` — 统一 JSON client，按 `ok` 协议解析
- `src/infra/http/http-json-client.test.ts` — 锁定 client 的成功/失败解析
- `src/infra/http/proxy-response.ts` — 将 upstream 响应映射为统一 JSON envelope
- `src/infra/http/proxy-response.test.ts` — 锁定 proxy 错误映射
- `src/infra/auth/session-cookie.ts` — admin/master/user session cookie 读取与 header 组装
- `src/infra/auth/session-cookie.test.ts` — 锁定 cookie 读取行为
- `src/application/auth/load-session-query.ts` — 页面/BFF 共用的 session query
- `src/application/auth/load-session-query.test.ts` — 锁定 session query 行为

### Create — `foos2Go`
- `internal/http/api/envelope.go` — 统一 `ok/data/error` 输出 helper
- `internal/http/api/envelope_test.go` — 锁定 envelope JSON 结构
- `internal/http/api/errors.go` — 统一 error code / message helper
- `internal/http/api/errors_test.go` — 锁定错误映射
- `internal/http/dto/session_dto.go` — `AuthSessionResponse` DTO
- `internal/http/dto/shop_dto.go` — `ShopResponse` / `MenuResponse` DTO
- `internal/http/dto/master_dto.go` — `MasterSettingsResponse` DTO
- `internal/http/dto/order_dto.go` — `OrderResponse` / `DispatchResponse` / `RiderResponse` DTO
- `internal/http/session_routes_test.go` — 会话接口回归测试
- `internal/http/shop_routes_test.go` — 店铺/菜单新契约回归测试

### Modify — `food2astro`
- `src/lib/api-proxy.ts` — 替换旧 `success/error/code` 风格，改为消费统一 envelope helper
- `src/lib/master-auth.ts` — 收口为新 session cookie helper 的薄包装或删除旧 fallback 分支
- `src/lib/user-api-route.ts` — 改为由新 `application/auth` 或 contract helper 驱动
- `src/pages/api/master/login.ts` — 输出新 session envelope
- `src/pages/api/master/logout.ts` — 输出新 session envelope
- `src/pages/api/admin/login.ts` — 输出新 session envelope
- `src/pages/api/admin/logout.ts` — 输出新 session envelope
- `src/pages/api/auth/check.ts` — 改为统一 session query 输出
- `src/pages/api/shop/list.ts` — 按新 client/envelope 处理

### Modify — `foos2Go`
- `internal/handlers/order.go` — 对外响应切换到新 DTO/envelope helper
- `internal/handlers/order_status_flow.go` — 对外响应切换到新 DTO/envelope helper
- `internal/handlers/master_routes.go` — 切换到新 DTO/envelope helper
- `internal/handlers/auth*.go` 或实际登录/session handler 文件 — 切换到新 DTO/envelope helper
- `internal/db/migrations.go` — 若需要为 session/dispatch 契约补最小字段，集中在本阶段定义

### Verify unchanged
- `src/lib/master-auth.test.ts`
- `src/lib/api-proxy.html-5xx.test.ts`
- `src/lib/user-api-route.test.ts`
- `src/pages/api/**` 中与登录/会话相关的现有测试
- `go test ./internal/... -count=1`

### References
- Spec: `docs/superpowers/specs/2026-03-31-full-stack-clean-rebuild-design.md`
- Existing helpers: `src/lib/api-proxy.ts`, `src/lib/master-auth.ts`, `src/lib/user-api-route.ts`
- Existing repo roots: `D:/ai/food/.worktrees/260311/food2astro`, `D:/ai/food/.worktrees/260311/foos2Go`

---

### Task 1: Lock the new cross-stack API envelope contract

**Files:**
- Create: `src/domain/api/api-envelope.ts`
- Create: `src/domain/api/api-envelope.test.ts`
- Create: `D:/ai/food/.worktrees/260311/foos2Go/internal/http/api/envelope.go`
- Create: `D:/ai/food/.worktrees/260311/foos2Go/internal/http/api/envelope_test.go`

- [ ] **Step 1: Write the failing TypeScript test for the unified success/error envelope**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createApiSuccess,
  createApiError,
  isApiSuccess,
  isApiError,
} from './api-envelope.ts';

test('api envelope creates success payloads with ok true and typed data', () => {
  const payload = createApiSuccess({ id: 1, name: 'shop-101' });

  assert.deepEqual(payload, {
    ok: true,
    data: { id: 1, name: 'shop-101' },
  });
  assert.equal(isApiSuccess(payload), true);
  assert.equal(isApiError(payload), false);
});

test('api envelope creates error payloads with code and message', () => {
  const payload = createApiError('unauthorized', '请重新登录');

  assert.deepEqual(payload, {
    ok: false,
    error: {
      code: 'unauthorized',
      message: '请重新登录',
    },
  });
  assert.equal(isApiError(payload), true);
  assert.equal(isApiSuccess(payload), false);
});
```

- [ ] **Step 2: Run the TypeScript test to verify it fails**

Run: `node --test src/domain/api/api-envelope.test.ts`
Expected: FAIL with missing module or missing export errors

- [ ] **Step 3: Write the failing Go test for the same JSON shape**

```go
package api

import (
	"encoding/json"
	"testing"
)

func TestSuccessEnvelopeJSONShape(t *testing.T) {
	body, err := json.Marshal(Success(map[string]any{"id": 1, "name": "shop-101"}))
	if err != nil {
		t.Fatalf("marshal success envelope: %v", err)
	}

	want := `{"ok":true,"data":{"id":1,"name":"shop-101"}}`
	if string(body) != want {
		t.Fatalf("unexpected success envelope: got %s want %s", string(body), want)
	}
}

func TestErrorEnvelopeJSONShape(t *testing.T) {
	body, err := json.Marshal(Error("unauthorized", "请重新登录"))
	if err != nil {
		t.Fatalf("marshal error envelope: %v", err)
	}

	want := `{"ok":false,"error":{"code":"unauthorized","message":"请重新登录"}}`
	if string(body) != want {
		t.Fatalf("unexpected error envelope: got %s want %s", string(body), want)
	}
}
```

- [ ] **Step 4: Run the Go test to verify it fails**

Run: `go test ./internal/http/api -run 'Test(Success|Error)EnvelopeJSONShape' -count=1`
Expected: FAIL with undefined `Success` / `Error`

- [ ] **Step 5: Implement the minimal TypeScript envelope**

```ts
export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function createApiSuccess<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function createApiError(code: string, message: string, details?: unknown): ApiError {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } };
}

export function isApiSuccess<T>(value: ApiSuccess<T> | ApiError): value is ApiSuccess<T> {
  return value.ok === true;
}

export function isApiError<T>(value: ApiSuccess<T> | ApiError): value is ApiError {
  return value.ok === false;
}
```

- [ ] **Step 6: Implement the minimal Go envelope**

```go
package api

type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

type SuccessEnvelope struct {
	OK   bool `json:"ok"`
	Data any  `json:"data"`
}

type ErrorEnvelope struct {
	OK    bool      `json:"ok"`
	Error ErrorBody `json:"error"`
}

func Success(data any) SuccessEnvelope {
	return SuccessEnvelope{OK: true, Data: data}
}

func Error(code, message string) ErrorEnvelope {
	return ErrorEnvelope{
		OK: false,
		Error: ErrorBody{Code: code, Message: message},
	}
}
```

- [ ] **Step 7: Run both test suites to verify they pass**

Run: `node --test src/domain/api/api-envelope.test.ts && go test ./internal/http/api -run 'Test(Success|Error)EnvelopeJSONShape' -count=1`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git -C "D:/ai/food/.worktrees/260311/food2astro" add src/domain/api/api-envelope.ts src/domain/api/api-envelope.test.ts && git -C "D:/ai/food/.worktrees/260311/foos2Go" add internal/http/api/envelope.go internal/http/api/envelope_test.go && git -C "D:/ai/food/.worktrees/260311/food2astro" commit -m "feat: add shared api envelope contract"
```

---

### Task 2: Lock the core domain contracts in `food2astro`

**Files:**
- Create: `src/domain/auth/auth-session.ts`
- Create: `src/domain/auth/auth-session.test.ts`
- Create: `src/domain/shop/shop-contract.ts`
- Create: `src/domain/shop/shop-contract.test.ts`
- Create: `src/domain/master/master-settings-contract.ts`
- Create: `src/domain/master/master-settings-contract.test.ts`
- Create: `src/domain/order/order-contract.ts`
- Create: `src/domain/order/order-contract.test.ts`

- [ ] **Step 1: Write the failing test for `AuthSession` parsing**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAuthSession } from './auth-session.ts';

test('parseAuthSession accepts canonical camelCase session payload', () => {
  const parsed = parseAuthSession({
    kind: 'master',
    isAuthenticated: true,
    token: 'master-token',
    userId: 7,
    displayName: 'Master',
  });

  assert.equal(parsed.kind, 'master');
  assert.equal(parsed.isAuthenticated, true);
  assert.equal(parsed.token, 'master-token');
});

test('parseAuthSession rejects legacy snake_case payload', () => {
  assert.throws(() => parseAuthSession({
    is_authenticated: true,
    user_id: 7,
  }));
});
```

- [ ] **Step 2: Run the session contract test and verify it fails**

Run: `node --test src/domain/auth/auth-session.test.ts`
Expected: FAIL with missing module/export

- [ ] **Step 3: Write the failing shop/settings/order contract tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseShopContract, parseMenuContract } from './shop-contract.ts';
import { parseMasterSettingsContract } from './master-settings-contract.ts';
import { parseOrderContract } from './order-contract.ts';

test('shop contract accepts camelCase fields only', () => {
  const shop = parseShopContract({
    id: 101,
    slug: '101',
    name: 'Test Shop',
    deliveryEnabled: true,
    footerPhone: '123456',
  });

  assert.equal(shop.footerPhone, '123456');
  assert.throws(() => parseShopContract({ footer_phone: '123456' }));
});

test('menu contract preserves nested category/product structure', () => {
  const menu = parseMenuContract([
    {
      id: 'cat-1',
      name: '主食',
      products: [{ id: 'p-1', name: '汉堡', price: 12, imageUrl: '/uploads/a.jpg' }],
    },
  ]);

  assert.equal(menu[0].products[0].imageUrl, '/uploads/a.jpg');
});

test('master settings contract accepts only canonical keys', () => {
  const settings = parseMasterSettingsContract({
    mqttBroker: 'mqtt.example.com',
    defaultShopTier: 'standard',
  });

  assert.equal(settings.mqttBroker, 'mqtt.example.com');
  assert.throws(() => parseMasterSettingsContract({ mqtt_broker: 'mqtt.example.com' }));
});

test('order contract accepts dispatch and rider snapshots in camelCase', () => {
  const order = parseOrderContract({
    id: 1,
    orderNo: 'A001',
    status: 'awaitingCourier',
    dispatch: {
      status: 'active',
      dispatchRound: 1,
      currentPoolIndex: 0,
    },
    rider: {
      id: 9,
      name: 'Rider One',
      phone: '0600',
      status: 'available',
    },
  });

  assert.equal(order.dispatch?.dispatchRound, 1);
  assert.equal(order.rider?.status, 'available');
});
```

- [ ] **Step 4: Run the contract tests to verify they fail**

Run: `node --test src/domain/shop/shop-contract.test.ts src/domain/master/master-settings-contract.test.ts src/domain/order/order-contract.test.ts`
Expected: FAIL with missing modules/exports

- [ ] **Step 5: Implement the minimal Zod-based contract modules**

```ts
import { z } from 'zod';

export const authSessionSchema = z.object({
  kind: z.enum(['guest', 'user', 'admin', 'master', 'rider']),
  isAuthenticated: z.boolean(),
  token: z.string().optional(),
  userId: z.number().int().optional(),
  displayName: z.string().optional(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;

export function parseAuthSession(input: unknown): AuthSession {
  return authSessionSchema.parse(input);
}
```

```ts
import { z } from 'zod';

const menuProductSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  price: z.number(),
  imageUrl: z.string().optional(),
});

const menuCategorySchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  products: z.array(menuProductSchema),
});

const shopSchema = z.object({
  id: z.union([z.number(), z.string()]),
  slug: z.string(),
  name: z.string(),
  deliveryEnabled: z.boolean().optional(),
  footerPhone: z.string().optional(),
});

export function parseShopContract(input: unknown) { return shopSchema.parse(input); }
export function parseMenuContract(input: unknown) { return z.array(menuCategorySchema).parse(input); }
```

Mirror the same pattern for `MasterSettings` and `Order`/`Dispatch`/`Rider`.

- [ ] **Step 6: Run all domain contract tests and confirm they pass**

Run: `node --test src/domain/auth/auth-session.test.ts src/domain/shop/shop-contract.test.ts src/domain/master/master-settings-contract.test.ts src/domain/order/order-contract.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git -C "D:/ai/food/.worktrees/260311/food2astro" add src/domain/auth src/domain/shop src/domain/master src/domain/order && git -C "D:/ai/food/.worktrees/260311/food2astro" commit -m "feat: add canonical frontend domain contracts"
```

---

### Task 3: Add the new frontend HTTP/proxy/session foundation

**Files:**
- Create: `src/infra/http/http-json-client.ts`
- Create: `src/infra/http/http-json-client.test.ts`
- Create: `src/infra/http/proxy-response.ts`
- Create: `src/infra/http/proxy-response.test.ts`
- Create: `src/infra/auth/session-cookie.ts`
- Create: `src/infra/auth/session-cookie.test.ts`
- Modify: `src/lib/api-proxy.ts`
- Modify: `src/lib/master-auth.ts`
- Modify: `src/lib/user-api-route.ts`
- Verify: `src/lib/api-proxy.html-5xx.test.ts`, `src/lib/master-auth.test.ts`, `src/lib/user-api-route.test.ts`

- [ ] **Step 1: Write the failing client/proxy/session tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonEnvelope } from './http-json-client.ts';
import { buildProxyJsonResponse } from './proxy-response.ts';
import { resolveSessionToken } from '../auth/session-cookie.ts';

test('parseJsonEnvelope returns data for ok payloads', async () => {
  const response = new Response(JSON.stringify({ ok: true, data: { id: 1 } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await parseJsonEnvelope<{ id: number }>(response);
  assert.deepEqual(data, { id: 1 });
});

test('parseJsonEnvelope throws code and message for api errors', async () => {
  const response = new Response(JSON.stringify({ ok: false, error: { code: 'unauthorized', message: '请重新登录' } }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

  await assert.rejects(() => parseJsonEnvelope(response), /unauthorized/);
});

test('buildProxyJsonResponse wraps non-json upstream failures into canonical error envelope', async () => {
  const upstream = new Response('<html>502</html>', { status: 502, headers: { 'Content-Type': 'text/html' } });
  const proxied = await buildProxyJsonResponse(upstream);
  assert.equal(proxied.status, 502);
  assert.match(await proxied.text(), /"ok":false/);
  assert.match(await buildProxyJsonResponse(new Response('<html>502</html>', { status: 502, headers: { 'Content-Type': 'text/html' } })).then((r) => r.text()), /upstream_non_json/);
});

test('resolveSessionToken prefers authorization header then cookie token', () => {
  const request = new Request('https://example.com', { headers: { authorization: 'Bearer from-header' } });
  const fromHeader = resolveSessionToken(request, { get: () => ({ value: 'cookie-token' }) }, 'master_token');
  assert.equal(fromHeader, 'Bearer from-header');
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test src/infra/http/http-json-client.test.ts src/infra/http/proxy-response.test.ts src/infra/auth/session-cookie.test.ts`
Expected: FAIL with missing modules/exports

- [ ] **Step 3: Implement the minimal infra helpers**

```ts
import { isApiSuccess } from '../../domain/api/api-envelope.ts';

export async function parseJsonEnvelope<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (isApiSuccess(payload)) return payload.data as T;
  const code = payload?.error?.code || 'unknown_error';
  const message = payload?.error?.message || 'Unknown error';
  throw new Error(`${code}: ${message}`);
}
```

```ts
import { createApiError } from '../../domain/api/api-envelope.ts';

export async function buildProxyJsonResponse(upstream: Response): Promise<Response> {
  const text = await upstream.text();
  const contentType = upstream.headers.get('content-type') || 'application/json';

  if (upstream.status >= 500 && !contentType.includes('application/json')) {
    return new Response(JSON.stringify(createApiError('upstream_non_json', `Upstream error (${upstream.status})`)), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': contentType },
  });
}
```

```ts
type CookieValue = { value: string } | undefined;
type CookieStore = { get: (key: string) => CookieValue };

export function resolveSessionToken(request: Request, cookies: CookieStore | undefined, cookieKey: string): string {
  const auth = request.headers.get('authorization')?.trim() || '';
  if (auth) return auth;
  const token = cookies?.get(cookieKey)?.value?.trim() || '';
  return token ? `Bearer ${token}` : '';
}
```

- [ ] **Step 4: Rewire the old helpers onto the new foundation**

Replace `src/lib/master-auth.ts` with a thin wrapper:

```ts
import { resolveSessionToken } from '../infra/auth/session-cookie.ts';

type CookieValue = { value: string } | undefined;
type CookieStore = { get: (key: string) => CookieValue };

export function resolveMasterAuth(request: Request, cookies?: CookieStore): string {
  return resolveSessionToken(request, cookies, 'master_token');
}
```

Replace `src/lib/api-proxy.ts` to delegate non-JSON error mapping to `buildProxyJsonResponse()` instead of returning `success: false` payloads.

- [ ] **Step 5: Run the new and existing tests**

Run: `node --test src/infra/http/http-json-client.test.ts src/infra/http/proxy-response.test.ts src/infra/auth/session-cookie.test.ts src/lib/api-proxy.html-5xx.test.ts src/lib/master-auth.test.ts src/lib/user-api-route.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C "D:/ai/food/.worktrees/260311/food2astro" add src/infra src/lib/api-proxy.ts src/lib/master-auth.ts src/lib/user-api-route.ts && git -C "D:/ai/food/.worktrees/260311/food2astro" commit -m "feat: add frontend api foundation"
```

---

### Task 4: Add foos2Go DTOs and canonical session/shop endpoints

**Files:**
- Create: `D:/ai/food/.worktrees/260311/foos2Go/internal/http/dto/session_dto.go`
- Create: `D:/ai/food/.worktrees/260311/foos2Go/internal/http/dto/shop_dto.go`
- Create: `D:/ai/food/.worktrees/260311/foos2Go/internal/http/dto/master_dto.go`
- Create: `D:/ai/food/.worktrees/260311/foos2Go/internal/http/dto/order_dto.go`
- Create: `D:/ai/food/.worktrees/260311/foos2Go/internal/http/session_routes_test.go`
- Create: `D:/ai/food/.worktrees/260311/foos2Go/internal/http/shop_routes_test.go`
- Modify: actual foos2Go auth/session handlers
- Modify: actual foos2Go shop/menu handlers
- Modify: `internal/handlers/master_routes.go`

- [ ] **Step 1: Write the failing Go tests for canonical session and shop responses**

```go
package http_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestAdminSessionRouteReturnsCanonicalEnvelope(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/session/admin", nil)
	rec := httptest.NewRecorder()

	ServeAdminSession(rec, req)

	if rec.Code != 200 {
		t.Fatalf("unexpected status: %d", rec.Code)
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}

	if body["ok"] != true {
		t.Fatalf("expected ok=true, got %#v", body)
	}
}

func TestShopRouteReturnsCamelCaseFieldsOnly(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/shops/101", nil)
	rec := httptest.NewRecorder()

	ServeShop(rec, req)

	if rec.Code != 200 {
		t.Fatalf("unexpected status: %d", rec.Code)
	}

	body := rec.Body.String()
	if !strings.Contains(body, `"deliveryEnabled"`) {
		t.Fatalf("expected camelCase field in body: %s", body)
	}
	if strings.Contains(body, `"delivery_enabled"`) {
		t.Fatalf("unexpected snake_case field in body: %s", body)
	}
}
```

- [ ] **Step 2: Run the Go tests and verify they fail**

Run: `go test ./internal/http -run 'Test(AdminSessionRouteReturnsCanonicalEnvelope|ShopRouteReturnsCamelCaseFieldsOnly)' -count=1`
Expected: FAIL because handlers/DTOs do not exist or still emit legacy fields

- [ ] **Step 3: Implement the canonical DTO layer**

```go
package dto

type AuthSessionResponse struct {
	Kind            string `json:"kind"`
	IsAuthenticated bool   `json:"isAuthenticated"`
	Token           string `json:"token,omitempty"`
	UserID          int64  `json:"userId,omitempty"`
	DisplayName     string `json:"displayName,omitempty"`
}
```

```go
package dto

type ShopResponse struct {
	ID              int64  `json:"id"`
	Slug            string `json:"slug"`
	Name            string `json:"name"`
	DeliveryEnabled bool   `json:"deliveryEnabled"`
	FooterPhone     string `json:"footerPhone,omitempty"`
}

type MenuProductResponse struct {
	ID       int64   `json:"id"`
	Name     string  `json:"name"`
	Price    float64 `json:"price"`
	ImageURL string  `json:"imageUrl,omitempty"`
}
```

Apply the same DTO-first approach for master settings, rider, dispatch, and order snapshot responses.

- [ ] **Step 4: Update the handlers to return `api.Success(dtoValue)` / `api.Error(code, message)` only**

Minimal target:
- session endpoints use `dto.AuthSessionResponse`
- shop/menu endpoints use `dto.ShopResponse` and menu DTOs
- master dashboard/settings endpoints use camelCase DTOs

Do not preserve `snake_case` fallback fields in the new responses.

- [ ] **Step 5: Run the Go tests to verify they pass**

Run: `go test ./internal/http -run 'Test(AdminSessionRouteReturnsCanonicalEnvelope|ShopRouteReturnsCamelCaseFieldsOnly)' -count=1 && go test ./internal/... -count=1`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C "D:/ai/food/.worktrees/260311/foos2Go" add internal/http/api internal/http/dto internal/http internal/handlers && git -C "D:/ai/food/.worktrees/260311/foos2Go" commit -m "feat: add canonical http dto contracts"
```

---

### Task 5: Rewire `food2astro` BFF routes onto the new foundation

**Files:**
- Modify: `src/pages/api/master/login.ts`
- Modify: `src/pages/api/master/logout.ts`
- Modify: `src/pages/api/admin/login.ts`
- Modify: `src/pages/api/admin/logout.ts`
- Modify: `src/pages/api/auth/check.ts`
- Modify: `src/pages/api/shop/list.ts`
- Create: `src/application/auth/load-session-query.ts`
- Create: `src/application/auth/load-session-query.test.ts`
- Verify: existing route tests plus new tests

- [ ] **Step 1: Write the failing test for session query and `auth/check` route output**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSessionEnvelope } from './load-session-query.ts';

test('buildSessionEnvelope creates canonical payload for authenticated master session', () => {
  const payload = buildSessionEnvelope({
    kind: 'master',
    token: 'master-token',
    userId: 1,
    displayName: 'Master',
  });

  assert.deepEqual(payload, {
    ok: true,
    data: {
      kind: 'master',
      isAuthenticated: true,
      token: 'master-token',
      userId: 1,
      displayName: 'Master',
    },
  });
});
```

Add a source-level assertion for `src/pages/api/auth/check.ts` requiring the route to return `ok/data` instead of `success`.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test src/application/auth/load-session-query.test.ts src/lib/user-api-route.test.ts`
Expected: FAIL because the query/helper does not exist or route still uses legacy output

- [ ] **Step 3: Implement the session query helper**

```ts
import { createApiSuccess } from '../../domain/api/api-envelope.ts';
import type { AuthSession } from '../../domain/auth/auth-session.ts';

export function buildSessionEnvelope(input: {
  kind: AuthSession['kind'];
  token?: string;
  userId?: number;
  displayName?: string;
}) {
  return createApiSuccess({
    kind: input.kind,
    isAuthenticated: true,
    token: input.token,
    userId: input.userId,
    displayName: input.displayName,
  });
}
```

- [ ] **Step 4: Update the BFF routes to use the new helpers**

Example route body shape:

```ts
import { createApiSuccess, createApiError } from '../../../domain/api/api-envelope.ts';

return new Response(JSON.stringify(createApiSuccess({
  kind: 'admin',
  isAuthenticated: true,
  token,
})), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
```

For failed auth/logout paths, return `createApiError('unauthorized', '请重新登录')` or the specific route error.

- [ ] **Step 5: Run the route and query tests**

Run: `node --test src/application/auth/load-session-query.test.ts src/lib/user-api-route.test.ts src/lib/master-auth.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C "D:/ai/food/.worktrees/260311/food2astro" add src/application/auth src/pages/api/master/login.ts src/pages/api/master/logout.ts src/pages/api/admin/login.ts src/pages/api/admin/logout.ts src/pages/api/auth/check.ts src/pages/api/shop/list.ts && git -C "D:/ai/food/.worktrees/260311/food2astro" commit -m "feat: rewire bff routes to canonical session contracts"
```

---

### Task 6: Delete obsolete compatibility paths and verify the foundation

**Files:**
- Modify/Delete: legacy helpers proven obsolete after Tasks 1–5
- Verify: `src/lib/api-proxy.ts`, `src/lib/master-auth.ts`, `src/lib/user-api-route.ts`, migrated routes, foos2Go DTO handlers

- [ ] **Step 1: Write the failing source-level test that forbids legacy response keys in the migrated foundation**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const apiProxyPath = resolve(process.cwd(), 'src/lib/api-proxy.ts');
const authCheckPath = resolve(process.cwd(), 'src/pages/api/auth/check.ts');

test('foundation routes and helpers no longer emit legacy success envelope keys', async () => {
  const [apiProxySource, authCheckSource] = await Promise.all([
    readFile(apiProxyPath, 'utf8'),
    readFile(authCheckPath, 'utf8'),
  ]);

  assert.doesNotMatch(apiProxySource, /success:\s*false/);
  assert.doesNotMatch(authCheckSource, /success:\s*true/);
  assert.match(authCheckSource, /ok:\s*true|createApiSuccess/);
});
```

- [ ] **Step 2: Run the source-level test to verify it fails before cleanup**

Run: `node --test src/domain/api/foundation-source.test.ts`
Expected: FAIL because migrated helpers or routes still contain legacy keys

- [ ] **Step 3: Remove the obsolete compatibility branches**

Cleanup targets once the new foundation is green:
- delete `allowFallbackToken` behavior from `src/lib/master-auth.ts`
- remove `success/error/code` envelope builders from `src/lib/api-proxy.ts`
- remove old snake_case-only field builders in the migrated session/shop paths

Keep only the canonical helper chain:
- `createApiSuccess` / `createApiError`
- `parseJsonEnvelope`
- `buildProxyJsonResponse`
- `resolveSessionToken`

- [ ] **Step 4: Run the full verification suite**

Run: `node --test src/domain/api/api-envelope.test.ts src/domain/auth/auth-session.test.ts src/domain/shop/shop-contract.test.ts src/domain/master/master-settings-contract.test.ts src/domain/order/order-contract.test.ts src/infra/http/http-json-client.test.ts src/infra/http/proxy-response.test.ts src/infra/auth/session-cookie.test.ts src/application/auth/load-session-query.test.ts src/lib/api-proxy.html-5xx.test.ts src/lib/master-auth.test.ts src/lib/user-api-route.test.ts && pnpm build && go test ./internal/... -count=1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "D:/ai/food/.worktrees/260311/food2astro" add src/domain src/infra src/application src/lib src/pages/api docs/superpowers/plans/2026-03-31-shared-contracts-and-api-foundation.md && git -C "D:/ai/food/.worktrees/260311/foos2Go" add internal/http internal/handlers && git -C "D:/ai/food/.worktrees/260311/food2astro" commit -m "refactor: replace legacy api compatibility foundation"
```

---

## Self-Review

### Spec coverage check
- 统一领域模型：Task 2 覆盖 `Shop` / `Order` / `Rider` / `Dispatch` / `MasterSettings` / `AuthSession`
- 统一错误模型：Task 1 覆盖 `ok/data/error`
- 前端 `domain / infra / application` 基座：Tasks 2–5 覆盖
- BFF 只保留 4 类职责：Tasks 3 与 5 覆盖
- 后端 DTO / envelope / handler 收口：Task 4 覆盖
- 删除旧兼容与重复路径：Task 6 覆盖

### Placeholder scan
- 无 `TBD`、`TODO`、`implement later`
- 每个任务都给出明确文件、测试、命令和实现骨架

### Type consistency check
- 前端统一使用 `ApiSuccess` / `ApiError`
- JSON 对外统一 camelCase
- Session / Shop / Order / Dispatch / Rider / MasterSettings 命名在各任务中保持一致

---

Plan complete and saved to `docs/superpowers/plans/2026-03-31-shared-contracts-and-api-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
