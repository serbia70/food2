# Master Global Settings Wave 2 Design

## 背景

当前 Astro 版 `/master` 已经具备：
- 店铺管理
- 经营总览
- 全局设置一期（套餐与提成、超级密码）

但相对参考页 `meituanGo/static/master.html`，`全局设置` 仍缺少一批高频运营配置，主要集中在：
- 页脚信息
- 汇率与展示费率
- 微信联系信息
- 图片 / R2 上传相关设置
- 备份配置

这些配置属于“系统级参数”，不依附某个店铺，而是影响整站或整套后台行为，因此应继续归在 `/master` 的 `全局设置` tab 中，而不是散落到其他 tab。

## 目标

在不回退到旧版大单文件页面的前提下，为 Astro 版 `/master` 扩展第二波全局设置能力，让超级管理员可以在当前组件化界面中完成旧版 `settings` 区最重要的一批系统配置。

本轮目标包括：
- 展示并编辑页脚信息
- 展示并编辑汇率 / 展示费率相关字段
- 展示并编辑微信联系信息
- 展示并编辑图片 / R2 相关字段
- 展示并编辑备份相关字段
- 所有设置项都有明确默认值、保存反馈与失败提示

## 非目标

本轮不做：
- 旧版 `settings` 区整块原样搬运
- 把所有设置合并为一个超大表单统一提交
- 重写后端 master 设置协议
- 实现真实文件上传流程本身
- 实现备份恢复的完整操作台

## 方案比较

### 方案 A：分组卡片扩展（推荐）

做法：
- 保留现有 `全局设置` tab
- 按业务主题新增多张设置卡片
- 每张卡片独立渲染、独立提交、独立反馈

优点：
- 与当前 Astro 组件结构一致
- 改动边界清晰，容易逐块联调
- 某一类设置失败时不会拖垮整页
- 后续继续加设置项时扩展成本低

缺点：
- 保存入口较分散
- 与旧版“保存全部”心智不完全一致

### 方案 B：单大表单扩展

做法：
- 在现有 `全局设置` tab 中放一个超大 settings form
- 所有字段统一“保存全部”

优点：
- 更接近旧版操作方式
- 一次提交全部设置

缺点：
- payload 体积大，容错复杂
- 某处字段格式不匹配时容易整表单失败
- 前端代码会快速膨胀

### 方案 C：旧版 settings 区原样移植

做法：
- 直接参考 `master.html` 的 HTML 和脚本结构重建

优点：
- 外观和旧版最接近
- 短期内视觉差异最小

缺点：
- 会破坏当前 Astro 版组件化结构
- 把问题重新带回“大模板 + 大脚本”模式
- 后续维护和测试成本更高

## 选型结论

采用方案 A：分组卡片扩展。

理由：
- 与当前 `meituanAstro/src/pages/master/index.astro` 的结构最兼容
- 能最小风险补回旧版核心能力
- 更适合后续继续补 `续费列表`、`批量修改` 等其它缺口

## 页面与组件设计

### 页面入口

继续使用现有页面：
- `meituanAstro/src/pages/master/index.astro`

继续保留现有 `全局设置` tab，不新增新路由。

### 新增卡片

在现有两张卡片基础上，新增以下组件：
- `MasterFooterSettingsCard.astro`
- `MasterRateSettingsCard.astro`
- `MasterWechatSettingsCard.astro`
- `MasterStorageSettingsCard.astro`
- `MasterBackupSettingsCard.astro`

卡片职责如下。

#### 1. 页脚与联系设置

字段：
- `footerText`
- `footerPhone`
- `footerCopyright`

用途：
- 统一站点页脚文案和联系电话展示

#### 2. 汇率与展示费率设置

字段：
- `exchangeRate`
- `displayFinalRate`
- `rateBase`
- `rateOffset`
- `rateStep`

用途：
- 控制平台展示汇率、最终费率和展示逻辑参数

#### 3. 微信联系设置

字段：
- `wechatId`
- `wechatContactQr`
- 如现有 `settings` 已包含微信支付码字段，则兼容读取但本轮优先先做联系配置

