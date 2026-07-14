# 简岗配 AI v0.8.6-beta 发布说明

## 发布状态

- 阶段：8.6B 平台 AI 安全闭环与可信输出
- 日期：2026-07-14
- 分支：`feature/commercial-mvp`
- 实现 commit：`55f564c3a8fbaa3d217cf597380761b97a99e3eb`
- 公开平台开关：`ENABLE_PLATFORM_AI = false`
- 真实 Worker 部署：未执行
- 真实 Supabase migration：未执行
- 真实 DeepSeek 端到端：未执行

本版本是代码与契约就绪版本，不代表真实平台 AI 已公开上线。公开页面继续拦截平台 AI 请求，不调用模型，也不扣减额度。

## 数据库 Migration

新增 `docs/migrations/20260714_stage_8_6b_atomic_ai_quota.sql`。该 migration 保留现有表和数据，为 `ai_requests` 增加状态审计字段、非负约束、stale 索引和 service-role-only 原子 RPC。

执行顺序：

1. `docs/supabase_auth_quota.sql`
2. `docs/supabase_ai_requests.sql`
3. `docs/migrations/20260714_stage_8_6b_atomic_ai_quota.sql`

本仓库没有自动连接或修改真实 Supabase 数据。必须由项目管理员在 SQL Editor 中手动执行并检查结果。

## RPC 与状态机

- `reserve_ai_quota`：按 requestId advisory lock 和用户 quota 行锁原子预留；免费额度优先。
- `mark_ai_request_processing`：只允许 `reserved -> processing`。
- `finalize_ai_request_success`：只允许 `processing -> success`，保存 Schema、耗时和 Provider 状态。
- `refund_ai_quota`：原子恢复原额度类型并转换为 `refunded`；重复退款不重复增加额度。
- `recover_stale_ai_request`：恢复达到指定 stale 时间的未完成请求。

```text
不存在 -> reserved -> processing -> success
reserved / processing -> failed -> refunded
```

`success`、重复 finalize 和重复 refund 均幂等。同一 `requestId` 在处理中时不启动第二次 Provider 调用；跨用户 requestId 返回冲突。

## Worker API

接口：`POST /api/platform-analyze`

请求必须使用 Supabase access token 和 `application/json`，并包含 `requestId`、`analysisMode: platform_api`、`resumeProfile`、已确认的 `jobDraft`。Worker 以后端验证出的用户 ID 为准。

简历最多 12000 字，JD 最多 8000 字，总输入最多 20000 字。稳定错误码包括：

- `AUTH_REQUIRED` / `INVALID_TOKEN`
- `INVALID_REQUEST_ID`
- `RESUME_TOO_SHORT` / `RESUME_TOO_LONG`
- `JD_TOO_SHORT` / `JD_TOO_LONG`
- `INPUT_TOO_LONG`
- `NO_QUOTA`
- `REQUEST_IN_PROGRESS` / `REQUEST_ALREADY_COMPLETED`
- `MODEL_TIMEOUT` / `MODEL_PROVIDER_ERROR`
- `INVALID_MODEL_OUTPUT`
- `QUOTA_RESERVATION_FAILED` / `QUOTA_REFUND_FAILED`

错误响应不包含简历、JD、密钥、模型原始响应或内部堆栈。

## DeepSeek 参数

- Endpoint：`https://api.deepseek.com/chat/completions`
- 默认模型：`deepseek-v4-pro`
- JSON Output：`response_format: { type: "json_object" }`
- Thinking：`thinking: { type: "enabled" }`
- 推理强度：顶层 `reasoning_effort: "high"`
- 输出上限：`max_tokens: 8192`
- 超时：默认约 60 秒，由 `AbortController` 中止
- 自动重试：关闭，避免同一请求产生重复模型费用
- Thinking 模式下不发送官方说明会被忽略的 `temperature`

## 分析 Schema 1.0

必填模块：元信息、岗位摘要、综合建议、评分拆解、核心匹配、风险、关键词、简历建议、面试准备、可信度。

