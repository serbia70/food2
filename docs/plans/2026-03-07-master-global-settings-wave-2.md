# Master Global Settings Wave 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Astro 版 `/master` 的 `全局设置` tab 补齐第二波系统级设置卡片，覆盖页脚、汇率/费率、微信联系、图片/R2 与备份配置。

**Architecture:** 延续当前 Astro 版 master 的组件化结构，不回退到旧版大单文件页面。通过扩展 `master-settings-view` 统一整理 `/api/master/init` 返回的原始 `settings`，再以多张独立设置卡片接入 `/api/master/manage` 的分组提交与显式反馈，确保每组设置互不牵连、失败可降级。

**Tech Stack:** Astro, TypeScript, browser form handlers, existing `/api/master/init`, existing `/api/master/manage`

---

### Task 1: 扩展全局设置视图模型

**Files:**
- Modify: `meituanAstro/src/lib/master-settings-view.ts`
- Modify: `meituanAstro/src/lib/master-settings-view.test.ts`

**Step 1: Write the failing test**

在 `meituanAstro/src/lib/master-settings-view.test.ts` 增加测试，覆盖：
- 能从原始 `settings` 提取 `footerText` / `footerPhone` / `footerCopyright`
- 能提取 `exchangeRate` / `displayFinalRate` / `rateBase` / `rateOffset` / `rateStep`
- 能提取 `wechatId` / `wechatContactQr`
- 能提取 `r2PublicDomain` / `uploadStrictR2`
- 能提取 `backupTime` / `backupRetention` / `backupTarget` / `backupHost` / `backupUser` / `backupPass` / `backupPath` / `backupEndpoint` / `backupBucket`
- 缺失字段时返回稳定默认值

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-settings-view.test.ts`
Expected: FAIL，因为这些新字段和结构尚未在 helper 中暴露。

**Step 3: Write minimal implementation**

扩展 `buildMasterSettingsView(settings)`，让它额外输出：
- `footer`
- `rate`
- `wechat`
- `storage`
- `backup`

要求：
- 字符串字段回退为空字符串
- 数字字段回退为合理默认值或 `0`
- 布尔字段回退为 `false`
- 保持现有 pricing 字段兼容，不破坏已上线卡片

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-settings-view.test.ts`
Expected: PASS

---

### Task 2: 新增页脚设置卡片

**Files:**
- Create: `meituanAstro/src/components/master/MasterFooterSettingsCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Write the UI target**

卡片包含：
- `footerText`
- `footerPhone`
- `footerCopyright`
- 提交按钮
- 反馈区域

**Step 2: Render card with defaults**

卡片默认值来自 `settingsView.footer`。

**Step 3: Add minimal submit behavior**

在 `index.astro` inline script 中增加独立 handler，向 `/api/master/manage` 提交：

```json
{
  "action": "update_footer_settings",
  "payload": {
    "footerText": "...",
    "footerPhone": "...",
    "footerCopyright": "..."
  }
}
```

如果后端返回失败：
- 显示明确错误
- 不清空用户输入

**Step 4: Keep current settings layout intact**

不要破坏已有：
- `MasterPricingSettingsCard`
- `MasterSecurityCard`

---

### Task 3: 新增汇率与费率设置卡片

**Files:**
- Create: `meituanAstro/src/components/master/MasterRateSettingsCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Write the UI target**

卡片包含：
- `exchangeRate`
- `displayFinalRate`
- `rateBase`
- `rateOffset`
- `rateStep`
- 提交按钮与反馈区域

**Step 2: Use normalized defaults**

默认值来自 `settingsView.rate`。

**Step 3: Add front-end validation**

提交前至少验证：
- 所有数值字段都能转为数字
- 非法值时显示错误，不发请求

**Step 4: Add submit behavior**

向 `/api/master/manage` 提交：

```json
{
  "action": "update_rate_settings",
  "payload": {
    "exchangeRate": 0,
    "displayFinalRate": 0,
    "rateBase": 0,
    "rateOffset": 0,
    "rateStep": 0
  }
}
```

---

### Task 4: 新增微信联系设置卡片

