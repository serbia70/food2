# Table Details Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 降低桌号详情请求次数与并发压力，并统一错误处理，保持现有行为不变。

**Architecture:** 在 `table-details.ts` 内新增缓存与并发控制工具，集中处理错误与回退文案；对外 API 不变。

**Tech Stack:** TypeScript (module scripts), Astro

---

### Task 1: 增加请求缓存与并发控制

**Files:**
- Modify: `meituanAstro/src/scripts/shop/table-details.ts`

**Step 1: 写一个最小化失败验证（手工）**

```text
连续点击同一桌号的“订单详情” 3 次
预期：Network 里请求次数减少（同 key 复用），弹窗仍正常显示
```

**Step 2: 增加缓存与并发控制工具**

在 `createTableDetails` 内新增：
```ts
const CONCURRENCY_LIMIT = 3;
const requestCache = new Map<string, Promise<any[]>>();

const makeCacheKey = (key: string) => `${shopSlug}|${key}`;

const runWithConcurrency = async <T>(limit: number, tasks: Array<() => Promise<T>>): Promise<T[]> => {
  const results: T[] = [];
  const queue = tasks.slice();
  const workers = Array.from({ length: limit }).map(async () => {
    while (queue.length) {
      const task = queue.shift();
      if (!task) return;
      results.push(await task());
    }
  });
  await Promise.all(workers);
  return results;
};

const fetchOrdersCached = async (key: string) => {
  const cacheKey = makeCacheKey(key);
  if (requestCache.has(cacheKey)) return requestCache.get(cacheKey)!;
  const p = safeFetchOrders(`/api/order/by_table?slug=${encodeURIComponent(shopSlug)}&table=${encodeURIComponent(key)}`);
  requestCache.set(cacheKey, p);
  const result = await p;
  if (!result || result.length === 0) requestCache.delete(cacheKey);
  return result;
};
```

**Step 3: 使用并发控制获取订单**

```ts
const tasks = keys.map((key) => () => fetchOrdersCached(key));
const ordersList = await runWithConcurrency(CONCURRENCY_LIMIT, tasks);
for (const orders of ordersList) {
  for (const o of orders) { ... }
}
```

**Step 4: 手工验证**

```text
打开桌号详情多次，确认请求次数降低、弹窗内容一致
```

**Step 5: Commit**

```bash
git commit -m "perf: cache table details requests"
```

---

### Task 2: 统一错误处理与降噪

**Files:**
- Modify: `meituanAstro/src/scripts/shop/table-details.ts`

**Step 1: 统一错误回退**

确保 `safeFetchOrders` 在 `res.ok` 之外不解析 JSON，并返回空数组；在 `openTableDetails` 入口捕获异常并显示：
```ts
showTableDetailsModal(`桌号 ${displayNum} 订单详情 / Sto ${displayNum}`, ['加载失败，请稍后重试'], 0);
```

**Step 2: 可选 debug 开关**

```ts
const debug = false;
const log = (...args: any[]) => debug && console.log(...args);
```

**Step 3: 手工验证**

```text
断网或让接口返回异常，点击“订单详情”应出现“加载失败，请稍后重试”，控制台无刷屏日志。
```

**Step 4: Commit**

```bash
git commit -m "refactor: unify table details error handling"
```