Worker 验证完整字段集合、类型、枚举、0 到 100 分数、requestId、模型名、日期、证据和占位文本。缺字段不再由前端补成默认 60 分。`unsupported` 简历建议不会作为可直接采用的改写展示。

## Prompt Injection 防护

- System Prompt 明确简历和 JD 是不可信数据，不是指令。
- 数据分别包裹在 `<RESUME_DATA>` 和 `<JOB_DESCRIPTION_DATA>` 中。
- 禁止执行数据中的管理员声明、忽略规则、固定分数或泄露配置指令。
- 禁止泄露系统提示词、密钥、环境变量和内部配置。
- 禁止虚构经历、技能、成绩、项目和业务指标。
- 没有证据只表示“未发现证据”；核心判断必须包含文字证据和置信度。

## 测试结果

Mock 契约命令：

```powershell
node --test worker/tests/stage-8.6b-worker.test.mjs
```

自动化结果：21/21 通过。已覆盖 DeepSeek 参数、认证与输入、免费/付费额度、并发、requestId 幂等、Provider 429/500/超时/空内容/非 JSON、Schema 错误、失败退款、重复退款、重复 finalize、stale 恢复、跨用户 requestId、伪造 userId、RPC 已提交但响应丢失和 Prompt Injection 数据边界。

Wrangler `deploy --dry-run` 通过，未执行真实部署。Playwright 访问 `http://127.0.0.1:4178/index.html`，控制台 error 为 0；验证 Mock 报告生成、平台开关关闭且无 Worker 请求、输入保留、可信度展示、无效输出拒绝和 `unsupported` 建议隐藏。

真实环境尚未完成：

- 未在真实 Supabase 执行 migration。
- 未使用真实 JWT 验证 RPC 权限。
- 未使用真实 DeepSeek Key 调用模型。
- 未部署新的 Cloudflare Worker version。
- 未验证真实网络超时、Provider 429 和 Worker 运行日志。

因此状态只能标记为“Mock 契约通过，真实环境待验收”。

## 真实环境手动清单

1. 在 Supabase SQL Editor 先查询 `user_quota` 是否存在负数或 `free_used > free_total`，查询 `ai_requests.status` 是否只有既有合法值；发现异常先人工修复，不要绕过约束。
2. 按本文件列出的顺序执行三份 SQL，并确认五个 RPC 存在。
3. 使用 `authenticated` 角色确认敏感 RPC 不可执行，使用服务端权限确认 RPC 可执行。
4. 在 Cloudflare Worker Secrets 中手动配置 `DEEPSEEK_API_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY`；不要截图、粘贴到聊天或写入仓库。
5. 配置 `SUPABASE_URL`、`ALLOWED_ORIGIN`、`DEEPSEEK_MODEL` 和可选 `MODEL_TIMEOUT_MS`。
6. 先部署独立 Worker version，不修改公开前端开关；使用专用测试账号和虚构简历/JD 调用。
7. 在 Supabase 核对一次成功、Provider 失败、Schema 失败、重复 requestId 和并发请求后的 quota 与 request 状态。
8. 验证 Worker 日志没有简历、JD、邮箱、token、密钥或模型原始响应。
9. 记录 Worker version 后再进入 8.6C；不要在本阶段打开公开平台 AI。

## 回滚

1. 保持公开 `ENABLE_PLATFORM_AI = false`。
2. 将 Worker 回滚到上一已知版本。
3. 按 migration 文件末尾顺序删除 Stage 8.6B RPC 和新增约束。
4. 新增 nullable 审计列建议保留，避免删除审计数据。
5. 有 `reserved / processing` 请求时先恢复 stale 请求并核对额度。

## 下一阶段

建议进入 8.6C：管理员手动执行 migration、使用专用测试账号验证真实 JWT 和额度、部署独立 Worker version、验证真实 Provider、日志脱敏、账号隔离和线上错误状态。全部通过后再评估公开平台开关；在此之前不进入支付阶段。
