# MeituanGo Frontend

使用 Astro 构建的现代化前端，部署到 Cloudflare Pages。
## 技术栈

- **Astro** - 静态站点生成器
- **TypeScript** - 类型安全
- **Cloudflare Pages** - 边缘部署

## 项目结构.

```
meituanAstro/
├── src/
│   ├── layouts/
│   │   └── Layout.astro      # 基础布局
│   ├── pages/
│   │   ├── index.astro       # 首页
│   │   ├── [slug]/
│   │   │   ├── index.astro   # 店铺页面
│   │   │   └── admin.astro   # 商家后台
│   │   └── admin/
│   │       └── login.astro   # 登录页面
│   └── config.ts             # 配置文件
├── public/
│   │   └── favicon.svg       # 网站图标
└── package.json
```

## 页面说明

- `/` - 首页，引导进入
- `/{slug}` - 顾客店铺页面（如: `/demo`）
- `/{slug}/admin` - 商家后台管理
- `/admin/login` - 商家登录

## 本地开发
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run build

# 构建
npm run build
```

## 部署

### 手动部署到 Cloudflare Pages

1. 构建项目:

   ```bash
   npm run build
   ```

2. 使用 Wrangler 部署:
   ```bash
   npx wrangler pages deploy dist
   ```

### 自动部署 (GitHub Actions)

配置以下 Secrets:

- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare 账户 ID
- `PUBLIC_API_URL` - 后端 API 地址 (如: `https://api.yourdomain.com`)
- `PUBLIC_MQTT_BROKER` - MQTT 服务器地址

## 配置

编辑 `src/config.ts` 或在构建时设置环境变量

```bash
PUBLIC_API_URL=https://api.yourdomain.com npm run build
```

## 环境变量

| 变量名              | 说明          | 默认值                            |
| -------------------- | ------------- | ---------------------------------- |
| `PUBLIC_API_URL`     | 后端 API 地址 | `http://localhost:3030`            |
| `PUBLIC_MQTT_BROKER` | MQTT 服务器   | `wss://mqtt.serbia70.com:443/mqtt` |

## 注意事项

- 使用 `define:vars` 在script标签中传参到客户端
- 所有API请求都通过 CORS 发送到 VPS
- 登录 token 存储在localStorage