**Files:**
- Create: `meituanAstro/src/components/master/MasterWechatSettingsCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Render card**

卡片至少包含：
- `wechatId`
- `wechatContactQr`
- 保存按钮
- 反馈区域

**Step 2: Fill from settings view**

默认值来自 `settingsView.wechat`。

**Step 3: Add submit behavior**

向 `/api/master/manage` 提交：

```json
{
  "action": "update_wechat_settings",
  "payload": {
    "wechatId": "...",
    "wechatContactQr": "..."
  }
}
```

**Step 4: Fail gracefully**

若后端尚未支持：
- 反馈区展示明确失败信息
- 页面其它卡片不受影响

---

### Task 5: 新增图片 / R2 设置卡片

**Files:**
- Create: `meituanAstro/src/components/master/MasterStorageSettingsCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Render storage card**

卡片包含：
- `r2PublicDomain`
- `uploadStrictR2`
- 保存按钮
- 反馈区域

**Step 2: Fill from settings view**

默认值来自 `settingsView.storage`。

**Step 3: Add submit behavior**

向 `/api/master/manage` 提交：

```json
{
  "action": "update_storage_settings",
  "payload": {
    "r2PublicDomain": "...",
    "uploadStrictR2": true
  }
}
```

**Step 4: Preserve simple scope**

本轮只做设置项，不做文件上传控件和上传预览。

---

### Task 6: 新增备份设置卡片与条件显隐

**Files:**
- Create: `meituanAstro/src/components/master/MasterBackupSettingsCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Render backup card**

卡片包含：
- `backupTime`
- `backupRetention`
- `backupTarget`
- `backupHost`
- `backupUser`
- `backupPass`
- `backupPath`
- `backupEndpoint`
- `backupBucket`
- 保存按钮
- 反馈区域

**Step 2: Add conditional sections**

根据 `backupTarget` 做条件显隐：
- `s3` 时显示 `backupEndpoint` / `backupBucket`
- 其他模式显示 `backupHost` / `backupUser` / `backupPass` / `backupPath`

**Step 3: Add front-end validation**

至少验证：
- `backupRetention >= 1`
- `s3` 模式下 endpoint 和 bucket 不能为空

**Step 4: Add submit behavior**

向 `/api/master/manage` 提交：

```json
{
  "action": "update_backup_settings",
  "payload": {
    "backupTime": "03:00",
    "backupRetention": 7,
    "backupTarget": "s3",
    "backupEndpoint": "...",
    "backupBucket": "...",
    "backupHost": "...",
    "backupUser": "...",
    "backupPass": "...",
    "backupPath": "..."
  }
}
```

---

### Task 7: 把新增卡片接入全局设置页面

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Import new cards**

引入：
- `MasterFooterSettingsCard`
- `MasterRateSettingsCard`
- `MasterWechatSettingsCard`
- `MasterStorageSettingsCard`
- `MasterBackupSettingsCard`

**Step 2: Place them in settings grid**

在 `data-master-panel="settings"` 中按信息密度排布：
- 套餐与提成
- 页脚与联系
- 汇率与费率
- 微信联系
- 图片 / R2
- 备份设置
- 超级密码

**Step 3: Keep readable spacing**

不要把卡片堆成一堵墙；保留现有 `settings-grid` 节奏。

---

### Task 8: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-07-master-global-settings-wave-2.md`

**Step 1: Run unit tests**

Run: `node --test src/lib/master-settings-view.test.ts`
Expected: PASS

**Step 2: Run related frontend tests**

Run: `node --test src/lib/master-auth.test.ts src/lib/master-shop-view.test.ts src/lib/master-settings-view.test.ts`
Expected: PASS

**Step 3: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 4: Manual verification**

Run: `pnpm run dev`

打开：
- `http://localhost:3000/master?tab=settings`

验证：
- 新增卡片可见
- 默认值能正确显示
- 每张卡片保存时有明确反馈
- 备份 target 切换时条件字段显隐正确
- 原有 pricing / security 卡片仍正常

**Step 5: Record remaining gaps**

在本计划文件末尾记录本轮之后仍未补齐的旧版能力，例如：
- 续费列表与待处理提醒
- 批量修改店铺配置
- 更完整的恢复 / 导入导出操作
