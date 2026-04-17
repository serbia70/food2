# Shop Display Default Hours & City Implementation Plan

> 状态说明（历史计划）：这份计划记录的是店铺默认城市与营业时间展示统一时的实施步骤；文中的 `历史红灯预期：` 只代表当时引入 resolver 的阶段，不应直接当作当前实现状态。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让前台首页、店铺页、CartModal、admin 设置页的城市与营业时间统一读取“店铺真实设置优先，master 全局默认兜底”的同一套解析结果。

**Architecture:** 新增 `src/lib/shop-display-settings.ts` 作为唯一 resolver，输入店铺数据、店铺 settings 和 master settings，输出统一的 `city/hours` 展示视图与来源标记。master settings 增加 `shopDefaults.city` 与 `shopDefaults.hours` 字段；admin 与前台页面全部改为消费 resolver 结果，并删除前台私有硬编码营业时间 fallback。

**Tech Stack:** Astro SSR、TypeScript、Node test runner、既有 master/admin settings BFF 路由

---

## File Structure

- **Create:** `src/lib/shop-display-settings.ts`
  - 负责统一解析城市与营业时间
- **Create:** `src/lib/shop-display-settings.test.ts`
  - 负责 resolver 单测
- **Modify:** `src/lib/master-settings-view.ts`
  - 增加 master 默认城市/默认营业时间 view model
- **Modify:** `src/lib/master-settings-view.test.ts`
  - 覆盖新字段回读
- **Modify:** `src/components/master/MasterFooterSettingsCard.astro`
  - 不适合；保持原样
- **Create:** `src/components/master/MasterShopDefaultsSettingsCard.astro`
  - 单独承载 master 全局默认城市/营业时间表单，避免继续堆大 `src/pages/master/index.astro`
- **Modify:** `src/scripts/master/settings-forms.ts`
  - 增加 shop defaults 提交逻辑
- **Modify:** `src/pages/master/index.astro`
  - 挂载 `MasterShopDefaultsSettingsCard`
- **Modify:** `src/pages/admin/[slug]/index.astro`
  - 读取 master settings，调用 resolver，传给 `TabSettings`
- **Modify:** `src/components/admin/TabSettings.astro`
  - 城市/营业时间改为使用 resolver 结果，并显示“使用全局默认”提示
- **Modify:** `src/tests/pages/admin/admin-index-canonical-init.test.ts`
  - 删除旧 fallback 断言，新增 resolver 驱动断言
- **Modify:** `src/components/CartModal.tsx`
  - 删除 `10:00/23:00` 硬编码 fallback，改为消费 resolver 结果
- **Modify:** `src/pages/[slug]/index.astro`
  - 统一店铺页的城市/营业时间解析输入
- **Modify:** `src/pages/index.astro`
  - 若首页店铺卡片使用城市展示，统一走 resolver
- **Modify/Test:** 相关前台/CartModal 测试文件（在实现时以 grep 确认具体文件）

---

### Task 1: 建立 shop display resolver

**Files:**
- Create: `src/lib/shop-display-settings.ts`
- Test: `src/lib/shop-display-settings.test.ts`

- [ ] **Step 1: Write the failing resolver tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveShopDisplaySettings } from './shop-display-settings.ts';

test('shop hours override master defaults only when both open and close exist', () => {
  const result = resolveShopDisplaySettings({
    shop: { city: '' },
    shopSettings: { hours: { open: '09:00' } },
    masterSettings: {
      shopDefaults: {
        city: 'Belgrade',
        hours: { open: '10:00', close: '23:00' },
      },
    },
  });

  assert.deepEqual(result.hours, { open: '10:00', close: '23:00' });
  assert.equal(result.hasShopHoursOverride, false);
});

test('shop city wins over master default city', () => {
  const result = resolveShopDisplaySettings({
    shop: { city: 'Novi Sad' },
    shopSettings: {},
    masterSettings: { shopDefaults: { city: 'Belgrade' } },
  });

  assert.equal(result.city, 'Novi Sad');
  assert.equal(result.hasShopCityOverride, true);
});

test('missing shop city falls back to master default city', () => {
  const result = resolveShopDisplaySettings({
    shop: { city: '' },
    shopSettings: {},
    masterSettings: { shopDefaults: { city: 'Belgrade' } },
  });

  assert.equal(result.city, 'Belgrade');
  assert.equal(result.hasShopCityOverride, false);
});

