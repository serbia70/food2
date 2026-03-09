# Admin Data Export Fill Design

## Goal
导出菜单时，除下载 JSON 文件外，同时把同一份 JSON 写入“数据导入”文本框，便于复制/编辑/再次导入。

## Context
- 商户后台“数据导入/导出”位于 `meituanAstro/src/components/admin/TabData.astro`。
- 导出逻辑在 `meituanAstro/src/scripts/admin/data.ts`。

## Approach (Chosen)
1) 生成导出 payload 后，立刻写入 `#import-area`。
2) 继续触发下载流程，保持现有行为不变。

## Data Flow
- `exportData()` 构建 `payload`。
- `textarea.value = JSON.stringify(payload, null, 2)`。
- 生成 Blob 并触发下载。

## Error Handling
- 如果找不到 `#import-area`，只执行下载，不阻断导出。

## Non-goals
- 新增按钮或改变导出文件格式。
