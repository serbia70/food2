# admin_compat 调用面清单

## 当前仍然注册的兼容入口

- `POST /api/admin/update`
- `PUT /api/admin/orders/:id/status`

## `/api/admin/update` 当前 action 映射

- 当前已不再承载订单状态、付款、拒单等主流程动作
- 相关 compat 分支已删除，订单主流程已走显式接口

## 当前仓库中已确认的调用来源

### master 页面已迁走的 action（当前已不再直接依赖总线）

- `meituanAstro/src/pages/master/index.astro`
  - `create_shop` -> `POST /api/master/shops`
  - `update_shop` -> `PUT /api/master/shops/:id`
  - `delete_shop` -> `DELETE /api/master/shops/:id`
  - `topup_shop_balance` -> `POST /api/master/shop-balance`
  - `update_master_password` -> `POST /api/master/password`
  - `update_settings` -> `POST /api/master/settings`
  - `update_categories` -> `POST /api/master/categories`

说明：master 页面最常用的大头 action 已经开始脱离 action 总线。

### master 页面当前仍直接调用 `/api/master/manage`

- `meituanAstro/src/pages/master/index.astro`
  - `trigger_backup`
  - 以及少量尚未显式化的特殊动作

### admin 页面主要已迁移到显式接口

- `meituanAstro/src/scripts/admin/order-actions.ts`
  - 使用 `/api/admin/orders/:id/status`
  - 使用 `/api/admin/orders/:id/mark-paid`

- `meituanAstro/src/scripts/admin/table-management.ts`
  - 主要使用显式接口
  - 桌台 review 已使用 `/api/admin/tables/:table/reviews/approve|reject`
  - 未见继续依赖 `/api/admin/update`

## 结论

- `admin_compat.go` 目前仍不能直接删除，但风险面已经明显缩小
- `update_settings` / `update_master_settings` 已无真实调用，compat 分支已删除
- `approve_table_reviews` / `reject_table_reviews` 已迁到正式路由，compat 分支已删除
- `update_order_status` / `mark_paid` / `reject_order` 已迁到正式订单接口，compat 分支已删除
- `MasterManage` 当前也仍不能直接删除，但其大头 action 已迁往显式接口
- 下一步正确方向是：
  1. 继续迁少量剩余特殊动作（如备份触发、套餐/续费类动作）
  2. 清点无调用 action
  3. 再缩小 `MasterManage` / `admin_compat.go` 的 action 集
  4. 最后下线总线式入口

## 当前剩余待迁动作（优先级）

1. `trigger_backup`
2. `set_shop_plan`
3. `get_shop_billing`
4. `renew_shop`
5. `approve_renew`
6. `reject_renew`
7. `update_rate_center`
8. `batch_update_commission`

## 下一轮可删除候选

- `MasterManage` 中已迁走且前端/测试已不再调用的 action 分支：
  - `create_shop`
  - `update_shop`
  - `delete_shop`
  - `topup_shop_balance`
  - `update_master_password`
  - `update_settings`
  - `update_categories`

删除条件：
- 确认仓库内没有前端、脚本、文档或外部兼容客户端继续依赖这些 action 名称。

当前状态：
- 前端主流程已迁走
- 相关后端测试已迁到显式路由
- `MasterManage` 中上述分支已删除
