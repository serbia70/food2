# 备注 UI 彩色卡片统一设计（后台 + 用户端）

日期：2026-03-18

## 背景
当前项目存在多处“备注”相关 UI：
- 后台（`/admin/*`）的“添加备注”弹窗：已具备彩色分类卡片风格，但与其他备注区域的结构/CSS/交互细节不完全一致。
- 用户端购物车/堂食/外卖相关的“口味备注”：整体仍偏灰色普通样式，与后台风格割裂。
- 另有一些“备注”仅为纯文本输入（例如预约备注），视觉上也不统一。

### 视觉基准（验收对齐目标）
以后台“添加备注”弹窗（`#remarks-modal`）为**唯一视觉基准**。
- 验收时对齐要点：标题条高度/圆角/边框粗细/选中态（边框 + 浅底 + 字色/加粗）/网格按钮间距。
- 若视觉基准未来变更或与本文档冲突，以本文档（DOM 合约 + CSS tokens）为准。

目标是将所有“备注”统一成该“彩色分组卡片”视觉体系。

## 目标与非目标
### 目标
1. **后台 + 用户端**所有备注区域，统一为“彩色分组卡片”风格：
   - 彩色标题条（含图标）
   - 分类卡片边框与圆角
   - 选项按钮网格（支持两行：中文/英文）
   - 选中态使用该分类主色高亮（边框 + 浅色背景 + 字色/加粗）
2. 不改变现有业务逻辑：选择/取消选择、保存备注、自定义备注输入等功能保持一致。
3. 移动端（手机）表现良好：可滚动、不卡顿、不溢出。

### 非目标
- **不强制统一分类/选项内容**：后台和用户端保留各自现有 remark categories/options（仅统一样式）。
- 不引入新的框架/渲染体系（不把后台完全改造成 Preact 组件渲染）。

## 范围（覆盖的页面/入口）
### 1) 后台（Admin）
- “添加备注”弹窗（`#remarks-modal`）
- 桌台/订单列表中的备注展示区域（例如当前在 `TabTables.astro` 中以橙色条展示备注的部分）
  - **展示样式（固定）**：使用“Text-only Note 单卡片”样式展示整段备注内容；不在列表里渲染分类按钮网格（仅展示，不提供选择交互）。

### 2) 用户端（Client）
- 购物车弹窗：外卖备注、堂食备注（展开/收起、已选预览、选项区）
- 堂食桌号弹窗中的备注选择区

### 3) 纯文本备注（无分类按钮）
- 仅输入框/textarea 的备注（例如预约备注）也应纳入统一风格：
  - 以“单卡片”形式呈现（同样的标题条 + 边框 + 输入区），使其视觉语言与图一一致。

## 推荐方案
采用“统一 UI 规范 + 统一 CSS（变量驱动主题）”的方式（不强制统一渲染组件）。

核心原则：
- 统一 **DOM 结构 + class 命名**，让同一套 CSS 能作用于后台脚本渲染与用户端组件渲染。
- 每个分类通过 CSS 变量 `--remark-accent` 提供主色，CSS 根据该变量渲染边框/背景/选中态。

## 视觉规范（UI 组件规格）

### CSS Tokens（关键尺寸/样式约束）
为保证“完全一致”且可验收，以下 tokens 在后台与用户端统一（实现可用 CSS 变量或常量值）：
- 卡片圆角：`12px`
- 卡片边框宽度：`1px`
- 标题条内边距：`10px 15px`
- 标题条字体：`15px`，字重 `700`
- 内容区内边距：`15px`
- 选项网格列宽：`minmax(110px, 1fr)`
- 选项网格间距：`10px`
- 选项按钮最小高度：`45px`
- 选项按钮圆角：`6px`
- 选中态浅底色：使用 `--remark-accent-soft`（固定为 `rgba(r, g, b, 0.08)`，见“颜色/图标推断”映射表）
- Focus 样式：外圈 `2px` 描边（颜色为 `--remark-accent` 或中性蓝），保证键盘可见
- 图标占位：固定宽度 `18px`，保证标题对齐；emoji 形状不做一致性验收，仅验收“存在且不挤压布局、不溢出”。

