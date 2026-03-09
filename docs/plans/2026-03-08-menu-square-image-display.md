# Menu Square Image Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让菜单页中的菜品图片无论原图是横图还是竖图，都以统一正方形缩略图展示，同时不修改原始上传文件。

**Architecture:** 本次仅调整展示层，不改上传链路、数据库字段或后端图片处理。前台 `MenuList.tsx` 使用固定 1:1 图片容器并保持 `object-fit: cover`，后台菜单管理缩略图继续保持一致的正方形预览，确保前后台视觉预期统一。

**Tech Stack:** Astro, Preact, TypeScript, existing CSS and inline styles

---

### Task 1: 固定前台菜单卡片图片为正方形

**Files:**
- Modify: `meituanAstro/src/components/MenuList.tsx`
- Reference: `meituanAstro/src/styles/global.css`

**Step 1: 先确认当前图片容器行为**

阅读 `meituanAstro/src/components/MenuList.tsx` 中图片渲染区域，确认当前结构是：

```tsx
<div style={{ width: '75px', height: '100%', marginRight: '8px', flexShrink: 0 }}>
  <img
    src={p.img}
    alt={p.name}
    onClick={() => setPreviewImg(p.img)}
    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }}
  />
</div>
```

确认问题点：容器高度跟随卡片，不是严格 1:1。

**Step 2: 先写一个最小展示约束注释清单（不新增代码注释）**

本任务实现时必须同时满足：

- 图片容器固定为正方形
- 一列 / 两列图文布局都生效
- 文本模式不受影响
- 点击预览大图逻辑不变

**Step 3: 修改图片容器为固定正方形尺寸**

把图片区域调整为类似下面的结构：

```tsx
const imageBoxSize = isOneCol ? 84 : 72;

<div
  style={{
    width: `${imageBoxSize}px`,
    height: `${imageBoxSize}px`,
    marginRight: '8px',
    flexShrink: 0,
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#edf2f7',
  }}
>
  <img
    src={p.img}
    alt={p.name}
    onClick={() => setPreviewImg(p.img)}
    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
  />
</div>
```

要求：

- `image-1col` 与 `image-2col` 都保持 1:1
- `text-*` 模式继续隐藏图片
- 不修改大图预览弹层逻辑

**Step 4: 检查卡片内容区是否需要微调**

如果图片变为严格正方形后，文本区出现垂直挤压，则只做最小调整，例如：

- 轻微调整 `minHeight`
- 或对 `alignItems` / `justifyContent` 做小幅修正

禁止顺手重构整张卡片。

**Step 5: 本地构建验证**

Run: `pnpm build`

Expected: build 成功，无新增 TypeScript / Astro 报错。

---

### Task 2: 保持后台菜单管理缩略图与前台预期一致

**Files:**
- Reference: `meituanAstro/src/components/admin/TabMenu.astro`
- Modify: `meituanAstro/src/styles/admin-global.css`

**Step 1: 检查后台缩略图当前尺寸**

确认 `meituanAstro/src/styles/admin-global.css` 当前定义：

```css
.prod-img img { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; background: #eee; }
```

**Step 2: 判断是否需要仅补齐容器语义**

如果后台当前已经是正方形，只做最小增强，例如给 `.prod-img` 补上固定容器约束，避免异常图片撑开：

```css
.prod-img {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  overflow: hidden;
  border-radius: 4px;
  background: #eee;
}

.prod-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
```

不要改成更大尺寸，保持后台信息密度。

**Step 3: 本地构建验证**

Run: `pnpm build`

Expected: build 成功。

---

### Task 3: 做最小人工验证并记录结果

**Files:**
- Optional Modify: `docs/plans/2026-03-08-menu-square-image-display.md`

**Step 1: 启动开发环境**

Run: `pnpm run dev`

Expected: 本地开发服务正常启动。

**Step 2: 手动验证菜单页图文两种布局**

访问一个存在横图和竖图菜品的店铺页面，核对：

- `image-2col` 下图片均为正方形
- `image-1col` 下图片均为正方形
- 图片被合理裁切而不是拉伸变形
- 点击图片后大图预览仍显示原图比例

**Step 3: 手动验证后台菜单页**

访问 `http://localhost:3000/admin/01` 的菜单 tab，核对：

- 商品列表缩略图仍为正方形
- 新增菜品上传图片后，填写的 URL 不受影响
- 编辑菜品弹窗中的图片字段不受影响

**Step 4: 记录验证结论**

在本计划文件末尾追加简短记录：

- 哪些页面已验证
- 是否存在裁切过重的个别图片
- 是否需要后续提供“安全裁切区/手动裁剪”增强

---

### Task 4: 回归检查并准备交付说明

**Files:**
- Modify: `meituanAstro/src/components/MenuList.tsx`
- Modify: `meituanAstro/src/styles/admin-global.css`

**Step 1: 重新检查是否误改上传逻辑**

确认以下文件没有被不必要修改：

- `meituanAstro/src/scripts/admin/admin-entry.ts`
- `meituanAstro/src/pages/api/upload.ts`

本次目标仅是显示正方形，不是上传裁剪。

**Step 2: 执行最终构建**

Run: `pnpm build`

Expected: build 成功。

**Step 3: 准备交付说明**

最终说明必须包含：

- 正方形显示是前端展示层行为
- 原图文件未被修改
- 横图/竖图会自动居中裁切显示
- 如后续想“上传即裁成正方形”，需要单独改上传链路

---

## Execution Record

### 已完成实现

- 已在 `meituanAstro/src/components/MenuList.tsx` 中将图文菜单图片容器改为固定正方形
- 一列模式使用更大的正方形缩略图，两列模式使用更紧凑的正方形缩略图
- 仍保持 `object-fit: cover`，因此横图/竖图会统一裁切填满，不会被拉伸变形
- 文本模式未改动，图片预览弹层逻辑未改动
- 已在 `meituanAstro/src/styles/admin-global.css` 中为后台 `.prod-img` 补齐固定正方形容器约束，避免异常图片撑开布局

### 验证记录

#### 1. 构建验证

Run:

```bash
pnpm build
```

Result: PASS

说明：构建期间仍有既有 Vite warning，内容与 `table-actions.ts` 的动态/静态混合导入有关，不是本次改动引入。

#### 2. 开发服务验证

Run:

```bash
pnpm run dev --host 127.0.0.1
```

Result: DEV SERVER STARTED

本地服务成功启动在：`http://127.0.0.1:3000/`

### 本轮实际可确认项

- 前台图文菜单的图片渲染逻辑已改为固定 1:1 容器
- 后台菜单管理列表缩略图已补充固定 1:1 容器
- 上传逻辑、图片 URL、后端接口未修改

### 待人工页面确认项

建议打开页面做最终视觉确认：

- 店铺菜单页 `image-2col` 下横图与竖图是否都呈现为统一正方形
- 店铺菜单页 `image-1col` 下横图与竖图是否都呈现为统一正方形
- 点击菜品图片后，大图预览是否仍保持原始比例
- 后台 `http://localhost:3000/admin/01` 菜单 tab 中缩略图是否仍为正方形

### 后续增强候选

- 对极端长图提供“安全裁切区”或手动封面裁切能力
- 为后台编辑弹窗增加实时缩略图预览，便于上传后立即确认裁切效果
