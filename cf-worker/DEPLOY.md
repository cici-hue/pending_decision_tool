# Cloudflare Worker 部署（DeepSeek 代理）

## 部署步骤

```powershell
cd "c:\Users\CiciDuan\Downloads\pending-report-tool-v2 (1)\pending-report-tool-v2\cf-worker"
npm install
npx wrangler login
npx wrangler secret put DEEPSEEK_API_KEY
# 粘贴你的 DeepSeek key
npm run deploy
```

部署成功会得到 URL：
```
https://deepseek-proxy.YOUR_SUBDOMAIN.workers.dev
```

## 修改前端 .env

```env
VITE_API_BASE_URL=https://deepseek-proxy.YOUR_SUBDOMAIN.workers.dev
```

## 限制 CORS（生产环境）

修改 `wrangler.toml`：
```toml
ALLOWED_ORIGIN = "https://your-frontend.pages.dev"
```

然后 `npm run deploy` 重新部署。
