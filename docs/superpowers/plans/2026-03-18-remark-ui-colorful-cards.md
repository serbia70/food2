# 备注 UI 彩色卡片统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将后台与用户端所有“备注”区域统一为彩色分组卡片风格（标题色条 + 边框 + 网格按钮 + 选中态），并为纯文本备注提供同一视觉体系的只读/可编辑卡片。

**Architecture:** 以 `docs/superpowers/specs/2026-03-18-remark-ui-design.md` 的 DOM/class 合约为唯一标准：所有备注 UI 统一包裹 `.remark-ui` 作用域，并通过 `--remark-accent` / `--remark-accent-soft` CSS 变量驱动主题色；后台 DOM-API 渲染与用户端 Preact 渲染共用同一套 class 结构与全局 CSS。

**Tech Stack:** Astro（.astro pages/components）, Preact（.tsx islands）, Vanilla TS（admin scripts）, CSS（`src/styles/global.css`）, Node test runner（`node --test`）.

---

## File Map（将修改/新增的文件与职责）

**Modify (CSS):**
- `src/styles/global.css`
  - 新增/替换 remark UI 的样式，所有选择器必须以 `.remark-ui` 为根作用域。
  - 让 `.remark-option-btn.selected` 等状态完全由 CSS 变量驱动（不依赖 JS 设置颜色）。

**Create (shared helper):**
- `src/lib/remark-ui-theme.ts`
  - 导出 `normalizeRemarkCategoryLabel()` 与 `getRemarkCategoryTheme()`：根据分类名推断 `{ accent, soft, icon }`，与 spec 映射表一致。
  - 仅用于“样式主题推断”，不改动业务数据。

**Modify (Admin script):**
- `src/scripts/admin/table-management.ts`
  - `renderRemarksUI()`：输出 `.remark-ui` 结构、为每个分类卡片设置 `--remark-accent`/`--remark-accent-soft`，并生成 `category-icon/category-name/option-main/option-sub`。
  - `toggleRemark()`：仅切换 `.selected` class；移除所有 border/background/color/fontWeight 的 inline style 写入。

**Modify (Admin view display-only note card):**
- `src/components/admin/TabTables.astro`
  - 将订单卡片中的备注展示块替换为 `.remark-ui` 的 Text-only Note（只读）卡片结构。

**Modify (Client Preact):**
- `src/components/cart-modal/CartDeliveryForm.tsx`
- `src/components/cart-modal/CartDineInRemarksPanel.tsx`
- `src/components/cart-modal/CartTableModal.tsx`
  - 统一 remark 渲染 DOM/class 结构到 spec 合约（`.remark-ui` root + 分类卡片 + 网格按钮 + 两行文本）。
  - 对“自定义备注”使用同样的卡片结构。

**Modify (Text-only editable note):**
- `src/components/ReservationModal.tsx`
  - 将现有备注 textarea 包裹为 `.remark-ui` Text-only Note（可编辑）卡片结构。

**Tests (Node):**
- Create: `src/lib/remark-ui-theme.test.ts`
  - 校验 `getRemarkCategoryTheme()` 对 spec 中示例输入输出稳定（hex 小写 + soft rgba）。

---

## Task 1: 建立主题推断 helper（TDD）

**Files:**
- Create: `src/lib/remark-ui-theme.ts`
- Test: `src/lib/remark-ui-theme.test.ts`

- [ ] **Step 1: 写失败测试（映射表 + normalize 行为）**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getRemarkCategoryTheme, normalizeRemarkCategoryLabel } from './remark-ui-theme';

test('normalize: should lowercase and normalize separators/spaces', () => {
  assert.equal(
    normalizeRemarkCategoryLabel('  辣度/Spiciness  '),
    '辣度 spiciness',
  );
});

test('theme: spiciness -> #ff7043 + soft rgba + icon', () => {
  assert.deepEqual(getRemarkCategoryTheme('辣度/Spiciness'), {
    accent: '#ff7043',
    soft: 'rgba(255, 112, 67, 0.08)',
    icon: '🌶️',
  });
});

test('theme: exclusions -> #d32f2f', () => {
  assert.equal(getRemarkCategoryTheme('忌口/不吃 (Exclusions)').accent, '#d32f2f');
});

test('theme: healthy -> #4caf50', () => {
  assert.equal(getRemarkCategoryTheme('健康与调味 (Healthy & Seasoning)').accent, '#4caf50');
});

test('theme: allergies -> #ffa726', () => {
  assert.equal(getRemarkCategoryTheme('过敏/特殊 (Allergies)').accent, '#ffa726');
});

