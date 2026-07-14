# 简岗配 AI Worker

阶段 8 的 Cloudflare Worker 只服务平台 AI 模式：

前端携带 Supabase access token、`requestId`、`resumeProfile` 和 `jobDraft` 调用 Worker；Worker 校验登录、额度、限流和重复请求后调用 DeepSeek。只有 DeepSeek 成功返回且 JSON 解析成功后，Worker 才扣减平台 AI 额度。

## 环境变量

不要在代码、README、GitHub 或前端写真实密钥。

必需配置：

- `DEEPSEEK_API_KEY`：DeepSeek API Key，必须用 Worker secret 保存
- `SUPABASE_URL`：Supabase 项目 URL
- `SUPABASE_SERVICE_ROLE_KEY`：Supabase service role key，必须用 Worker secret 保存
- `ALLOWED_ORIGIN`：允许访问 Worker 的前端域名，例如 GitHub Pages 域名
- `DEEPSEEK_MODEL`：默认 `deepseek-v4-pro`

`SUPABASE_SERVICE_ROLE_KEY` 只能放在 Worker 环境变量中，不能放到前端。

## 部署步骤

1. 安装 Wrangler：

```bash
npm install -g wrangler
```

2. 登录 Cloudflare：

```bash
wrangler login
```

3. 复制示例配置：

```bash
cd worker
copy wrangler.toml.example wrangler.toml
```

4. 修改 `wrangler.toml` 中的 `SUPABASE_URL`、`ALLOWED_ORIGIN`、`DEEPSEEK_MODEL` 示例值。

5. 配置 secrets：

```bash
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

6. 本地运行：

```bash
wrangler dev
```

7. 部署：

```bash
wrangler deploy
```

8. 将部署后的 Worker 地址填入前端 `PLATFORM_AI_CONFIG.PLATFORM_WORKER_URL`，并把 `ENABLE_PLATFORM_AI` 改为 `true`。

## Supabase 表

部署前先执行：

- `docs/supabase_auth_quota.sql`
- `docs/supabase_ai_requests.sql`

`user_quota` 用于保存免费额度和付费额度。`ai_requests` 用于防止同一 `requestId` 重复扣费，并记录处理状态、模型、输入输出长度和错误码。

## 安全边界

- 前端不能直接调用 DeepSeek。
- 前端不能保存或展示 DeepSeek API Key。
- Worker 不把简历原文、完整 JD、API Key 写入 `usage_events`。
- 额度不足、登录失败、输入过长、重复请求、限流和 DeepSeek 失败都不扣次数。
- DeepSeek 成功返回且 JSON 解析成功后才扣减额度。

## 当前限制

- IP 限流目前作为预留说明。当前 Worker 使用 `ai_requests` 做用户级限流：同一用户 24 小时最多 10 次成功生成，同一用户 1 分钟最多 2 次请求。持久化 IP 限流建议后续使用 Durable Objects、WAF 或在 `ai_requests` 增加 `ip_hash` 字段。
- 支付和增加 `platform_paid_credits` 不在阶段 8 实现。

## JSON 解析失败策略

Worker 会先尝试解析模型返回的 JSON；如果模型包裹了 Markdown code fence 或在 JSON 前后混入少量文本，Worker 会尝试提取第一个 `{` 到最后一个 `}` 之间的 JSON。

如果仍然解析失败，Worker 返回 `DEEPSEEK_PARSE_FAILED`，把 `ai_requests.status` 更新为 `failed`，把 `ai_requests.error_code` 记录为 `PARSE_FAILED`，并且不扣减用户额度。不要把模型完整原始返回写入 `usage_events` 或 `ai_requests`。
## DeepSeek 输出参数

Worker 使用 `DEEPSEEK_MODEL`，默认 `deepseek-v4-pro`。请求中使用 DeepSeek 官方 Chat Completions 的 `response_format: { type: "json_object" }` 约束 JSON 输出，并启用 `thinking: { type: "enabled", reasoning_effort: "high" }`。如果后续 DeepSeek 模型参数发生变化，应先查官方文档再修改，不要凭记忆添加未知字段。