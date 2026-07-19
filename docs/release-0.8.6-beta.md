# 简岗配 AI v0.8.6-beta 发布记录

## 记录范围

- 阶段：8.6B 平台 AI 安全闭环与可信输出。
- 实现 commit：`55f564c3a8fbaa3d217cf597380761b97a99e3eb`。
- 验证记录 commit：`4d9b62d047e23984b7cf0b1f43e57c965bbcd529`。
- 8.6C-A 已更新正式产品规则；以 `docs/product-plan-free-v1.md` 和 `docs/release-0.8.6c-a.md` 为准。

## 保留的安全能力

- `ai_requests` 请求状态机与 requestId 幂等。
- service-role-only 原子预留、成功确认、失败恢复与 stale 请求恢复 RPC。
- Worker access token 校验、输入长度限制、限流、严格结果 Schema 与 Prompt Injection 防护。
- 模型失败、超时、空响应、非 JSON 或 Schema 不合法时，后端执行失败恢复，前端不展示不可信结果。
- DeepSeek JSON Output、thinking 参数、约 60 秒超时和不自动重试策略。

## 当前状态

- `ENABLE_PLATFORM_AI = false`；公开页面不得调用 Worker 或模型。
- 真实 Supabase migration、真实 JWT 权限、真实 DeepSeek 与生产 Worker 端到端验收均未在本记录中确认完成。
- 8.6B 契约测试使用 Mock Supabase RPC 与 Mock Provider，不等同真实后台验收。
- 8.6C-A 后，产品采用免费登录后使用模型：平台 AI 的目标限制为每日 5 次、每月 30 次，真实计数尚待实现。
- 历史 `platform_paid_credits` 字段保留但已废弃；前端不展示、不读取、不依赖。
- 邮箱 6 位 OTP 是目标登录方案；当前代码仍使用 Magic Link。

## 后续衔接

在进入真实平台 AI 验收前，需由管理员手动核对 migration、使用测试账号验证服务端权限、部署独立 Worker 版本并检查日志脱敏。不得在前端开关关闭时伪装真实平台 AI 结果。
