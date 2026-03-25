# Safe Upload Batch Script Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this design task-by-task.

**Goal:** 提供一个默认安全的 Windows bat 上传脚本，在当前分支上先展示改动、要求用户输入提交信息并二次确认，再提交并推送，避免 `git add .` 带来的误提交。

**Architecture:** 脚本只负责 git 工作流收口，不负责选择业务文件。它默认只收已跟踪文件修改（`git add -u`），对未跟踪文件只提示用户先手动 `git add 文件名`。这样脚本能保持简单，同时把误把 plans/specs/临时文件一并上传的风险降到最低。

**Tech Stack:** Windows batch, git

---

## Scope

### In scope
- 新建一个安全上传 bat 脚本
- 显示当前分支与 `git status --short`
- 无改动时直接退出
- 用户输入 commit message
- 二次确认后执行提交和推送
- 使用 `git add -u`，不自动添加未跟踪文件
- `git commit` 或 `git push` 失败时停止并提示

### Out of scope
- 不自动 `git add .`
- 不自动 `git add -A`
- 不自动 force push
- 不自动切换分支
- 不自动处理 merge conflict / hook 失败
- 不自动把未跟踪文件加入提交

---

## UX / behavior

### Script name
- 建议文件名：`安全上传.bat`

### Flow
1. 检查当前目录是否为 git 仓库
2. 显示当前分支
3. 显示 `git status --short`
4. 若无改动则退出
5. 明确提示：脚本只会执行 `git add -u`，未跟踪文件不会自动加入
6. 读取用户输入的 commit message
7. 为空则退出
8. 二次确认（输入 `y` 才继续）
9. 执行：
   - `git add -u`
   - `git commit -m "..."`
   - `git push -u origin HEAD`
10. 任一步失败则停止

### Safety rules
- 默认策略必须是“先确认再推”
- 不允许默认全量上传
- 新文件必须由用户手动 `git add 文件名` 后，脚本再继续提交

---

## File target

- Create: `D:/ai/food/.worktrees/260311/food2astro/安全上传.bat`
- Reference: `D:/ai/food/.worktrees/260311/food2astro/zzz上传.bat`
- Reference: `D:/ai/food/.worktrees/260311/food2astro/github.bat`

---

## Acceptance criteria

- 双击脚本后能看到当前分支和变更列表
- 没有改动时不会继续 commit / push
- 未跟踪文件不会被自动提交
- 输入空提交信息时脚本退出
- 只有用户确认后才会 commit / push
- push 目标是当前分支的 `origin HEAD`
- 不使用 `git add .` 或 `git add -A`