test('invalid settings do not crash and return empty values when no defaults exist', () => {
  const result = resolveShopDisplaySettings({
    shop: null,
    shopSettings: null,
    masterSettings: null,
  });

  assert.deepEqual(result, {
    city: '',
    hours: { open: '', close: '' },
    hasShopCityOverride: false,
    hasShopHoursOverride: false,
  });
});
```

- [ ] **Step 2: Run resolver test to verify it fails**

Run: `node --test src/lib/shop-display-settings.test.ts`
历史红灯预期： with `Cannot find module './shop-display-settings.ts'` or missing export.

- [ ] **Step 3: Write the minimal resolver implementation**

```ts
type InputRecord = Record<string, unknown>;

type ResolveShopDisplaySettingsInput = {
  shop: unknown;
  shopSettings: unknown;
  masterSettings: unknown;
};

export type ShopDisplaySettingsView = {
  city: string;
  hours: {
    open: string;
    close: string;
  };
  hasShopCityOverride: boolean;
  hasShopHoursOverride: boolean;
};

function asRecord(value: unknown): InputRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as InputRecord : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readHours(value: unknown): { open: string; close: string } {
  const record = asRecord(value);
  return {
    open: readString(record.open),
    close: readString(record.close),
  };
}

function isCompleteHours(hours: { open: string; close: string }): boolean {
  return hours.open.length > 0 && hours.close.length > 0;
}

export function resolveShopDisplaySettings({
  shop,
  shopSettings,
  masterSettings,
}: ResolveShopDisplaySettingsInput): ShopDisplaySettingsView {
  const shopRecord = asRecord(shop);
  const settingsRecord = asRecord(shopSettings);
  const masterRecord = asRecord(masterSettings);
  const defaultsRecord = asRecord(masterRecord.shopDefaults);

  const shopCity = readString(settingsRecord.city) || readString(shopRecord.city);
  const defaultCity = readString(defaultsRecord.city);

  const shopHours = readHours(asRecord(settingsRecord.hours));
  const defaultHours = readHours(asRecord(defaultsRecord.hours));

  return {
    city: shopCity || defaultCity,
    hours: isCompleteHours(shopHours)
      ? shopHours
      : isCompleteHours(defaultHours)
        ? defaultHours
        : { open: '', close: '' },
    hasShopCityOverride: shopCity.length > 0,
    hasShopHoursOverride: isCompleteHours(shopHours),
  };
}
```

- [ ] **Step 4: Run resolver test to verify it passes**

Run: `node --test src/lib/shop-display-settings.test.ts`
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shop-display-settings.ts src/lib/shop-display-settings.test.ts
git commit -m "feat: add shared shop display settings resolver"
```

---

### Task 2: 让 master settings 支持默认城市与默认营业时间

**Files:**
- Create: `src/components/master/MasterShopDefaultsSettingsCard.astro`
- Modify: `src/lib/master-settings-view.ts`
- Modify: `src/lib/master-settings-view.test.ts`
- Modify: `src/scripts/master/settings-forms.ts`
- Modify: `src/pages/master/index.astro`
- Test: `src/lib/master-settings-view.test.ts`

- [ ] **Step 1: Write the failing master settings view tests**

在 `src/lib/master-settings-view.test.ts` 增加：

```ts
test('buildMasterSettingsView exposes shop defaults city and hours', () => {
  const view = buildMasterSettingsView({
    shopDefaults: {
      city: 'Belgrade',
      hours: { open: '10:00', close: '23:00' },
    },
  });

  assert.deepEqual(view.shopDefaults, {
    city: 'Belgrade',
    hours: { open: '10:00', close: '23:00' },
  });
});

test('buildMasterSettingsView falls back to empty shop defaults values', () => {
  const view = buildMasterSettingsView({});

  assert.deepEqual(view.shopDefaults, {
    city: '',
    hours: { open: '', close: '' },
  });
});
```

- [ ] **Step 2: Run view test to verify it fails**

Run: `node --test src/lib/master-settings-view.test.ts`
历史红灯预期： because `shopDefaults` does not exist on `MasterSettingsView`.

- [ ] **Step 3: Extend `buildMasterSettingsView()` minimally**

在 `src/lib/master-settings-view.ts` 的 `MasterSettingsView` 中加入：

```ts
  shopDefaults: {
    city: string;
    hours: {
      open: string;
      close: string;
    };
  };
```

并在 `return` 中加入：

