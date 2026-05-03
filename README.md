# MeituanGo Frontend

使用 Astro 构建的现代化前端，部署到 Cloudflare Pages。
## 技术栈

- **Astro** - 静态站点生成器
- **TypeScript** - 类型安全
- **Cloudflare Pages** - 边缘部署

## 项目结构

```text
src/
├── pages/        路由层（页面 + API）
│   ├── [slug]/   顾客店铺页
│   ├── admin/    商家后台页
│   ├── master/   主控后台页
│   └── api/      同源代理 / 登录 / 管理接口
├── components/   Astro 组件与 Preact islands
├── lib/          共享业务逻辑、状态、归一化
├── layouts/      全局布局
├── styles/       全局样式
└── config.ts     运行时配置
public/           静态资源
scripts/          Node 测试与校验脚本
```

## 页面说明

- `/` - 首页，引导进入
- `/{slug}` - 顾客店铺页面（如：`/demo`）
- `/admin/{slug}` - 商家后台管理
- `/admin/{slug}/login` - 商家登录
- `/master` - 主控后台
- `/master/login` - 主控登录

## 本地开发
```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建
pnpm build
```

## 部署

### 手动部署到 Cloudflare Pages

1. 构建项目:

   ```bash
   pnpm build
   ```

2. 使用 Wrangler 部署:
   ```bash
   pnpm exec wrangler pages deploy dist
   ```

### 自动部署 (GitHub Actions)

配置以下 Secrets:

- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare 账户 ID
- `PUBLIC_API_URL` - 后端 API 地址 (如: `https://api.yourdomain.com`)
- `PUBLIC_MQTT_BROKER` - MQTT 服务器地址

## 配置

编辑 `src/config.ts` 或在构建时设置环境变量

```bash
PUBLIC_API_URL=https://api.yourdomain.com pnpm build
```

## 环境变量

| 变量名              | 说明          | 默认值                            |
| -------------------- | ------------- | ---------------------------------- |
| `PUBLIC_API_URL`     | 后端 API 地址 | `https://food2api.serbia70.com`            |
| `PUBLIC_MQTT_BROKER` | MQTT 服务器   | `wss://mqtt.serbia70.com:443/mqtt` |

## 注意事项

- 使用 `define:vars` 在script标签中传参到客户端
- 所有API请求都通过 CORS 发送到 VPS
- 登录 token 存储在localStorage

