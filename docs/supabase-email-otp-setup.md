# Supabase 邮箱 OTP 人工配置说明

本说明只列出管理员需要在 Supabase Dashboard 手动完成的配置。不要把 Supabase Key、access token、refresh token、服务端密钥或任何邮箱验证码发送给 Codex。

## 只需要修改的邮件模板

本项目的前端使用 `supabase.auth.signInWithOtp({ email })`。Supabase 将该无密码登录邮件称为 **Magic Link** 模板：当模板使用 `{{ .ConfirmationURL }}` 时发送跳转链接；当模板使用 `{{ .Token }}` 时发送邮箱 OTP。

因此本次只修改 **Authentication → Email Templates → Magic Link** 模板。不要修改 Confirm signup、Invite user、Change email address 或 Reset password 模板；它们不是本次登录流程的模板。

## 操作步骤

1. 登录 Supabase Dashboard，选择本项目。
2. 打开 **Authentication**，进入 **Email Templates**。
3. 只打开名称为 **Magic Link** 的模板。判断依据：它对应前端的 `signInWithOtp({ email })` 无密码登录邮件。
4. 将正文中的 `{{ .ConfirmationURL }}`、`{{ .TokenHash }}` 或跳转链接删除，改为直接显示 `{{ .Token }}`。例如：

   ```html
   <h2>简岗配 AI 登录验证码</h2>
   <p>请输入以下验证码完成登录或注册：</p>
   <p style="font-size: 28px; letter-spacing: 6px;"><strong>{{ .Token }}</strong></p>
   <p>请勿将验证码提供给他人。</p>
   ```

5. 保存模板。模板中必须保留 `{{ .Token }}`，且不再依赖 `{{ .ConfirmationURL }}`；否则邮件仍可能是跳转链接而不是可输入的验证码。
6. 在 **Authentication → Sign In / Providers → Email** 检查 Email Provider 已启用，并确认所用 SMTP 或默认邮件服务可发送邮件。
7. 在同一 Email Provider 配置页检查 Email OTP expiration 与发送频率。前端按 60 秒显示重发倒计时；以后台实际限制为准。记录当前过期时间，供后续真实验证使用。

## 配置后再做的人工验证

完成上述步骤后，使用测试邮箱在页面发送验证码。确认邮件正文显示数字验证码而非跳转链接，再输入该验证码登录。不要把收到的验证码或登录 token 粘贴到聊天中。

本阶段未执行这项真实验证；在确认邮件模板、送达、验证码校验和 session 恢复之前，不得宣称真实 OTP 已通过。

## 回滚到 Magic Link

若需要恢复旧流程，仍只改回 **Magic Link** 模板：将模板正文替换为包含 `{{ .ConfirmationURL }}` 的登录链接，并移除 OTP 展示。然后恢复前端使用跳转链接的版本。不要同时修改其他邮件模板。
