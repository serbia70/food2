# Proxy Resilience Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 提升 Astro 代理层面对上游 API 中断、超时、响应体读取失败时的健壮性，减少本地开发时的连锁 502/404 噪音，并返回更稳定的错误结构。

**Architecture:** 不改业务页面逻辑，先修代理层。统一 `api-proxy.ts`、`api/order/status.ts`、`api/stream/[slug].ts` 的失败响应风格，对 undici terminated/other side closed 这类中断做兜底，确保失败时仍返回可诊断的 JSON 或受控 stream 错误。

**Tech Stack:** Astro API routes, fetch/undici, TypeScript

---

### Task 1: 增强 api-proxy.ts 的错误处理

**Files:**
- Modify: `meituanAstro/src/lib/api-proxy.ts`

**Step 1: 统一失败分类**

至少区分：
- timeout
- upstream closed connection
- generic backend unavailable

**Step 2: 保护 response body 读取**

对 `await res.text()` 读取中途失败的情况增加 try/catch，避免再次抛出未处理异常。

**Step 3: 返回更稳定 JSON**

确保失败时总能返回：

```json
{ "success": false, "error": "...", "code": "..." }
```

---

### Task 2: 统一 order/status 代理行为

**Files:**
- Modify: `meituanAstro/src/pages/api/order/status.ts`

**Step 1: 复用与 api-proxy 一致的失败语义**

不要继续返回风格不一致的错误结构。

**Step 2: 保护上游响应体读取**

对 `await res.text()` 增加兜底，避免 upstream 断开时抛未控异常。

---

### Task 3: 优化 stream 代理失败处理

**Files:**
- Modify: `meituanAstro/src/pages/api/stream/[slug].ts`

**Step 1: 区分 stream unavailable 与 upstream closed**

给出更明确的错误码和错误文案。

**Step 2: 保持 response 受控**

避免因为 upstream 断流导致 Astro route 直接抛出未处理错误。

---

### Task 4: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-proxy-resilience-fix.md`

**Step 1: 记录完成范围**

记录本轮已统一：
- `api-proxy.ts`
- `/api/order/status`
- `/api/stream/[slug]`

**Step 2: 记录后续范围**

后续若还需要，再考虑页面级降级 UI。