用途：
- 统一站点微信联系方式与联系二维码

#### 4. 图片 / R2 设置

字段：
- `r2PublicDomain`
- `uploadStrictR2`

用途：
- 控制图片对外访问域名及上传策略

#### 5. 备份设置

字段：
- `backupTime`
- `backupRetention`
- `backupTarget`
- `backupHost`
- `backupUser`
- `backupPass`
- `backupPath`
- `backupEndpoint`
- `backupBucket`

用途：
- 统一后台自动备份的目标与计划配置

## 数据模型设计

### 读取

仍由 `/api/master/init` 返回 `settings` 原始对象。

前端新增一个 view helper，把 `settings` 归一为渲染友好的结构，负责：
- 缺失字段给默认值
- 数字字段转为可输入值
- 布尔字段转为明确 boolean
- 按卡片维度导出字段

建议扩展现有：
- `meituanAstro/src/lib/master-settings-view.ts`

输出大致分为：
- `pricing`
- `footer`
- `rate`
- `wechat`
- `storage`
- `backup`

这样页面和卡片只消费规整后的 view model，不直接解析原始 `settings`。

### 提交

继续使用：
- `/api/master/manage`

每张卡片单独提交，action 分离，避免一个大 payload 覆盖全部设置。

建议 action：
- `update_footer_settings`
- `update_rate_settings`
- `update_wechat_settings`
- `update_storage_settings`
- `update_backup_settings`

如果后端当前仍只支持统一 `update_settings`，则前端可以保持独立卡片，但向后端发送对应子 payload；若后端不兼容，则必须显示明确错误，不允许静默成功。

## 交互设计

### 保存反馈

每张卡片都要有独立反馈区：
- 保存中...
- 保存成功
- 保存失败：具体错误或通用错误提示

### 表单校验

最小前端校验：
- 数字字段必须可转数字
- `backupRetention` 不能小于 1
- 备份目标为 `s3` 时，要求 `backupEndpoint` 与 `backupBucket`
- 备份目标为传统主机时，优先显示 `host/user/pass/path`

### 条件显隐

备份卡片需要根据 `backupTarget` 做动态显隐：
- `s3` 模式显示 `endpoint/bucket`
- 其他模式显示通用主机字段

### 失败降级

如果某张卡片保存失败：
- 仅影响该卡片
- 不刷新整页
- 保留用户输入

## 兼容性与风险控制

### 与现有 Astro 结构兼容

要求：
- 不破坏现有 `店铺管理`、`经营总览` tab
- 不影响现有详情抽屉、编辑、充值、代入后台逻辑
- 保持 `全局设置` tab 的卡片式布局

### 与后端兼容

风险点：
- 后端 `settings` 字段命名可能与旧版 DOM id 不完全一致
- `/api/master/manage` 可能尚未支持某些 action

处理策略：
- 前端 view helper 做字段兜底
- 提交失败时显示后端返回 error
- 不伪造“保存成功”

## 测试设计

### 单元测试

先补 `master-settings-view` 测试，覆盖：
- 原始 settings 到各卡片 view model 的映射
- 缺失字段默认值
- 布尔和数字字段归一

必要时再补提交 payload helper 的测试，覆盖：
- rate payload
- footer payload
- backup target 条件字段

### 手工验证

本地运行：
- `pnpm run dev`
- 打开 `http://localhost:3000/master?tab=settings`

重点验证：
- 所有新增卡片都能展示默认值
- 保存按钮有明确反馈
- 备份 target 切换时显隐正确
- 旧卡片功能不回归

## 分阶段落地顺序

建议按以下顺序实现：
1. 扩展 `master-settings-view` 与测试
2. 先接 `页脚` 和 `汇率` 两张卡片
3. 再接 `微信` 和 `R2` 卡片
4. 最后接 `备份` 卡片与条件显隐
5. 跑测试与构建

## 预期结果

完成后，Astro 版 `/master` 的 `全局设置` 将不再只有一期的套餐和密码功能，而会补上旧版主控台里最关键的一批系统配置，形成一个可持续扩展的组件化设置中心。