### 1) 分类卡片（Remark Category Card）

#### DOM 结构与 class 合约（必须一致）
所有备注 UI 必须包裹在：`<section class="remark-ui">…</section>`，所有样式以 `.remark-ui` 作为作用域根，避免影响全站。

每个分类卡片必须使用以下结构（CSS 仅依赖这些 class）：

```html
<section class="remark-ui">
  <div class="remark-category" style="--remark-accent: #ff7043; --remark-accent-soft: rgba(255, 112, 67, 0.08);">
    <div class="category-title">
      <span class="category-icon" aria-hidden="true">🌶️</span>
      <span class="category-name">辣度/Spiciness</span>
    </div>

    <div class="remark-options-grid">
      <button type="button" class="remark-option-btn">
        <span class="option-main">免辣</span>
        <span class="option-sub">No Spicy</span>
      </button>
      <!-- ... -->
    </div>
  </div>
</section>
```

约束：
- 仅允许通过 inline style 设置 `--remark-accent` 与 `--remark-accent-soft`（用于主题色与选中态浅底色）；除此之外禁止通过 JS 写入视觉相关的 inline style。
- `remark-option-btn` 的选中态仅通过 `.selected` class 表达。

#### 颜色/图标推断（必须在后台与用户端完全一致）
推断输入为分类显示名 `categoryLabel`（字符串）。

**输出约束：**
- `--remark-accent` 必须输出为 `#RRGGBB` 且使用**小写**（例如 `#ff7043`）。
- 同时提供 `--remark-accent-soft`（用于选中态浅底色），格式固定为 `rgba(r, g, b, 0.08)`。

**标准化（normalize）伪代码：**
```ts
function normalizeLabel(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    // 常见分隔符统一为空格，避免不同端因为 "/" 等导致 includes 差异
    .replace(/[\/_-]+/g, " ")
    // 多空格归一
    .replace(/\s+/g, " ");
}
```

**匹配规则（first match wins，使用简单 substring includes）：**

| 命中关键字（normalize 后） | `--remark-accent` | `--remark-accent-soft` | icon |
|---|---|---|---|
| `辣` / `spicy` / `spiciness` | `#ff7043` | `rgba(255, 112, 67, 0.08)` | 🌶️ |
| `忌口` / `exclude` / `exclusion` | `#d32f2f` | `rgba(211, 47, 47, 0.08)` | 🚫 |
| `健康` / `healthy` | `#4caf50` | `rgba(76, 175, 80, 0.08)` | 🥬 |
| `过敏` / `allergy` / `allergies` | `#ffa726` | `rgba(255, 167, 38, 0.08)` | ⚠️ |
| `修改` / `modify` / `modification` | `#2196f3` | `rgba(33, 150, 243, 0.08)` | ⚙️ |
| 未命中 | `#607d8b` | `rgba(96, 125, 139, 0.08)` | 📝 |


**示例（normalize + 结果）：**
- `"辣度/Spiciness"` → 命中 spicy → `#ff7043` + 🌶️
- `"忌口/不吃 (Exclusions)"` → 命中 exclusions → `#d32f2f` + 🚫
- `"健康与调味 (Healthy & Seasoning)"` → 命中 healthy → `#4caf50` + 🥬
- `"过敏/特殊 (Allergies)"` → 命中 allergies → `#ffa726` + ⚠️
- `"食材调整 (Modifications)"` → 命中 modifications → `#2196f3` + ⚙️

注意：
- 图标为装饰性元素（`aria-hidden="true"`），不承载语义；emoji 形状不做一致性验收。
- 本规则仅影响样式（颜色/图标），不改变分类/选项内容。

