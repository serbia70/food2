# Safe Upload Batch Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个默认安全的 Windows bat 上传脚本，用于在当前分支上先确认再提交推送，避免误把整个工作区一键上传。

**Architecture:** 直接在仓库根目录新增一个 focused bat 脚本，复用 git CLI，不引入额外依赖。脚本默认只 `git add -u`，把未跟踪文件留给用户手动选择，从而保持最小行为和清晰安全边界。

**Tech Stack:** Windows batch, git

---

## File Map

### Create
- `安全上传.bat` — 安全提交/推送脚本，显示状态、读取提交信息、二次确认后执行 `git add -u` + commit + push

### Reference
- `github.bat` — 现有脚本风格参考
- `zzz上传.bat` — 反例，不能继续使用 `git add .`
- Spec: `docs/superpowers/specs/2026-03-25-safe-upload-bat-design.md`

---

### Task 1: 实现安全上传脚本

**Files:**
- Create: `安全上传.bat`
- Reference: `github.bat`
- Reference: `zzz上传.bat`

- [ ] **Step 1: 先写失败契约测试（轻量源码断言）**

新增一个轻量 `node:test` 源码断言文件，锁定脚本必须包含：

```ts
assert.match(source, /git status --short/);
assert.match(source, /git add -u/);
assert.match(source, /git push -u origin HEAD/);
assert.doesNotMatch(source, /git add \.\b/);
assert.doesNotMatch(source, /git add -A/);
```

并锁定脚本包含：
- 输入 commit message
- 空 message 直接退出
- 明确的二次确认提示

- [ ] **Step 2: 运行测试确认先失败**

Run:
```bash
node --test <新测试文件路径>
```
Expected: FAIL，因为脚本还不存在。

- [ ] **Step 3: 写最小 bat 实现**

脚本逻辑必须包含：

```bat
@echo off
setlocal

git rev-parse --is-inside-work-tree >nul 2>nul || exit /b 1
for /f "delims=" %%i in ('git branch --show-current') do set BRANCH=%%i

echo Branch: %BRANCH%
git status --short

for /f "delims=" %%i in ('git status --short') do set HAS_CHANGES=1
if not defined HAS_CHANGES exit /b 0

echo NOTE: only tracked file changes will be staged via git add -u
set /p MSG=Commit message:
if "%MSG%"=="" exit /b 1
set /p CONFIRM=Continue? [y/N]:
if /I not "%CONFIRM%"=="y" exit /b 1

git add -u || exit /b 1
git commit -m "%MSG%" || exit /b 1
git push -u origin HEAD || exit /b 1
```

要求：
- 不使用 `git add .`
- 不使用 `git add -A`
- 失败即退出
- 允许用户先手动 `git add` 新文件再运行脚本

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
node --test <新测试文件路径>
```
Expected: PASS

- [ ] **Step 5: 手工 dry-run 检查脚本文案**

检查脚本内容确认：
- 会显示当前分支
- 会显示 `git status --short`
- 会提醒“未跟踪文件不会自动加入”
- commit message 为空时退出
- 必须输入 `y` 才继续

- [ ] **Step 6: 提交**

```bash
git add 安全上传.bat <新测试文件路径> docs/superpowers/specs/2026-03-25-safe-upload-bat-design.md docs/superpowers/plans/2026-03-25-safe-upload-bat.md
git commit -m "feat(tooling): add safe upload batch script"
```

---

## Definition of Done

- 仓库根目录存在 `安全上传.bat`
- 脚本默认走“先确认再推”
- 不会自动提交未跟踪文件
- 不使用 `git add .` / `git add -A`
- 有基础源码契约测试
- 用户可以直接双击使用
