# 简岗配 AI 免费产品方案 v1

## 目标

将产品从收费额度方案调整为免费、登录后分层使用的求职分析体验。该方案只定义产品规则；不会在本阶段连接真实 Supabase、执行 migration、部署 Worker 或调用真实 DeepSeek。

## 用户权限

| 用户状态 | 可用能力 | 不可用能力 |
| --- | --- | --- |
| 未登录 | 本地 Mock 演示、简历本地导入、JD 本地输入、本地历史记录 | 平台 AI、自带 API Key |
| 已登录 | Mock、平台 AI（测试中）、自带 API Key（待接入） | 未实现的真实 OTP、每日/月度真实计数、真实自带 Key 调用 |

未登录时，平台 AI 和自带 API Key 模式必须锁定；点击引导登录，且不发送 Worker 请求。Mock 模式必须标明：结果由本地规则生成，不调用真实大模型。

## 平台 AI 目标规则

- 使用平台 DeepSeek API。
- 仅成功分析计次；失败不计次。
- 每日最多 5 次。
- 每月最多 30 次。
- 每日和每月上限同时生效。

当前 `ENABLE_PLATFORM_AI = false`。因此以上规则仅为已登录后的产品定义和页面展示，不代表真实调用、真实计数或真实限额已经开放。

## 自带 API Key 目标规则

- 登录后可选择。
- 不占用平台每日或每月次数。
- 模型费用由用户自己的账户承担。
- Key 默认仅保存在当前浏览器，可随时清除，不上传 Supabase。

当前页面仅实现 Key 的本地保存、脱敏显示和清除；真实模型调用尚未完成，不能把本地 Mock 表述为自带 Key 的真实结果。

## 登录路线

产品目标仍为邮箱 6 位验证码 OTP，登录与注册合并，不使用邮箱密码；但 OTP 不是当前上线必要条件。

当前发布策略由 `SUPABASE_AUTH_CONFIG.LOGIN_MODE` 唯一控制，默认 `magic_link`。该模式使用 `signInWithOtp({ email, options: { emailRedirectTo } })`，并根据当前 HTTP(S) 页面动态生成 redirect，不硬编码本地路径。Supabase URL Configuration 必须允许 GitHub Pages 正式地址、其 `/index.html` 地址，以及实际使用的本地预览地址。

8.6C-B 的 OTP 实现完整保留：`email_otp` 模式调用 `signInWithOtp({ email })` 和 `verifyOtp({ email, token, type: 'email' })`，包含数字输入、60 秒重发、session 恢复和退出锁定。默认 Magic Link 模式不展示也不允许普通用户触发 OTP。未来只有完成 SMTP 模板、真实收码与 session 验收后才可切换。

## 收费方案处置

收费、支付、订单、购买记录和自动增加额度方案均已取消。

为保护既有数据和安全 migration，数据库中的 `platform_paid_credits` 字段暂时保留，但标记为 deprecated：前端不得展示、读取或依赖该字段，且本阶段不得删除字段或执行破坏性 migration。

8.6B/8.6C 的原子预留、幂等、失败恢复、严格输出校验和限流安全能力继续保留，供后续免费计数实现复用。
