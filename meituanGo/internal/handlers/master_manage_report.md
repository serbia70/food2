# MasterManage 剩余动作分类清单

## 当前仍保留的 action

- `impersonate_shop`

## 分类结论

### 保留

- `impersonate_shop`
  - 属于主控台特殊能力，不是普通 CRUD / settings / billing 主流程
  - 当前未见新显式替代接口调用方，但保留成本低，误删风险高

当前状态：`MasterManage` 现仅保留 `impersonate_shop`。

### 已迁为显式路由并可继续评估调用方

- `update_rate_center`
- `batch_update_commission`
- `trigger_backup`

原因：
- 已具备显式路由或显式代理，不应再继续通过 `MasterManage` 承载
- 后续若仓库内确认无旧客户端调用，可视情况彻底移除相关遗留文档描述

### 已删除（已具备显式路由，仓库内未见调用）

- `set_shop_plan`
  - 显式路由已存在：`POST /api/master/shop-plan`

- `get_shop_billing`
  - 显式路由已存在：`POST /api/master/shop-billing`

- `renew_shop`
  - 显式路由已存在：`POST /api/master/shop-renew`

- `approve_renew`
  - 显式路由已存在：`POST /api/master/shop-renew/approve`

- `reject_renew`
  - 显式路由已存在：`POST /api/master/shop-renew/reject`

当前状态：上述五项已从 `MasterManage` 中删除。

- `adjust_shop_balance`
	- 功能上已可由 `POST /api/master/shop-balance` 覆盖主流程充值/调整场景
	- 当前状态：已确认与显式路由等价，并已从 `MasterManage` 中删除

## 删除前检查项

删除上述候选 action 前，需要再次确认：

1. 仓库内前端代码没有继续发送这些 action 名称
2. 后端测试没有继续通过 `MasterManage` 覆盖这些 action
3. 文档中没有把这些 action 当成现行接口继续描述
4. 显式路由的 payload 语义与旧 action 语义一致

## 推荐下一步顺序

1. 继续确认 `impersonate_shop` 是否需要显式路由，还是长期保留为特殊入口
2. 清理仍把 `trigger_backup` / `update_rate_center` / `batch_update_commission` 描述成 manage action 的文档残留
3. 若无兼容调用，再考虑彻底下线 `MasterManage`
