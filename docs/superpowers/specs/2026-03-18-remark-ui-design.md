# 备注 UI 彩色卡片统一设计（后台 + 用户端）

日期：2026-03-18

## 背景
当前项目存在多处“备注”相关 UI：
- 后台（`/admin/*`）的“添加备注”弹窗：已具备彩色分类卡片风格（图一），但与其他备注区域的结构/CSS/交互细节不完全一致。
- 用户端购物车/堂食/外卖相关的“口味备注”：整体仍偏灰色普通样式（图二），与后台风格割裂。
- 另有一些“备注”仅为纯文本输入（例如预约备注），视觉上也与图一不统一。

目标是将所有“备注”统一成图一的“彩色分组卡片”视觉体系。

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
### 1) 分类卡片（Remark Category Card）
**结构：**
- `category-title`：彩色标题条（背景色为 `--remark-accent`），左侧可包含图标，标题文本显示分类名。
- `remark-options-grid`：内容区，带边框（`--remark-accent`），顶部与标题条连接。
- 内部按钮 `remark-option-btn`：
  - 支持两行：主文本（中文）+ 副文本（英文/说明）
  - 选中态：添加 `.selected`，通过 `--remark-accent` 统一渲染（边框、浅色底、字色、主文本加粗）。

**颜色/图标规则：**
按分类名（中英文关键字）推断 accent 色与图标（与现有后台逻辑对齐）：
- 辣/Spiciness：橙红（🌶️）
- 忌口/Exclusions：红（🚫）
- 健康/Healthy：绿（🥬）
- 过敏/Allergies：橙（⚠️）
- 修改/Modifications：蓝（⚙️）
- 其他未命中：中性灰蓝

> 规则应在后台与用户端一致，避免同一分类在不同入口颜色不同。

### 2) 已选预览（Selected Preview Tags）
- 展示为 tag 列表，可移除（×）。
- 视觉风格与图一协调：圆角、轻量阴影/描边可选。
- 颜色策略：
  - 默认可用统一中性底色（避免多色过于花），或
  - 若需要更“彩色”，可根据所属分类 accent 着色（需在实现阶段评估归类方式）。

### 3) 自定义备注（Custom Remark）
- 作为“一个分类卡片”呈现：标题条（📝 自定义备注 / Custom），内容为输入框/textarea。
- accent 使用中性灰蓝（与图一一致）。

### 4) 纯文本备注（Text-only Note）
- 统一包裹为“单卡片”：
  - 标题条：🏷️ 备注
  - 内容：textarea
- 样式与分类卡片一致（圆角、边框、间距），accent 可采用中性蓝。

## 交互规范
- 展开/收起：保持现有交互（不改变逻辑），但按钮/标题区的样式统一。
- 选中/取消：只切换 `.selected` class（不在 JS 中直接写 inline 样式）。
- 滚动：面板内滚动，最大高度可配置，移动端不遮挡底部操作按钮。

## 技术实现约束
- 统一样式优先使用 CSS class + CSS 变量，减少 inline styles。
- 后台当前在 `table-management.ts` 中通过 DOM API 创建元素；将其改为：
  - 设置统一 class（`remark-category`, `category-title`, `remark-options-grid`, `remark-option-btn` 等）
  - 在分类容器或标题元素上设置 `style.setProperty('--remark-accent', color)`（或 data 属性由 CSS 映射）。
  - `toggleRemark()` 只负责添加/移除 `.selected`。
- 用户端（Preact）各备注区域对齐同一套 class 命名与结构，并使用相同的颜色推断规则。

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
1. 后台 + 用户端 + 纯文本备注：均呈现统一的彩色卡片风格（与图一一致）。
2. 备注功能无回归：可选项选择/取消、预览移除、保存备注、输入自定义备注均正常。
3. 手机端体验良好：布局不挤、不横向溢出，滚动区域合理。

