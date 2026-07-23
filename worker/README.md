# 简岗配 · RoleFit AI Worker

阶段 8 的 Cloudflare Worker 只为后续平台 AI 模式保留安全调用链：

若后续受控启用，前端会携带 Supabase access token、`requestId`、`analysisMode`、`resumeProfile` 和 `jobDraft` 调用 Worker。Worker 通过原子 V2 RPC 先预留可用次数，再调用 DeepSeek；模型业务内容通过 Schema 1.2 有界契约校验后，由 Worker 注入 `schemaVersion`、`requestId`、`model` 和 UTC `generatedAt` 并确认成功，失败、超时或无效输出通过 RPC 恢复预留。当前公开页面的 `ENABLE_PLATFORM_AI = false`，且 Worker 服务端熔断开关默认关闭，不会调用该 Worker。

## 当前生产状态

- 正式 Worker 名称：`jian-gang-pei-platform-ai`
- 正式接口：`https://jian-gang-pei-platform-ai.sozowali642.workers.dev/api/platform-analyze`
- 实际部署入口：`worker/index.js`；根目录 `cloudflare-worker.js` 仅为历史禁用入口
- 前端 `ENABLE_PLATFORM_AI=false`，Worker `PLATFORM_AI_ENABLED=false`，平台 AI 尚未公开开放
- 已配置 Secret 名称：`DEEPSEEK_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY`；不得记录或输出值
- V2 migration 已在真实 Supabase 执行一次并完成函数、RLS 与最小权限验收，不得重复执行
- 已完成一次受控真实后端调用；Worker、DeepSeek 与 V2 日/月计数链路成功，随后服务端开关已恢复为 `false`
- v0.8.6c-k 的 Worker-only 输出稳定性修复已部署；服务端开关继续保持 `false`。此前受控请求曾分别出现 `MODEL_TIMEOUT` 与上游 HTTP 200 后的 `OUTPUT_TRUNCATED`；两次均通过 V2 RPC 退款，未增加成功次数。
- v0.8.6c-l 增加了尚未部署的 Scheduled stale recovery 源码：Cron 只读取 requestId、userId、status 与 updatedAt，并逐条调用既有 V2 recovery RPC。它只保证断线后最终释放额度，不保留或返回断线请求的分析结果。

本地 `worker/wrangler.toml` 被 `.gitignore` 忽略。任何再次部署前都必须先确认该文件不会覆盖 Dashboard 中已验证的 CORS Origin 配置。

## 环境变量

不要在代码、README、GitHub 或前端写真实密钥。

必需配置：

- `DEEPSEEK_API_KEY`：DeepSeek API Key，必须用 Worker secret 保存
- `SUPABASE_URL`：Supabase 项目 URL
- `SUPABASE_SERVICE_ROLE_KEY`：推荐填写 Supabase 新版 `sb_secret_...` Secret key；也兼容旧版 service role key，必须用 Worker secret 保存
- `ALLOWED_ORIGIN`：允许访问 Worker 的前端域名，例如 GitHub Pages 域名
- `PLATFORM_AI_ENABLED`：普通 Worker 配置，严格为字符串 `true` 时才允许分析 POST；缺失、`false` 或任何其他值都会返回 `503 PLATFORM_AI_DISABLED`，并且不访问 Supabase 或 DeepSeek。部署和受控验收前必须保持 `false`。
- `DEEPSEEK_MODEL`：默认 `deepseek-v4-pro`
- `MODEL_TIMEOUT_MS`：可选，代码默认 `60000`，允许范围 10 到 120000 毫秒。生产 Dashboard 当前已人工设为 `120000`；代码不得写死或覆盖该 Dashboard 配置。

`SUPABASE_SERVICE_ROLE_KEY` 只能放在 Worker 环境变量中，不能放到前端。

`DEEPSEEK_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 是 secrets；`SUPABASE_URL`、`ALLOWED_ORIGIN`、`PLATFORM_AI_ENABLED`、`DEEPSEEK_MODEL` 和 `MODEL_TIMEOUT_MS` 是普通配置。`ALLOWED_ORIGIN` 可用英文逗号列出精确 Origin，例如 `https://zyhhhi.github.io,http://127.0.0.1:4178`；不得包含路径、通配符或未核验的域名。

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

4. 修改 `wrangler.toml` 中的 `SUPABASE_URL`、`ALLOWED_ORIGIN`、`DEEPSEEK_MODEL` 示例值，并确认 `PLATFORM_AI_ENABLED = "false"`。

5. 配置 secrets：

