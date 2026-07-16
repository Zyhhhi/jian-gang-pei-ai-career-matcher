# 简岗配 AI 免费产品方案 v1

## 目标

将产品从收费额度方案调整为免费、登录后分层使用的求职分析体验。该方案只定义产品规则；不会在本阶段连接真实 Supabase、执行 migration、部署 Worker 或调用真实 DeepSeek。

## 用户权限

| 用户状态 | 可用能力 | 不可用能力 |
| --- | --- | --- |
| 未登录 | 本地 Mock 演示、简历本地导入、JD 本地输入、本地历史记录 | 平台 AI、自带 API Key |
| 已登录 | Mock、平台 AI（测试中）、自带 DeepSeek API Key 直连 | 未实现的真实 OTP、每日/月度真实计数、真实平台 AI 调用 |

未登录时，平台 AI 和自带 API Key 模式必须锁定；点击引导登录，且不发送 Worker 请求。Mock 模式必须标明：结果由本地规则生成，不调用真实大模型。

## 平台 AI 目标规则

- 使用平台 DeepSeek API。
- 仅成功分析计次；失败不计次。
- 每日最多 5 次。
- 每月最多 30 次。
- 每日和每月上限同时生效。

当前 `ENABLE_PLATFORM_AI = false`。V2 周期额度的 migration、service-role RPC 和 Worker 契约已在本地完成：数据库以自身 `now()` 的 Asia/Shanghai 自然日/月计算 5/30，并在同一用户事务锁内计算滚动 60 秒最多 2 次、预留、幂等和陈旧恢复。真实 Supabase 尚未执行 migration、真实 Worker 尚未部署，因此以上仍不代表线上真实调用、真实计数或真实限额已经开放。

V2 的失败、超时和非法输出会释放请求创建时记录的日/月预留，已接受的失败请求仍进入滚动 60 秒防刷窗口。`reserved` / `processing` 的陈旧预留会在同一用户下一次 reserve 时自动恢复；TTL 为 5 分钟，长于 Worker 允许的最长 120 秒模型超时。旧 `user_quota`、`platform_paid_credits` 和旧 RPC 保留兼容，但 V2 Worker 不读取、扣减或返回它们。

## 自带 API Key 目标规则

- 登录后可选择，当前第一版只支持 DeepSeek。
- 不占用平台每日或每月次数。
- 模型费用由用户自己的账户承担。
- Key 默认仅保存在当前浏览器，可随时清除，不上传 Supabase。
- 请求固定直连 `https://api.deepseek.com/chat/completions`，不经过 Worker、Supabase 或任何代理；不允许填写任意 Base URL。
- 开始分析前明确提示：简历与已确认 JD 会直接发送给 DeepSeek；失败不回退 Mock，只有本地 JSON 结构校验通过后才保存结果。

当前页面已实现登录后的自带 DeepSeek Key 真实直连、超时和服务错误提示、响应 JSON 结构校验及无 Mock 失败路径。Key 不进入 Prompt、URL、历史记录、埋点、错误信息、Supabase 或 Worker。已完成本地浏览器 CORS 探针验证；GitHub Pages 生产域名仍待发布前二次验收，失败则停止功能发布且不引入代理。

## 登录路线

产品目标仍为邮箱 6 位验证码 OTP，登录与注册合并，不使用邮箱密码；但 OTP 不是当前上线必要条件。

当前发布策略由 `SUPABASE_AUTH_CONFIG.LOGIN_MODE` 唯一控制，默认 `magic_link`。该模式使用 `signInWithOtp({ email, options: { emailRedirectTo } })`，并根据当前 HTTP(S) 页面动态生成 redirect，不硬编码本地路径。Supabase URL Configuration 必须允许 GitHub Pages 正式地址、其 `/index.html` 地址，以及实际使用的本地预览地址。

8.6C-B 的 OTP 实现完整保留：`email_otp` 模式调用 `signInWithOtp({ email })` 和 `verifyOtp({ email, token, type: 'email' })`，包含数字输入、60 秒重发、session 恢复和退出锁定。默认 Magic Link 模式不展示也不允许普通用户触发 OTP。未来只有完成 SMTP 模板、真实收码与 session 验收后才可切换。

## 收费方案处置

收费、支付、订单、购买记录和自动增加额度方案均已取消。

为保护既有数据和安全 migration，数据库中的 `platform_paid_credits` 字段暂时保留，但标记为 deprecated：前端不得展示、读取或依赖该字段，且本阶段不得删除字段或执行破坏性 migration。

8.6B/8.6C 的原子预留、幂等、失败恢复、严格输出校验和限流安全能力继续保留，供后续免费计数实现复用。