### 2) 已选预览（Selected Preview Tags）
- 展示为 tag 列表，可移除（×）。
- 视觉风格与彩色卡片体系协调：圆角、轻量描边。
- **颜色策略（固定）**：tag 统一使用中性底色与描边（不按分类着色），避免视觉噪音，也避免维护“tag → 分类”的归属映射。
- 可访问性：移除按钮需可键盘触达，并具备 `aria-label`（例如“移除备注：免辣/No Spicy”）。

### 3) 自定义备注（Custom Remark）
- 作为“一个分类卡片”呈现：标题条（📝 自定义备注 / Custom），内容为输入框/textarea。
- accent 使用中性灰蓝（与图一一致）。

### 4) 纯文本备注（Text-only Note）

分两种场景（必须明确）：

1) **可编辑备注（输入）**：例如预约备注
- 统一包裹为“单卡片”：
  - 标题条：🏷️ 备注
  - 内容：`textarea`

2) **仅展示备注（只读）**：例如后台 `TabTables.astro` 的备注展示
- 同样使用“单卡片”，但内容使用只读容器（不使用 textarea）：
  - 内容元素建议：`<div class="remark-note-content">…</div>`

通用约束：
- 样式与分类卡片一致（圆角、边框、间距）。
- accent 可采用中性蓝（默认使用未命中时的 `#607d8b`）。

## 交互规范
- 展开/收起：保持现有交互（不改变逻辑），但按钮/标题区的样式统一。
- 选中/取消：只切换 `.selected` class（不在 JS 中直接写 inline 样式）。
- 滚动：面板内滚动，最大高度可配置，移动端不遮挡底部操作按钮。

## 技术实现约束
- 统一样式优先使用 **CSS class + CSS 变量**；除 `--remark-accent` 与 `--remark-accent-soft` 外，禁止通过 JS 写入视觉相关的 inline style。
- 所有 remark 相关 CSS 必须以 `.remark-ui` 作为作用域根选择器前缀（例如 `.remark-ui .remark-option-btn { ... }`），避免污染全局。
- 后台当前在 `table-management.ts` 中通过 DOM API 创建元素；将其改为：
  - 输出与本文档一致的 DOM 结构与 class（`remark-ui`, `remark-category`, `category-title`, `remark-options-grid`, `remark-option-btn` 等）
  - 仅在 `.remark-category` 上设置 `style.setProperty('--remark-accent', color)` 与 `style.setProperty('--remark-accent-soft', softColor)`
  - `toggleRemark()` 只负责添加/移除 `.selected`
- 用户端（Preact）各备注区域对齐同一套 DOM/class 合约，并使用相同的颜色/图标推断规则。

## 受影响区域（参考）
（实现阶段按此清单逐一对齐）
- 后台：`src/scripts/admin/table-management.ts`（备注弹窗渲染与 toggle 逻辑）
- 后台：`src/components/admin/TabTables.astro`（备注展示区域样式）
- 用户端：`src/components/cart-modal/CartDeliveryForm.tsx`
- 用户端：`src/components/cart-modal/CartDineInRemarksPanel.tsx`
- 用户端：`src/components/cart-modal/CartTableModal.tsx`
- 纯文本备注示例：`src/components/ReservationModal.tsx`（仅 textarea 备注）
- 全局样式：`src/styles/global.css`（现有 remark 相关 class 定义，需要统一为彩色卡片规范）

## 验收标准（Definition of Done）
1. 覆盖范围内所有入口的备注 UI 均使用 `.remark-ui` 统一结构与同一套 CSS，视觉元素（标题条/边框/圆角/选中态）与“视觉基准”一致。
2. 不回归：选择/取消选择、已选预览移除、自定义备注输入与保存流程全部可用。
3. 移动端：在 320px 宽度下无横向溢出；选项网格可换行；备注面板内部滚动且不遮挡底部主要操作按钮。
4. 可访问性：所有可交互项可键盘操作，且有清晰可见的 focus 样式；移除按钮具备 `aria-label`。
5. 样式实现约束：除 `--remark-accent` 与 `--remark-accent-soft` 外不允许通过 JS 写入与视觉相关的 inline style。

