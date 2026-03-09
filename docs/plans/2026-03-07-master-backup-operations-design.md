# Master Backup Operations Design

## 背景

Astro 版 `/master` 当前已经补齐了第二波系统设置，并具备：
- 备份计划配置
- 图片 / R2 配置
- MQTT / 分类 / 收款码等系统级设置

但相对参考页 `meituanGo/static/master.html`，仍缺少两类高风险但高价值的后台操作：
- 数据备份与还原
- 代码版本备份

后端现状已经具备相应接口能力：
- `/api/master/manage` 支持 `trigger_backup`
- `meituanAstro/src/pages/api/master/restore.ts` 已代理 `/api/master/restore`
- `meituanAstro/src/pages/api/master/backup.ts` 已代理 `/api/master/backup`
- Go 端 `MasterBackupCode` 已支持 `list/create/delete`

因此本轮不需要先发明新协议，而是把已有能力接回 Astro 版 `master` 设置页。

## 目标

在 Astro 版 `/master` 的 `全局设置` tab 中补齐两张操作卡片：
- 数据备份与还原
- 代码版本备份

让超级管理员可以在新控制台中完成：
- 立即执行一次系统数据备份
- 上传 zip 包进行系统还原
- 创建代码版本备份
- 查看已有代码备份列表
- 删除已有代码备份

## 非目标

本轮不做：
- 单独新建 `备份中心` tab
- 代码备份恢复按钮
- 伪造浏览器真实下载流
- 复杂的任务进度条和后台轮询
- 自动备份计划本身的后端重构

## 方案比较

### 方案 A：在设置页中新增两张独立卡片（推荐）

做法：
- 继续使用现有 `全局设置` tab
- 增加：
  - `数据备份与还原`
  - `代码版本备份`

优点：
- 与当前 Astro 组件化结构一致
- 改动边界清楚
- 高风险操作有独立视觉隔离
- 不会把现有“备份配置”卡片搞得过于复杂

缺点：
- 设置页卡片数量继续增加

### 方案 B：并入现有“备份设置”卡片

做法：
- 把自动备份配置、手动备份、还原、代码备份都堆进同一个组件

优点：
- 所有备份相关能力集中在一起

缺点：
- 卡片会变得过重
- 易造成误操作
- 前端代码复杂度上升很快

### 方案 C：单独做“备份中心”tab

做法：
- 新增 tab，专门放恢复与备份运维能力

优点：
- 后续扩展性好

缺点：
- 对当前信息架构改动更大
- 这次范围偏大，YAGNI

## 选型结论

采用方案 A：在 `全局设置` 中新增两张独立操作卡片。

原因：
- 能最低风险接入已有后端接口
- 高风险动作有清晰边界
- 符合当前 Astro 版 `master` 的卡片组织方式

## 组件设计

### 1. 数据备份与还原卡片

新增组件：
- `meituanAstro/src/components/master/MasterDataBackupCard.astro`

功能分为两部分。

#### 立即备份

交互：
- 点击按钮后请求 `/api/master/manage`，action 为 `trigger_backup`
- 显示：
  - 处理中
  - 成功
  - 失败

说明：
- 当前后端返回的是备份成功提示与文件名，不是流式下载
- 所以前端这期只做“执行并反馈”，不伪装成真实下载

#### 上传 zip 还原

交互：
- 选择 `.zip` 文件
- 点击还原按钮
- 二次确认
- 提交到 `/api/master/restore`

要求：
- 没选文件时禁止提交
- 成功后提示并刷新页面
- 失败时清晰提示错误

### 2. 代码版本备份卡片

新增组件：
- `meituanAstro/src/components/master/MasterCodeBackupCard.astro`

交互能力：
- 输入备份名称
- 创建代码备份
- 加载备份列表
- 删除某个备份

后端接口：
- `/api/master/backup`

action：
- `list`
- `create`
- `delete`

本轮限制：
- 不暴露代码 restore 按钮
- 因为后端当前 restore 只是 simulated，不适合在新 UI 里做成真实恢复能力

## 页面接入设计

继续使用：
- `meituanAstro/src/pages/master/index.astro`

把两张卡片加入现有 `settings-grid` 中，建议顺序：
- 备份配置
- 数据备份与还原
- 代码版本备份

这样能让“配置”和“操作”相邻，但不会混成一个大块。

## 脚本设计

在 `index.astro` inline script 中增加：

### 数据备份与还原
- `window.triggerMasterDataBackup()`
- `window.restoreMasterSystem(form)`

### 代码备份
- `window.loadMasterCodeBackups()`
- `window.createMasterCodeBackup(form)`
- `window.deleteMasterCodeBackup(name)`

要求：
- 每个动作都必须显式反馈
- 操作过程中按钮 disabled
- 列表加载失败只影响本卡片，不影响整页

## 风险控制

### 还原操作

这是本轮最危险动作，必须：
- 明显危险提示
- 二次确认
- 禁止空文件提交

### 代码备份删除

要求：
- 删除前二次确认
- 删除成功后刷新列表

### 页面稳定性

若任一操作失败：
- 只更新本卡片反馈区
- 不让整个 `settings` tab 报错

## 测试设计

### 单元测试

本轮优先补最小测试，重点放在：
- 如新增 helper，则先测试 helper
- 已有 settings tests 保持全绿

### 手工验证

本地运行：
- `pnpm run dev`

手工验证：
- `http://localhost:3000/master?tab=settings`

检查：
- 可以点击“立即备份”并看到成功/失败反馈
- 可以选择 zip 文件并执行还原
- 可以创建代码备份
- 可以看到代码备份列表
- 可以删除代码备份

## 预期结果

完成后，Astro 版 `/master` 将补上旧版最关键的一组运维能力：
- 数据备份
- 数据还原
- 代码版本备份管理

同时仍保持当前组件化结构，不把控制台重新拉回旧版的大模板脚本模式。