test('theme: modifications -> #2196f3', () => {
  assert.equal(getRemarkCategoryTheme('食材调整 (Modifications)').accent, '#2196f3');
});

test('theme: default -> #607d8b', () => {
  assert.deepEqual(getRemarkCategoryTheme('其他/Others'), {
    accent: '#607d8b',
    soft: 'rgba(96, 125, 139, 0.08)',
    icon: '📝',
  });
});
```

- [ ] **Step 2: 运行测试确认失败**
Run: `node --test src/lib/remark-ui-theme.test.ts`
Expected: FAIL（模块不存在或导出不存在）。

- [ ] **Step 3: 写最小实现让测试通过**

```ts
export function normalizeRemarkCategoryLabel(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\/_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function getRemarkCategoryTheme(categoryLabel: string): {
  accent: string;
  soft: string;
  icon: string;
} {
  const n = normalizeRemarkCategoryLabel(categoryLabel);

  if (n.includes('辣') || n.includes('spicy') || n.includes('spiciness'))
    return { accent: '#ff7043', soft: 'rgba(255, 112, 67, 0.08)', icon: '🌶️' };
  if (n.includes('忌口') || n.includes('exclude') || n.includes('exclusion'))
    return { accent: '#d32f2f', soft: 'rgba(211, 47, 47, 0.08)', icon: '🚫' };
  if (n.includes('健康') || n.includes('healthy'))
    return { accent: '#4caf50', soft: 'rgba(76, 175, 80, 0.08)', icon: '🥬' };
  if (n.includes('过敏') || n.includes('allergy') || n.includes('allergies'))
    return { accent: '#ffa726', soft: 'rgba(255, 167, 38, 0.08)', icon: '⚠️' };
  if (n.includes('修改') || n.includes('modify') || n.includes('modification'))
    return { accent: '#2196f3', soft: 'rgba(33, 150, 243, 0.08)', icon: '⚙️' };

  return { accent: '#607d8b', soft: 'rgba(96, 125, 139, 0.08)', icon: '📝' };
}
```

- [ ] **Step 4: 运行测试确认通过**
Run: `node --test src/lib/remark-ui-theme.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/remark-ui-theme.ts src/lib/remark-ui-theme.test.ts
git commit -m "feat(remark-ui): add category theme inference helper"
```

---

## Task 2: 统一全局 CSS（以 .remark-ui 作用域）

**Important:** 当前 `src/styles/global.css` 已存在未带 `.remark-ui` 作用域前缀的 `.remark-*` 规则。迁移时必须避免这些旧规则继续影响新结构，否则会造成样式“看似被覆盖/不一致”的难排查问题。

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: 写一个最小 CSS 变更（先让 .remark-ui 不破坏现有布局）**
目标：新增 `.remark-ui` 作用域下的基础样式，同时保留旧类（`remarks-panel` 等）在迁移完成前不炸。

- [ ] **Step 1.5: 收敛/重命名旧的未 scoped remark 规则，防止覆盖新 remark-ui（必须彻底）**
在 `src/styles/global.css` 中：
- **搜索所有** 与 remark 相关、但**未以 `.remark-ui` 作为作用域根**的选择器（不仅限于 `.remark-*`，也包括组合选择器/伪类/媒体查询块内规则等）。
- 将这些规则**全部**改为“旧容器限定选择器”（例如限定在旧容器 `.remarks-panel` / `.delivery-remarks-section` / 现有旧面板 class 下），或在确认不再使用时删除。
- 目标验收：这些旧规则**不会覆盖/影响**任何 `.remark-ui ...` 下的新样式。

示例（仅示意，不是完整清单）：
- `.remarks-panel .remark-option-btn { ... }`
- `.delivery-remarks-section .remarks-preview { ... }`

建议先插入/替换为如下结构（示意，具体在实现时按现有 CSS 调整顺序/覆盖）：

```css
.remark-ui {
  /* 默认主题（未命中 / Text-only Note / Custom Remark） */
  --remark-accent: #607d8b;
  --remark-accent-soft: rgba(96, 125, 139, 0.08);
}
.remark-ui .remark-category { margin-bottom: 15px; border-radius: 12px; }
.remark-ui .category-title {
  padding: 10px 15px;
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  background: var(--remark-accent);
  border-radius: 12px 12px 0 0;
}
.remark-ui .category-icon { width: 18px; text-align: center; }
.remark-ui .remark-options-grid {
  border: 1px solid var(--remark-accent);
  border-top: none;
  border-radius: 0 0 12px 12px;
  padding: 15px;
  background: #fff;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
}
.remark-ui .remark-option-btn {
  min-height: 45px;
  border: 1px solid #e0e0e0;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5px;
}
.remark-ui .remark-option-btn.selected {
  border-color: var(--remark-accent);
  background: var(--remark-accent-soft);
  color: var(--remark-accent);
}
.remark-ui .remark-option-btn:focus-visible {
  outline: 2px solid var(--remark-accent);
  outline-offset: 2px;
}
.remark-ui .option-main { font-size: 14px; }
.remark-ui .remark-option-btn.selected .option-main { font-weight: 700; }
.remark-ui .option-sub { font-size: 11px; color: #999; }
.remark-ui .remark-option-btn.selected .option-sub { color: var(--remark-accent); }

/* Selected preview tags (neutral) */
.remark-ui .remarks-preview { background:#fff; border:1px solid #eee; border-radius: 12px; padding: 12px; display:flex; flex-wrap:wrap; gap: 10px; }
.remark-ui .remark-tag { background:#f1f5f9; border:1px solid #e2e8f0; color:#334155; border-radius:999px; padding:6px 12px; display:flex; align-items:center; gap:8px; font-size:13px; }
.remark-ui .remark-remove { cursor:pointer; font-weight:800; opacity:0.7; }
.remark-ui .remark-remove:focus-visible { outline:2px solid #3b82f6; outline-offset:2px; }

/* Text-only note card */
.remark-ui .remark-note-content { padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; color:#334155; font-size: 13px; }

.remark-ui .remark-note-content textarea {
  width: 100%;
  min-height: 90px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
}

.remark-ui .remark-note-content textarea:focus-visible {
  outline: 2px solid var(--remark-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 2: 运行最小回归检查（本地）**
Run: `pnpm dev`
Expected: 页面可打开，控制台无明显 CSS 相关错误。

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "style(remark-ui): add scoped colorful cards styles"
```

---

## Task 3: 改后台备注弹窗渲染（table-management.ts）

**Files:**
- Modify: `src/scripts/admin/table-management.ts`
- (Optional) Modify: `src/components/admin/AdminModals.astro`（若需要在 remarks-container 外包裹 `.remark-ui`）

- [ ] **Step 1: 写一个最小失败验证（手动）**
在改动前，确认当前 `toggleRemark()` 会写入 inline style（border/background/color/fontWeight）。

- [ ] **Step 2: 让 remarks 容器具备 `.remark-ui` 根**
选择其一：
- 在 `AdminModals.astro` 的 `#remarks-container` 外包一层 `<section class="remark-ui" id="remarks-ui-root">…</section>`，或
- 在脚本 `renderRemarksUI()` 内创建一个 `section.remark-ui` 并塞入。

- [ ] **Step 3: 按 spec 输出 DOM/class 合约（renderRemarksUI 不写任何视觉 inline style，仅 CSS vars）**
在 `renderRemarksUI()`：
- 禁止对 `.category-title` / `.remark-options-grid` / `.remark-option-btn` 写入 padding/display/border/background 等视觉 inline style（不要再调用 `setElementStyles()` 做皮肤/布局）。
- 仅允许在 `.remark-category` 上设置 CSS vars：
  - `category.style.setProperty('--remark-accent', accent)`
  - `category.style.setProperty('--remark-accent-soft', soft)`
- 引入并使用 helper（与 spec 映射一致）：
  - `import { getRemarkCategoryTheme } from '../../lib/remark-ui-theme';`
  - `const { accent, soft, icon } = getRemarkCategoryTheme(cat.name);`
- `category-title` 内部拆分为：
  - `<span class="category-icon" aria-hidden="true">🌶️</span>`（使用 helper 的 icon）
  - `<span class="category-name">${cat.name}</span>`
（这里是后台脚本通过 DOM API 创建元素，因此使用 `class` 属性示意；在 `.tsx` 里请使用 `className`。）
- 每个 option 按钮：
  - 生成 `.option-main/.option-sub`（按 `/` 分割）
  - 选中态只通过 `.selected` class 表达（不写 style）

- [ ] **Step 4: 重写 toggleRemark 仅切 class**
将 `toggleRemark(btn, activeColor)` 改为：
- 只做 `btn.classList.toggle('selected')`
- 不再写入 `btn.style.*`、不再依赖 activeColor。

- [ ] **Step 5: 手动验证后台备注弹窗**
Run: `pnpm dev`
打开：`http://localhost:3000/admin/01` → 打开备注弹窗
Expected:
- 分类卡片彩色标题 + 边框；按钮网格；选中态随类别颜色变化。
- 选中/取消只改变 class。
- DevTools 检查：除 `.remark-category` 上的 `--remark-accent` / `--remark-accent-soft` 外，整个备注 UI 不应存在任何视觉相关 inline style（包括但不限于 category-title / grid / btn 的 padding/display/border/background/color/fontWeight 等）。

- [ ] **Step 6: Commit**

```bash
git add src/scripts/admin/table-management.ts src/components/admin/AdminModals.astro
git commit -m "refactor(admin): render remarks UI with shared remark-ui contract"
```

---

## Task 4: 后台 TabTables 备注展示改为 Text-only Note 卡片

**Files:**
- Modify: `src/components/admin/TabTables.astro`

- [ ] **Step 1: 定位备注展示块并替换结构**
将当前橙色条备注展示替换为（需满足 spec DOM 合约：标题必须拆分 icon + name）：
- `.remark-ui` 根（使用默认 `--remark-accent/#607d8b` 与 `--remark-accent-soft/rgba(96, 125, 139, 0.08)`）
- `.remark-category`
- `.category-title`
  - `<span class="category-icon" aria-hidden="true">🏷️</span>`
  - `<span class="category-name">备注</span>`
（这里是 Astro/HTML 模板示意，因此使用 `class`；在 `.tsx` 里请使用 `className`。）
- `.remark-note-content` 只读展示 `r.join(', ')`

- [ ] **Step 2: 本地验证**
Run: `pnpm dev`
Expected: 外卖/堂食列表的备注展示为统一卡片风格，不影响其他卡片布局；并检查 `.category-icon` 在 DOM 中具备 `aria-hidden="true"`。

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/TabTables.astro
git commit -m "style(admin): show remarks as remark-ui note card in tables view"
```

---

## Task 5: 用户端（外卖备注）对齐 DOM/class 合约

**Files:**
- Modify: `src/components/cart-modal/CartDeliveryForm.tsx`
- Modify: `src/components/cart-modal/CartDineInRemarksPanel.tsx`

- [ ] **Step 1: 先改 CartDeliveryForm 的 remarks-panel 结构**
目标：在 `showDeliveryRemarksPanel` 的渲染块内，按 spec 渲染：
- 根：`<section className="remark-ui">`
- 每个分类：`<div className="remark-category" style={{ '--remark-accent': accent, '--remark-accent-soft': soft } as any }}>`
- 标题：`category-title` + `category-icon`（`aria-hidden="true"`）+ `category-name`
- 网格：`remark-options-grid`
- 按钮：`remark-option-btn`，内部拆分 `option-main/option-sub`

并保持业务逻辑不变（点击仍调用 `onToggleDeliveryRemark(opt)`）。

- [ ] **Step 2: 已选预览区改为中性 tag 风格（remark-tag/remark-remove）并补齐 a11y**
把预览区也放进 `.remark-ui` 作用域，确保使用统一 CSS。

A11y 约束（与 spec 一致）：
- 移除控件必须是 `<button type="button">`（不要用 `<span>` 充当按钮）
- 必须提供 `aria-label`（例如：`aria-label={\`移除备注：${remark}\`}`）

- [ ] **Step 3: 本地验证**
Run: `pnpm dev`
打开点餐页 → 打开购物车 → 外卖 → 展开备注
Expected: 彩色卡片显示，选中态按类别颜色；预览 tag 为中性；并检查 `.category-icon` 在 DOM 中具备 `aria-hidden="true"`。

- [ ] **Step 4: Commit**

```bash
git add src/components/cart-modal/CartDeliveryForm.tsx
git commit -m "style(client): align delivery remarks UI to remark-ui colorful cards"
```

---

## Task 6: 用户端（堂食备注）对齐 DOM/class 合约

**Files:**
- Modify: `src/components/cart-modal/CartDineInRemarksPanel.tsx`

- [ ] **Step 1: 将 cart-remarks-section 内部改为 remark-ui 结构**
保留外层容器/展开按钮逻辑；在面板内部使用 `<section className="remark-ui">`，并确保分类卡片满足 spec DOM 合约：
- 标题必须用 `.category-title`，并拆分 `category-icon`（`aria-hidden="true"`）+ `category-name`
- 选项区使用 `.remark-options-grid`
- 按钮使用 `.remark-option-btn` + `.selected`（仅 class，禁止写视觉 inline style）

- [ ] **Step 2: 将自定义备注也改为“分类卡片”结构（固定）**
标题条：需使用 `category-title` 并满足 spec DOM 合约（icon + name 拆分，且 icon 需 `aria-hidden="true"`）：
- `<span className="category-icon" aria-hidden="true">📝</span>`
- `<span className="category-name">自定义备注 / Custom</span>`
内容区固定使用：
- `<div className="remark-note-content"><textarea ... /></div>`
（不要放进 `.remark-options-grid`，避免网格布局语义冲突）。

- [ ] **Step 3: 本地验证 + Commit**
Run: `pnpm dev`
Expected: 堂食备注与外卖备注风格一致；并检查 `.category-icon` 在 DOM 中具备 `aria-hidden="true"`。

```bash
git add src/components/cart-modal/CartDineInRemarksPanel.tsx
git commit -m "style(client): align dine-in remarks panel to remark-ui contract"
```

---

## Task 7: 用户端（堂食桌号弹窗）移除 inline style，统一使用 CSS 变量

**Files:**
- Modify: `src/components/cart-modal/CartTableModal.tsx`

- [ ] **Step 1: 将现有 remarks 渲染替换为统一结构**
当前 `CartTableModal` remarks 部分大量 inline style；改为：
- 使用 `.remark-ui` 根（依赖 `.remark-ui` 默认 `--remark-accent/#607d8b` 与 `--remark-accent-soft/rgba(96, 125, 139, 0.08)`，确保变量总有值）
- 分类卡片在 `.remark-category` 上设置两种变量
- 标题必须满足 spec DOM 合约：`.category-title` 内拆分 `category-icon`（`aria-hidden="true"`）+ `category-name`
- 删除按钮选中态的 inline `borderColor/backgroundColor/color`（交给 CSS）

- [ ] **Step 2: 本地验证 + Commit**

```bash
git add src/components/cart-modal/CartTableModal.tsx
git commit -m "refactor(client): render table modal remarks using remark-ui css vars"
```

---

## Task 8: 纯文本备注（预约）包裹为 Text-only Note 卡片

**Files:**
- Modify: `src/components/ReservationModal.tsx`

- [ ] **Step 1: 将 textarea 包裹为 `.remark-ui` 单卡片结构**
新增（需满足 spec DOM 合约：标题必须拆分 icon + name，且 icon 需 `aria-hidden="true"`）：
- 外层 `.remark-category`（默认 theme；依赖 `.remark-ui` 默认 `--remark-accent/#607d8b` 与 `--remark-accent-soft/rgba(96, 125, 139, 0.08)`，确保变量总有值）
- 标题条 `.category-title`
  - `<span className="category-icon" aria-hidden="true">🏷️</span>`
  - `<span className="category-name">备注</span>`
- textarea 放入内容容器（`.remark-note-content`）。

注意：在 `.tsx`（Preact/JSX）里 class 属性必须写 `className`（不要写 `class`），避免实现歧义。

- [ ] **Step 2: 本地验证 + Commit**

```bash
git add src/components/ReservationModal.tsx
git commit -m "style(client): wrap reservation note as remark-ui text-only card"
```

---

## Task 9: 最终验证

**Files:**
- (No code changes)

- [ ] **Step 1: 运行基础单测**
Run: `node --test src/lib/remark-ui-theme.test.ts`
Expected: PASS。

- [ ] **Step 2: 运行安全门禁测试（如耗时可最后跑一次）**
Run: `pnpm run test:security`
Expected: PASS。

- [ ] **Step 3: 人工回归清单**
- 后台：`/admin/01` 打开备注弹窗，分类卡片/选中态/保存正常。
- 后台：TabTables 备注展示卡片正常，不破坏订单卡布局。
- 用户端：外卖备注、堂食备注、堂食桌号弹窗备注均为彩色卡片风格。
- 用户端：预约备注为单卡片风格。

- [ ] **Step 4:（可选）最终整理提交**
如前面任务已经按步提交，则此处不需要额外 commit。若仍有未提交改动，整理后按常规提交（不要使用空提交）。

---

## Notes / Guardrails
- 任何新 CSS 必须以 `.remark-ui` 作用域开头。
- JS 不得写视觉 inline style（除 `--remark-accent` / `--remark-accent-soft`）。
- 尽量减少对现有非备注 UI 的影响：迁移过程中保留旧类直到对应入口完成迁移。
- 所有命令使用 `pnpm`（符合项目约定）。