```bash
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

6. 本地运行：

```bash
wrangler dev
```

7. 当前项目的 V2 migration 和数据库最小权限已在真实 Supabase 人工验收。部署前只复查五个 V2 RPC 仍为 `SECURITY DEFINER`、仅 `service_role` 有 EXECUTE，且 `platform_ai_quota_periods` 没有直接表级权限；不要重复执行 V2 migration。

8. 部署 Worker：

```bash
wrangler deploy
```

9. 前端 `PLATFORM_AI_CONFIG.PLATFORM_WORKER_BASE_URL` 已接线正式 Worker。再次部署或变更配置后，继续保持 `ENABLE_PLATFORM_AI = false` 和 `PLATFORM_AI_ENABLED = "false"`，先完成关闭状态与 CORS 健康检查。是否公开开放平台 AI 必须另行明确决定。

## Supabase 表

`user_quota` 是历史可用次数兼容表；其中旧的 `platform_paid_credits` 字段已废弃，前端不展示、不读取、不依赖。正式规则由已人工验收的 V2 migration 实现：每日 5 次、每月 30 次、滚动 60 秒最多 2 次。`ai_requests` 用于 requestId 幂等、状态审计和限流；`platform_ai_quota_periods` 保存按 Asia/Shanghai 自然日/月的 V2 计数。V2 仅允许 service role 调用以下 RPC：

- `reserve_platform_ai_quota_v2`
- `mark_platform_ai_request_processing_v2`
- `finalize_platform_ai_request_success_v2`
- `refund_platform_ai_quota_v2`
- `recover_stale_platform_ai_request_v2`

浏览器角色和 `PUBLIC` 没有这些 RPC 的执行权限。Worker 不用普通 REST PATCH 直接扣减额度，直接表级权限只保留为实现所必需的最小范围。

## 安全边界

- 前端不能直接调用 DeepSeek。
- 前端不能保存或展示 DeepSeek API Key。
- Worker 不把简历原文、完整 JD、API Key 写入 `usage_events`。
- 可用次数不足、登录失败、输入过长、重复请求和限流不会调用模型。
- Provider 失败、超时、空内容、非 JSON 和 Schema 失败会恢复已预留次数。
- 成功结果必须通过 Schema 1.2 的必填字段、类型、枚举、分数、非空与输出边界校验；模型不再回显 `schemaVersion`、`requestId`、`model` 或 `generatedAt`，未知字段会按允许列表丢弃且不进入 UI 或历史。
- 所有受限数组统一在全量项目校验后归一化；纯字符串数组先去空、trim、稳定去重，再保留前 `max` 项。数组安全截取只产生不含内容和数量的 `ARRAY_ITEMS_TRUNCATED` warning，归一化后低于 `min` 或任一项目非法仍失败。
- 简历与 JD 被包裹在明确的数据边界内，内容中的指令不会被视为系统指令。
- `PLATFORM_AI_ENABLED` 缺失或未严格设为 `true` 时，POST 在认证、额度 RPC 与模型调用之前返回 `503 PLATFORM_AI_DISABLED`；OPTIONS 仍可用于 CORS 健康检查。

## 当前限制

- IP 限流目前作为预留说明。当前 V2 RPC 使用 `ai_requests` 做用户级限流：同一用户按 Asia/Shanghai 自然日最多 5 次成功生成、自然月最多 30 次、滚动 60 秒最多 2 次请求。持久化 IP 限流建议后续使用 Durable Objects、WAF 或在 `ai_requests` 增加 `ip_hash` 字段。
- 商业化入口已取消；`platform_paid_credits` 仅为数据库兼容字段，不得新增前端依赖。
- 自动化测试仍只使用 Mock Supabase RPC 和 Mock Provider，不连接真实服务。V2 数据库对象与权限已人工验收，生产 Worker 也已完成一次受控真实后端调用；公开发布路径与开关启用仍待单独授权和最终线上验收。
- 当前没有 Queue、`202 Accepted` 或请求状态轮询接口。该架构会涉及异步任务、结果保存与简历/JD 暂存策略，必须作为独立的隐私与架构升级评审，不能作为 Cron 恢复的隐式副作用。

## JSON 解析失败策略

Worker 会先尝试解析模型返回的 JSON；如果模型包裹了 Markdown code fence 或在 JSON 前后混入少量文本，Worker 会尝试提取第一个 `{` 到最后一个 `}` 之间的 JSON。

如果解析或 Schema 校验失败，Worker 返回 `INVALID_MODEL_OUTPUT`，并通过 `refund_platform_ai_quota_v2` 将请求从失败状态转换为 `refunded`。模型完整原始返回不会写入 `usage_events` 或 `ai_requests`。
## DeepSeek 输出参数

Worker 使用 `DEEPSEEK_MODEL`，默认 `deepseek-v4-pro`。v0.8.6c-k 请求使用 `response_format: { type: "json_object" }`、`thinking: { type: "disabled" }` 与 `max_tokens: 8192`，不发送 `reasoning_effort` 或 `temperature`。请求由 `AbortController` 按 Dashboard 的 `MODEL_TIMEOUT_MS` 中止，本阶段不自动重试，避免重复模型费用。v0.8.6c-l 的 Cron 恢复代码尚未部署，受控验收前服务端开关必须继续为 `false`。

## v0.8.6c-l stale recovery

Worker 的 `scheduled()` 不受 `PLATFORM_AI_ENABLED` 影响：它不鉴权、不调用 DeepSeek、不开 HTTP 管理接口。每轮最多扫描 50 条超过 5 分钟的 V2 `reserved`/`processing` 元数据记录，并逐条调用 `recover_stale_platform_ai_request_v2`；重复或并发运行依赖 RPC 的幂等和行锁。日志只写 `scanned`、`recovered`、`skipped`、`failed` 和 `duration_ms` 汇总数字。`STALE_RECOVERY_TTL_MS` 必须严格大于 `MODEL_TIMEOUT_MS + 60000ms`，否则 Cron 拒绝恢复。示例 Cron 在 `wrangler.toml.example` 中；真实 Dashboard Trigger 尚未配置。

## v0.8.6c-k 可观测性边界

若上游实际返回 usage，Worker 只会在失败响应中携带 allowlist 数值诊断：`finishReason`、`totalTokens`、`completionTokens`、`reasoningTokens` 与 `durationMs`。usage 缺失不影响主流程；这些诊断不会写入历史、数据库或日志，且绝不包含 Prompt、模型正文、简历、JD、Key、Token 或任意字段值。
