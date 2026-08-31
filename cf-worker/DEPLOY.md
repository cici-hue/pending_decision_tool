# Cloudflare Workers 部署指南

## 📋 部署前准备

### 1. 安装依赖并登录

```powershell
cd "c:\Users\CiciDuan\Downloads\pending-report-tool-v2 (1)\pending-report-tool-v2\cf-worker"
npm install
npx wrangler login
```

### 2. 创建 D1 数据库

```powershell
npx wrangler d1 create pending-report-db
```

会返回类似：
```
✅ Successfully created DB 'pending-report-db' in region APAC
database_id = "abc123def456..."
```

**复制 `database_id` 并替换 `wrangler.toml` 中的 `REPLACE_WITH_YOUR_D1_ID`**

### 3. 初始化数据库 Schema

**生产环境**：
```powershell
npm run db:init
```

### 4. 设置密钥（Secret）

```powershell
# DeepSeek API Key（新生成的）
npx wrangler secret put DEEPSEEK_API_KEY
# 粘贴你的 key，回车

# JWT Secret（强随机字符串）
npx wrangler secret put JWT_SECRET
# 粘贴：nPf24L07yatwxSM8QvSfucprvGUNe5c2a+bdN2hyO9k1qXVRugdfwaAD5z4M2IF9
```

### 5. 本地测试

```powershell
npm run dev
```

浏览器访问 `http://localhost:8787/` 应该看到：
```json
{"status":"ok","service":"pending-report-backend","timestamp":"..."}
```

### 6. 部署到生产

```powershell
npm run deploy
```

部署成功后会得到 URL：
```
https://pending-report-backend.YOUR_SUBDOMAIN.workers.dev
```

### 7. 更新前端 .env

修改根目录 `.env`：
```env
VITE_API_BASE_URL=https://pending-report-backend.YOUR_SUBDOMAIN.workers.dev
```

## 💾 关于图片存储

**D1 存储图片（无需 R2）**：
- 单条记录最大约 1MB
- 建议图片压缩到 800KB 以内
- 支持格式：JPEG, PNG, GIF, WebP

如果以后图片量很大（>10,000 张），可以再考虑升级到 R2。

## 🔒 部署后必须做的事

### 1. 首次访问会自动创建默认管理员

首次调用任意 API 或访问 Worker 时会自动创建：
- 用户名：`admin`
- 密码：`admin123`

**部署后立即登录并修改密码！**

### 2. 撤销旧 DeepSeek key

访问 https://platform.deepseek.com/ 撤销 `sk-59903d7276654dfdb8baa24f7153c50a` 并生成新 key。

### 3. 限制 CORS 源

修改 `wrangler.toml`：
```toml
[vars]
ALLOWED_ORIGIN = "https://your-frontend.pages.dev"
```

然后重新部署：`npm run deploy`

## 🆘 常见问题

### Q: 部署时报 "d1_database ... not found"
A: 需要先运行 `npx wrangler d1 create pending-report-db`，然后把返回的 ID 填到 `wrangler.toml`。

### Q: 登录后报 "令牌无效"
A: 检查 `wrangler secret put JWT_SECRET` 是否设置了。

### Q: 上传图片失败
A: D1 单条记录最大约 1MB，请压缩图片到 800KB 以内。

### Q: 数据库操作报错
A: 运行 `npm run db:init` 初始化表结构。
