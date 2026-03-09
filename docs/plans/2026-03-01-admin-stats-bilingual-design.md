# Admin Stats Bilingual Design

## Goal
在商家后台统计页提供中文/塞尔维亚语双语文案，并默认展示当天的统计数据（自动设置日期并查询）。

## Context
- 统计页位于 `meituanAstro/src/components/admin/TabStats.astro`。
- 前端统计逻辑在 `meituanAstro/src/scripts/admin/stats.ts`。
- 后端统计 API 为 `/api/admin/stats`，返回 `stats` 和 `topItems`。

## Approach (Chosen)
1) 文案双语：固定文案采用 `中文 / Српски` 同行显示。包含标题、筛选项、统计卡片标签、表头、空数据与错误提示。
2) 默认今天：页面加载时把 `#stats-start` 与 `#stats-end` 设为本地今天（YYYY-MM-DD），并在 DOMContentLoaded 后自动调用 `loadStats()`。

## UI Copy (Examples)
- 营业数据 / Poslovni podaci
- 全部 / Sve
- 外卖 / Dostava
- 堂食 / U restoranu
- 总营业额 / Ukupan promet
- 总订单 / Ukupno porudžbina
- 销量排名 / Rang prodaje
- 量 / Količina
- 额 / Iznos
- 暂无数据 / Nema podataka
- 查询失败 / Neuspešan upit
- 请选择日期范围 / Izaberite opseg datuma

## Data Flow
- `loadStats()` 使用 start/end/type 构造请求。
- 请求成功后：更新 `#val-revenue`、`#val-orders` 与 `#stats-table`。
- 请求失败或无数据：显示双语提示。

## Error Handling
- 请求失败：弹窗提示 `查询失败 / Neuspešan upit`。
- 未选择日期：弹窗提示 `请选择日期范围 / Izaberite opseg datuma`。

## Non-goals
- 语言切换开关（仅固定双语展示）。
- 翻译菜品名/动态内容。
