# Master Riders Single Contract Design

**Goal:** 把 master riders 链路从页面层兼容多种 legacy shape，收口为“单入口 + 单契约”，让页面层只消费稳定的 canonical 数据。

**Scope:** 仅收口 `master?tab=riders` 的 impersonate 取数链路与对应测试；不改 master 页面结构、不新增 master riders 聚合接口、不改 foos2Go 后端。

## Background

当前 `src/lib/master-rider-status-loader.ts` 之所以重新有数据，是因为它暂时回退到了“兼容模式”：

- impersonate 同时兼容顶层 `token` 与 `data.token`
- riders 列表同时兼容 `riders / rows / items / data.*`
- 页面层直接承担了后端 legacy 契约的不稳定性

这能临时恢复数据，但不够稳定。真正的问题不是接口一定会失败，而是页面代码在猜上游到底返回什么 shape。只要这种猜测存在，复杂度就会继续扩散。

## Design Decision

采用“**单入口 + 单契约**”方案：

1. `src/pages/api/master/impersonate-shop.ts` 成为 **唯一兼容边界**
2. 该代理负责把后端 legacy impersonate 返回翻译成 canonical envelope
3. `src/lib/master-rider-status-loader.ts` 只消费 canonical impersonate 数据
4. riders 页面聚合逻辑（跨店遍历、去重、状态分组）仍保留在 loader 中
5. 这一步 **不新增** `/api/master/riders`，也 **不改** foos2Go 后端

## Architecture

数据流改为：

`/master?tab=riders`
→ `loadMasterRiderStatusData()`
→ 站内 `/api/master/impersonate-shop?id=<shopId>`
→ Astro 代理请求后端 legacy `/api/master/impersonate-shop`
→ 代理输出 canonical `{ ok, data }`
→ loader 从 canonical `data.token` 取 token
→ loader 请求 `/api/admin/riders`
→ loader 去重、分组、汇总
→ 页面渲染

### Why this boundary

- 兼容逻辑只留在一个文件里，后续维护点单一
- 页面层不再知道 `success/token/rows/items` 这些旧形态
- 如果未来 foos2Go 真的升级成 canonical，只改代理层即可
- 避免再次引入新的聚合接口，减少链路复杂度

## API Contracts

### 1. Canonical impersonate contract for page consumers

`src/pages/api/master/impersonate-shop.ts` 对页面固定输出：

```json
{
  "ok": true,
  "data": {
    "slug": "101",
    "token": "xxx",
    "impersonated": true
  }
}
```

失败时固定输出 canonical error envelope，不把 upstream legacy shape 直接泄漏给页面。

### 2. Upstream legacy contract handled only inside proxy

代理层内部兼容 foos2Go 当前 legacy 返回：

```json
{
  "success": true,
  "slug": "101",
  "token": "xxx",
  "impersonated": true
}
```

代理负责做严格字段校验：

- `success !== true` → 失败
- `slug` 为空 → 失败
- `token` 为空 → 失败
- `impersonated !== true` 可视为失败或与 `success` 一起校验，保持明确，不做猜测补偿

### 3. Loader contract after收口

`src/lib/master-rider-status-loader.ts` 只接受：

- impersonate: canonical `{ ok, data }`
- token 来源：`data.token`
- slug 来源：`data.slug`

明确删除页面层的以下兼容：

- 顶层 `token`
- `success: true`
- `data.token` 之外的 fallback 来源
- impersonate 返回的 shape 猜测逻辑

### 4. Riders payload contract for this phase

本轮先保持保守收口：

- `/api/admin/riders` 暂时仍按当前主格式使用：`{ success: true, riders: [] }`
- **不在本轮** 再新增 riders proxy

原因：当前最大的不稳定点在 impersonate 层；先收最大兼容面，避免一次扩太多范围。

## Error Handling

### Proxy layer (`src/pages/api/master/impersonate-shop.ts`)

- 未登录 master → `401`
- shop id 非法 → `400`
- upstream 非 2xx → 透传状态或统一为可解释错误
- upstream JSON 非法 / 字段缺失 → `502`
- 下游始终收到规范化错误 envelope

### Loader (`src/lib/master-rider-status-loader.ts`)

- master auth 为空 → 返回稳定空 payload
- 单店 impersonate 失败 → 跳过该店，继续其他店
- 单店 riders 拉取失败 → 跳过该店，继续其他店
- 整体异常 → 返回稳定空 payload + `error`
- 不再做 shape 猜测；字段不合法直接视为失败

## File Changes

### Modify
- `src/pages/api/master/impersonate-shop.ts`
  - 支持 GET
  - 兼容 upstream legacy
  - 对下游固定输出 canonical
- `src/lib/master-rider-status-loader.ts`
  - 改为只请求站内 proxy
  - 删除 impersonate legacy fallback
  - 保留遍历店铺、去重、状态分组
- `src/lib/master-rider-status-loader.test.ts`
  - 改成只验证 canonical impersonate 输入
  - 保留跨店去重
- `src/pages/api/master/impersonate-shop.test.ts`
  - 增补 legacy → canonical 的代理测试

### Explicitly do not change
- `src/pages/master/index.astro` tab 架构
- `src/components/master/*` UI 样式
- foos2Go 后端接口行为
- 新增 `/api/master/riders`

## Testing Plan

必须通过：

1. `node --test src/pages/api/master/impersonate-shop.test.ts`
   - legacy upstream → canonical downstream
   - GET / POST 均可
   - 缺 token / slug / success 时返回失败

2. `node --test src/lib/master-rider-status-loader.test.ts`
   - 只认 canonical impersonate
   - 保留跨店去重
   - riders 主格式可继续工作

3. `node --test src/tests/pages/master/master-riders-ui.test.ts`
   - 确保现有 UI 契约不被破坏

4. `pnpm build`
   - 确保 Astro 路由与 SSR 构建无回归

## Acceptance Criteria

完成后必须满足：

- 页面层只认一种 impersonate 返回格式
- compatibility 只存在于 `src/pages/api/master/impersonate-shop.ts`
- `master-rider-status-loader.ts` 比当前兼容版更短、更薄
- riders 当前已恢复的数据继续可见
- future backend changes 不会再直接把复杂度扩散到页面层

## Non-Goals

以下不在本轮内：

- 把 `/api/admin/riders` 也升级为 canonical
- 新建 master riders 聚合接口
- 改造 foos2Go 为 canonical API
- 调整 riders tab 视觉样式或交互
