# 简岗配 AI Worker

阶段 8 的 Cloudflare Worker 只服务平台 AI 模式：

前端携带 Supabase access token、`requestId`、`analysisMode`、`resumeProfile` 和 `jobDraft` 调用 Worker。Worker 通过原子 RPC 先预留额度，再调用 DeepSeek；成功输出通过 Schema 1.0 校验后确认消费，失败、超时或无效输出通过 RPC 退款。

## 环境变量

不要在代码、README、GitHub 或前端写真实密钥。

必需配置：

- `DEEPSEEK_API_KEY`：DeepSeek API Key，必须用 Worker secret 保存
- `SUPABASE_URL`：Supabase 项目 URL
- `SUPABASE_SERVICE_ROLE_KEY`：Supabase service role key，必须用 Worker secret 保存
- `ALLOWED_ORIGIN`：允许访问 Worker 的前端域名，例如 GitHub Pages 域名
- `DEEPSEEK_MODEL`：默认 `deepseek-v4-pro`
- `MODEL_TIMEOUT_MS`：可选，默认 `60000`，允许范围 10 到 120000 毫秒

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

7. 在 Supabase SQL Editor 中按顺序执行基础 SQL 和 Stage 8.6B migration，并先用测试账号核对 RPC 权限。migration 文件不得粘贴到前端：

```text
docs/supabase_auth_quota.sql
docs/supabase_ai_requests.sql
docs/migrations/20260714_stage_8_6b_atomic_ai_quota.sql
```

8. 部署 Worker：

```bash
wrangler deploy
```

9. 将部署后的 Worker 地址填入前端 `PLATFORM_AI_CONFIG.PLATFORM_WORKER_BASE_URL`。Stage 8.6B 期间继续保持 `ENABLE_PLATFORM_AI = false`；只有 8.6C 真实端到端验收通过后才评估开放。

## Supabase 表

部署前先执行：

- `docs/supabase_auth_quota.sql`
- `docs/supabase_ai_requests.sql`
- `docs/migrations/20260714_stage_8_6b_atomic_ai_quota.sql`

`user_quota` 用于保存免费额度和付费额度。`ai_requests` 用于 requestId 幂等、状态审计和限流。Stage 8.6B migration 增加 `reserved / processing / success / failed / refunded` 状态、审计字段和以下 service-role-only RPC：

- `reserve_ai_quota`
- `mark_ai_request_processing`
- `finalize_ai_request_success`
- `refund_ai_quota`
- `recover_stale_ai_request`

浏览器角色没有这些 RPC 的执行权限。Worker 不再用普通 REST PATCH 直接扣减额度。

## 安全边界

- 前端不能直接调用 DeepSeek。
- 前端不能保存或展示 DeepSeek API Key。
- Worker 不把简历原文、完整 JD、API Key 写入 `usage_events`。
- 额度不足、登录失败、输入过长、重复请求和限流不会调用模型。
- Provider 失败、超时、空内容、非 JSON 和 Schema 失败会恢复已预留额度。
- 成功结果必须通过 Schema 1.0 的必填字段、类型、枚举、分数、requestId 和证据校验。
- 简历与 JD 被包裹在明确的数据边界内，内容中的指令不会被视为系统指令。

## 当前限制

- IP 限流目前作为预留说明。当前 Worker 使用 `ai_requests` 做用户级限流：同一用户 24 小时最多 10 次成功生成，同一用户 1 分钟最多 2 次请求。持久化 IP 限流建议后续使用 Durable Objects、WAF 或在 `ai_requests` 增加 `ip_hash` 字段。
- 支付和增加 `platform_paid_credits` 不在阶段 8 实现。
- 当前自动化仅使用 Mock Supabase RPC 和 Mock Provider。migration 未由本仓库自动部署，真实 JWT、真实 DeepSeek 与生产 Worker 尚待 8.6C 验收。

## JSON 解析失败策略

Worker 会先尝试解析模型返回的 JSON；如果模型包裹了 Markdown code fence 或在 JSON 前后混入少量文本，Worker 会尝试提取第一个 `{` 到最后一个 `}` 之间的 JSON。

如果解析或 Schema 校验失败，Worker 返回 `INVALID_MODEL_OUTPUT`，并通过 `refund_ai_quota` 将请求从失败状态转换为 `refunded`。模型完整原始返回不会写入 `usage_events` 或 `ai_requests`。
## DeepSeek 输出参数

Worker 使用 `DEEPSEEK_MODEL`，默认 `deepseek-v4-pro`。请求使用 `response_format: { type: "json_object" }`、`thinking: { type: "enabled" }` 和顶层 `reasoning_effort: "high"`。thinking mode 下未发送官方说明会被忽略的 `temperature`。请求由 `AbortController` 在约 60 秒后中止，本阶段不自动重试，避免重复模型费用。
