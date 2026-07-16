# 简岗配 AI v0.8.6C-B 发布记录

## 范围

- 阶段：邮箱 OTP 登录前端实现。
- 基线：`bf345fa6f9d2aa677ecdec99c1437767219bce22`。
- 未修改 `PRODUCT.md`，未连接真实 Supabase，未执行 SQL、未部署 Worker，未调用真实 DeepSeek。

## 已实现

- 邮箱输入后调用 `supabase.auth.signInWithOtp({ email })`；不传 `emailRedirectTo`，允许 Supabase 按默认行为为新邮箱创建账号。
- 数字验证码输入支持粘贴、`inputmode="numeric"` 和 `autocomplete="one-time-code"`。
- 验证调用 `supabase.auth.verifyOtp({ email, token, type: 'email' })`；成功后立即同步 session、刷新登录权限，并保留既有刷新恢复与退出逻辑。
- 提供发送中、验证中、60 秒重发倒计时、更换邮箱、发送失败、过频、网络、错误验证码和过期验证码的中文提示。
- 退出后会重新渲染模式门禁；未登录仍只可使用 Mock，不发送 Worker 请求。

## 验证边界

- 已测试：Mock Supabase 契约，覆盖 OTP 发送参数、无重定向参数、倒计时、更换邮箱、验证参数、错误映射、session 恢复、退出门禁和平台 AI 开关。
- 待人工配置：Supabase Dashboard 的 **Magic Link** 邮件模板改为显示 `{{ .Token }}`，具体步骤见 `docs/supabase-email-otp-setup.md`。
- 待真实验证：邮件实际送达、真实验证码、真实登录、真实 session 恢复及错误频率限制。
- 尚未实现：每日/月度真实额度、自带 API Key 真实调用、真实平台 AI 开放。

## 验收结论

产品目标为 6 位邮箱 OTP；但本阶段未读取 Supabase 后台设置，不能确认真实项目配置的验证码长度。前端仅限制数字输入，不固定长度。`ENABLE_PLATFORM_AI = false` 保持不变。

## 后续发布策略

8.6C-B 的 OTP 实现保留在分支中，但当前发布默认由 `SUPABASE_AUTH_CONFIG.LOGIN_MODE = 'magic_link'` 使用既有 Magic Link。该模式动态生成当前 HTTP(S) 页面作为 `emailRedirectTo`，以兼容本地预览和 GitHub Pages；管理员需在 Supabase URL Configuration 允许正式 Pages 地址、`/index.html` 地址及实际本地预览地址。SMTP、`{{ .Token }}` 模板和真实 OTP 验收完成前，不得把模式改为 `email_otp`。