```ts
    shopDefaults: {
      city: toStringValue((settings?.shopDefaults as Record<string, unknown> | undefined)?.city),
      hours: {
        open: toStringValue(((settings?.shopDefaults as Record<string, unknown> | undefined)?.hours as Record<string, unknown> | undefined)?.open),
        close: toStringValue(((settings?.shopDefaults as Record<string, unknown> | undefined)?.hours as Record<string, unknown> | undefined)?.close),
      },
    },
```

然后创建 `src/components/master/MasterShopDefaultsSettingsCard.astro`，结构参考其他 settings card，表单字段名固定为：
- `defaultCity`
- `defaultOpenTime`
- `defaultCloseTime`

核心表单：

```astro
---
const { settings } = Astro.props;
---
<form id="master-shop-defaults-settings-form" class="settings-card" onsubmit="return window.submitMasterShopDefaultsSettings ? window.submitMasterShopDefaultsSettings(this) : false;">
  <h3>店铺默认城市与营业时间</h3>
  <label>
    <span>默认城市</span>
    <input name="defaultCity" type="text" value={settings.city} placeholder="例如：Belgrade" />
  </label>
  <label>
    <span>默认营业开始</span>
    <input name="defaultOpenTime" type="time" value={settings.hours.open} />
  </label>
  <label>
    <span>默认营业结束</span>
    <input name="defaultCloseTime" type="time" value={settings.hours.close} />
  </label>
  <div class="settings-actions">
    <button type="submit">保存默认值</button>
    <p id="master-shop-defaults-settings-feedback"></p>
  </div>
</form>
```

在 `src/scripts/master/settings-forms.ts` 增加：

```ts
  async function submitMasterShopDefaultsSettings(form: HTMLFormElement) {
    await submitSettingsAction(form, {
      endpoint: '/api/master/settings',
      feedbackId: 'master-shop-defaults-settings-feedback',
      loadingText: '保存店铺默认值中...',
      successText: '店铺默认值已保存',
      buildPayload(currentForm) {
        const formData = new FormData(currentForm);
        return {
          shopDefaults: {
            city: String(formData.get('defaultCity') || '').trim(),
            hours: {
              open: String(formData.get('defaultOpenTime') || '').trim(),
              close: String(formData.get('defaultCloseTime') || '').trim(),
            },
          },
        };
      },
    });
    return false;
  }
```

并在返回对象中暴露 `submitMasterShopDefaultsSettings`。

最后在 `src/pages/master/index.astro` 引入并挂载：

```astro
import MasterShopDefaultsSettingsCard from '../../components/master/MasterShopDefaultsSettingsCard.astro';
```

在 settings 区块中加入：

```astro
<MasterShopDefaultsSettingsCard settings={dashboardView.settings.shopDefaults} />
```

- [ ] **Step 4: Run view test to verify it passes**

