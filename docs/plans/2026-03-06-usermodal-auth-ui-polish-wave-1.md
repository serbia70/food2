# UserModal Auth UI Polish Wave 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变认证逻辑的前提下，整理 `UserModal` 登录/注册区域的视觉层次和交互结构，让普通注册与 Google 登录更完整自然。

**Architecture:** 仅调整 `UserModal.tsx` 的认证区结构与文案，不改认证 helper、不改接口、不改 Google SDK 初始化。通过小范围结构整理，让登录态与注册态都呈现一致的认证卡片布局。

**Tech Stack:** Preact, TypeScript, inline component styles

---

### Task 1: 整理认证区结构层次

**Files:**
- Modify: `meituanAstro/src/components/UserModal.tsx`

**Step 1: 保留核心交互**

不改：
- 登录/注册切换逻辑
- 认证请求逻辑
- Google 登录逻辑
- 错误处理逻辑

**Step 2: 调整视觉结构顺序**

整理为：
- 标题
- 副标题
- 注册态账号类型切换
- 表单输入区
- 主按钮
- Google 分隔区
- Google 按钮
- 错误提示
- 模式切换入口

---

### Task 2: 补充注册态账号类型切换与文案

**Files:**
- Modify: `meituanAstro/src/components/UserModal.tsx`

**Step 1: 注册态显示账号类型按钮**

显示：
- 手机号
- 邮箱
- ID

并绑定现有 `regAccountType`。

**Step 2: 补充副标题文案**

登录态：

```text
登录以继续点餐 / Prijavite se da nastavite
```

注册态：

```text
创建账号，快速开始点餐 / Napravite nalog za brzu porudzbinu
```

---

### Task 3: 保持 Google 区域一致呈现

**Files:**
- Modify: `meituanAstro/src/components/UserModal.tsx`

**Step 1: 优化分隔文案与留白**

Google 区保持登录/注册态都显示，分隔区视觉更自然。

**Step 2: 错误提示位置统一**

错误提示放在 Google 区域下方，模式切换入口上方。

---

### Task 4: 静态复核

**Files:**
- Modify: `docs/plans/2026-03-06-usermodal-auth-ui-polish-wave-1.md`

**Step 1: 记录完成范围**

记录本轮只改 UI 结构与文案，不改认证逻辑。

**Step 2: 记录后续建议**

后续再考虑把 `UserModal` 样式从内联 style 进一步抽离。