Run: `node --test src/lib/master-settings-view.test.ts`
Expected: PASS including new shopDefaults assertions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/master-settings-view.ts src/lib/master-settings-view.test.ts src/components/master/MasterShopDefaultsSettingsCard.astro src/scripts/master/settings-forms.ts src/pages/master/index.astro
git commit -m "feat: add master shop display defaults settings"
```

---

### Task 3: 让 admin 页面读取 resolver 与 master 默认

**Files:**
- Modify: `src/pages/admin/[slug]/index.astro`
- Modify: `src/components/admin/TabSettings.astro`
- Modify: `src/tests/pages/admin/admin-index-canonical-init.test.ts`
- Test: `src/tests/pages/admin/admin-index-canonical-init.test.ts`

- [ ] **Step 1: Write the failing admin source test**

把 `src/tests/pages/admin/admin-index-canonical-init.test.ts` 旧断言改成新目标断言：

```ts
test('admin settings source uses resolved shop display settings for city and hours', async () => {
  const page = await readFile(pagePath, 'utf8');
  const settingsComponent = await readFile(settingsComponentPath, 'utf8');

  assert.match(page, /resolveShopDisplaySettings\(/);
  assert.match(page, /const resolvedDisplaySettings = resolveShopDisplaySettings\(/);
  assert.match(settingsComponent, /value=\{resolvedDisplaySettings\.city \|\| ''\}/);
  assert.match(settingsComponent, /value=\{resolvedDisplaySettings\.hours\.open \|\| ''\}/);
  assert.match(settingsComponent, /value=\{resolvedDisplaySettings\.hours\.close \|\| ''\}/);
  assert.match(settingsComponent, /使用全局默认/);
  assert.doesNotMatch(settingsComponent, /settings\.hours\?\.open \|\| shop\.hours\?\.open \|\| shop\.open_time/);
});
```

- [ ] **Step 2: Run admin source test to verify it fails**

Run: `node --test src/tests/pages/admin/admin-index-canonical-init.test.ts`
历史红灯预期： because resolver is not wired yet.

- [ ] **Step 3: Wire resolver into admin page and settings tab**

在 `src/pages/admin/[slug]/index.astro`：
1. 额外请求 master settings（沿用既有 canonical master init / settings 数据来源，若页面已有 `masterSettings` 可直接复用；若没有，最小追加一个 fetchJSON 到 master settings 源）
2. 引入：

```ts
import { resolveShopDisplaySettings } from '../../../lib/shop-display-settings.ts';
```

3. 生成：

```ts
const resolvedDisplaySettings = resolveShopDisplaySettings({
  shop,
  shopSettings: settings,
  masterSettings,
});
```

4. 传给 `TabSettings`：

```astro
<TabSettings
  settings={settings}
  shop={shop}
  shopCategories={shopCategories}
  brokerIp={brokerIp}
  restaurantId={shop.id}
  cities={cities}
  resolvedDisplaySettings={resolvedDisplaySettings}
/>
```

在 `src/components/admin/TabSettings.astro` 增加 props：

```astro
const { shop, settings, shopCategories, brokerIp, cities, resolvedDisplaySettings } = props;
```

把城市与营业时间三处值改成：

```astro
<option value={c} selected={resolvedDisplaySettings?.city === c}>{c}</option>
```

```astro
<input name="open" type="time" value={resolvedDisplaySettings?.hours?.open || ''} />
<input name="close" type="time" value={resolvedDisplaySettings?.hours?.close || ''} />
```

并在对应区域增加轻提示，例如：

```astro
{
  !resolvedDisplaySettings?.hasShopHoursOverride && resolvedDisplaySettings?.hours?.open && resolvedDisplaySettings?.hours?.close && (
    <small style="color:#666; display:block; margin-top:5px;">当前使用全局默认营业时间</small>
  )
}
```

城市区域同理：

```astro
{
  !resolvedDisplaySettings?.hasShopCityOverride && resolvedDisplaySettings?.city && (
    <small style="color:#666; display:block; margin-top:5px;">当前使用全局默认城市</small>
  )
}
```

- [ ] **Step 4: Run admin source test to verify it passes**

Run: `node --test src/tests/pages/admin/admin-index-canonical-init.test.ts`
Expected: PASS with resolver-based assertions.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/[slug]/index.astro src/components/admin/TabSettings.astro src/tests/pages/admin/admin-index-canonical-init.test.ts
git commit -m "refactor: align admin city and hours with shared resolver"
```

---

### Task 4: 删除 CartModal 私有营业时间 fallback

**Files:**
- Modify: `src/components/CartModal.tsx`
- Test: locate existing CartModal or shop page tests and update them

- [ ] **Step 1: Write the failing test for CartModal fallback removal**

先搜索并选用已有覆盖 `CartModal` 文案或源代码断言的测试文件；如果没有，新增 `src/components/CartModal.test.tsx` 或 source-level 测试，最小断言：

```ts
test('CartModal source does not hardcode default business hours', async () => {
  const source = await readFile(resolve(process.cwd(), 'src/components/CartModal.tsx'), 'utf8');

  assert.doesNotMatch(source, /settings\.hours\?\.open \|\| "10:00"/);
  assert.doesNotMatch(source, /settings\.hours\?\.close \|\| "23:00"/);
  assert.match(source, /resolvedDisplaySettings/);
});
```

- [ ] **Step 2: Run the CartModal test to verify it fails**

Run: `node --test <选定的 CartModal 测试文件>`
历史红灯预期： because hardcoded fallback still exists.

- [ ] **Step 3: Implement minimal CartModal change**

在 `src/components/CartModal.tsx`：
- 把 `settings.hours?.open || "10:00"` 和 `settings.hours?.close || "23:00"` 删除
- 改为依赖页面传入的统一解析结果，例如：

```ts
const openTime = resolvedDisplaySettings.hours.open;
const closeTime = resolvedDisplaySettings.hours.close;
```

- 若 `openTime/closeTime` 为空：
  - 关店提示改为空态文案，不伪造 `10:00 - 23:00`

例如：

```tsx
{openTime && closeTime ? (
  <div>Radno vreme / 营业时间: {openTime} - {closeTime}</div>
) : (
  <div>Radno vreme / 营业时间: 未设置</div>
)}
```

- [ ] **Step 4: Run the CartModal test to verify it passes**

Run: `node --test <选定的 CartModal 测试文件>`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CartModal.tsx <CartModal测试文件路径>
git commit -m "refactor: remove CartModal hardcoded business hours"
```

---

### Task 5: 让店铺页与首页也走 resolver

**Files:**
- Modify: `src/pages/[slug]/index.astro`
- Modify: `src/pages/index.astro`
- Test: update existing shop/home page tests found by grep

- [ ] **Step 1: Write the failing source-level tests**

为店铺页/首页选定已有测试文件，新增最小断言：

```ts
assert.match(source, /resolveShopDisplaySettings\(/);
assert.doesNotMatch(source, /"10:00"/);
assert.doesNotMatch(source, /"23:00"/);
```

如果首页展示城市，增加：

```ts
assert.match(source, /resolvedDisplaySettings\.city/);
```

- [ ] **Step 2: Run the page tests to verify they fail**

Run: `node --test <店铺页/首页相关测试文件>`
历史红灯预期： because pages do not yet use resolver.

- [ ] **Step 3: Wire resolver into shop and home pages minimally**

在 `src/pages/[slug]/index.astro`：
- 引入 `resolveShopDisplaySettings`
- 读取公开店铺 settings 与 public master settings 后，生成：

```ts
const resolvedDisplaySettings = resolveShopDisplaySettings({
  shop,
  shopSettings: settings,
  masterSettings: publicMasterSettings,
});
```

- 把页面内城市/营业时间展示和传给 `CartModal` 的对应值都改为 `resolvedDisplaySettings`

在 `src/pages/index.astro`：
- 如果店铺卡片展示城市，统一用 resolver 结果
- 不要自己再写 `Belgrade` 类默认串

- [ ] **Step 4: Run the page tests to verify they pass**

Run: `node --test <店铺页/首页相关测试文件>`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/[slug]/index.astro src/pages/index.astro <相关测试文件路径>
git commit -m "refactor: align shop pages with shared display defaults"
```

---

### Task 6: 回归验证与收口

**Files:**
- Modify: only if tests reveal mismatches
- Test: all affected tests

- [ ] **Step 1: Run focused unit and source-level tests**

Run: `node --test src/lib/shop-display-settings.test.ts src/lib/master-settings-view.test.ts src/tests/pages/admin/admin-index-canonical-init.test.ts`
Expected: PASS.

- [ ] **Step 2: Run page-related tests**

Run: `node --test <CartModal相关测试> <店铺页相关测试> <首页相关测试>`
Expected: PASS.

- [ ] **Step 3: Run a build to catch Astro SSR regressions**

Run: `pnpm build`
Expected: build succeeds with no new settings/page regressions.

- [ ] **Step 4: Manually verify the three user-visible paths**

Check:
- `http://localhost:3000/master?tab=settings`
  - 可以设置默认城市与默认营业时间
- `http://localhost:3000/admin/02`
  - 店铺未设置时显示默认城市/默认营业时间，并提示“使用全局默认”
- `http://localhost:3000/02`
  - 关店提示时间与 admin 相同，不再单独写死 `10:00 - 23:00`

- [ ] **Step 5: Commit**

```bash
git add src/components src/lib src/pages src/scripts
git commit -m "feat: unify shop city and hours display defaults"
```

---

## Self-Review

- **Spec coverage:**
  - master 默认城市/营业时间：Task 2
  - 共享 resolver：Task 1
  - admin 对齐：Task 3
  - CartModal 删除硬编码：Task 4
  - 前台首页/店铺页对齐：Task 5
  - 测试与构建收口：Task 6
- **Placeholder scan:**
  - 唯一需要实现时 grep 确认的是 CartModal/首页现有测试文件路径；这不会改变任务内容，只是让执行者按仓库现状选中准确测试文件。
- **Type consistency:**
  - resolver 输出字段固定为 `city`, `hours.open`, `hours.close`, `hasShopCityOverride`, `hasShopHoursOverride`
  - master settings 字段固定为 `shopDefaults.city`, `shopDefaults.hours.open`, `shopDefaults.hours.close`
