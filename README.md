# 简岗配 AI｜免费求职分析体验工具

简岗配 AI 面向应届生和初级岗位求职者。用户可在浏览器本地导入简历、输入岗位 JD，并生成岗位匹配分析与求职记录。

## 当前产品状态

- 当前阶段：8.6C-B，邮箱 OTP 登录前端实现。
- 当前前端开关：`PLATFORM_AI_CONFIG.ENABLE_PLATFORM_AI = false`。
- 当前真实可用分析：本地规则 / Mock 分析。
- 当前登录代码：Supabase 邮箱 OTP 的发送与验证流程已实现；真实邮件模板和真实收码登录尚待人工配置与验证。
- 当前自带 API Key：只支持本地保存、脱敏显示与清除；真实模型调用尚未接入。
- 当前平台 AI：仅登录后可选择和查看规则；仍在测试，不会调用 Worker、DeepSeek 或真实后端。

本地演示模式仅用于体验产品流程，结果由本地规则生成，不调用真实大模型。

## 正式免费方案

### 未登录用户

可以使用本地 Mock 演示、简历本地导入、JD 本地输入和本地历史记录。平台 AI 与自带 API Key 模式均锁定；点击会引导登录，且不会发送 Worker 请求。

### 已登录用户

- 平台 AI：目标规则为成功分析才计次，每日最多 5 次、每月最多 30 次，同时受两个上限约束。真实每日/月度计数与真实模型调用尚未完成。
- 自带 API Key：目标规则为登录后可用，不占平台次数，费用由用户自己的模型账户承担。Key 默认仅保存在当前浏览器，不上传 Supabase；真实调用尚未完成。

收费、支付和订单方案已取消。历史数据库中的 `platform_paid_credits` 字段暂时保留以避免破坏既有数据和 migration，但已废弃：前端不展示、不读取、不依赖该字段。

## 邮箱 OTP 登录

- 输入邮箱后，前端调用 `supabase.auth.signInWithOtp({ email })`；新邮箱允许由 Supabase 自动创建账号。
- 收到邮件验证码后，前端调用 `supabase.auth.verifyOtp({ email, token, type: 'email' })` 建立 session。
- 页面提供数字验证码输入、粘贴支持、60 秒重发倒计时、更换邮箱、错误中文提示、session 恢复和退出登录。
- 前端没有邮箱密码字段，也不传 `emailRedirectTo`，不再要求用户点击邮件链接返回页面。
- 产品目标为 6 位验证码；由于本阶段未读取 Supabase 后台配置，前端不强制固定长度，兼容邮件实际发出的数字验证码长度。

在真实收码测试前，必须先完成 [Supabase 邮箱 OTP 人工配置](docs/supabase-email-otp-setup.md)。该文档只是操作说明，不代表后台已经配置完成。

## 本地数据与隐私

- `resumeProfile`、`jobDraft`、`jobRecords` 和 `userApiKey` 均保存在当前浏览器 `localStorage`。
- TXT、PDF、DOCX 只在浏览器本地解析，不上传原始文件。
- 用户自带 API Key 不写入 URL、Supabase、Worker 日志或代码仓库。
- 平台 AI 未开放前，前端不会把简历或 JD 发送到 Worker。

## 平台 AI 安全基线

8.6B/8.6C 已保留以下后端安全能力，后续开放平台 AI 时继续使用：

- Worker 后端验证 Supabase access token，不信任前端 userId。
- 原子预留、成功确认、失败恢复、请求幂等和 stale 请求恢复。
- 严格结果 Schema、Prompt Injection 数据边界、输入长度限制和脱敏错误诊断。
- Worker 仅在模型成功且结果通过验证后确认一次成功；失败不会计入成功分析次数。

当前项目不会自动执行 Supabase migration、部署 Worker 或写入真实密钥。

## 文件说明

- `index.html`：静态前端、模式权限门禁、邮箱 OTP 登录入口和本地 Mock 分析。
- `worker/index.js`：平台 AI Worker 安全实现；当前前端开关关闭。
- `docs/product-plan-free-v1.md`：免费产品正式方案与未完成项。
- `docs/release-0.8.6c-a.md`：8.6C-A 页面和规则重置记录。
- `docs/release-0.8.6c-b.md`：8.6C-B OTP 前端实现与验证边界。
- `docs/supabase-email-otp-setup.md`：仅供管理员执行的 Supabase 邮件模板配置说明。
- `docs/migrations/`：既有 Supabase schema 与 8.6B/8.6C 安全 migration；不得由前端执行。

## 本地检查

本项目是原生静态 HTML/CSS/JavaScript，没有根目录 `package.json`。可直接用浏览器或任意静态文件服务器打开 `index.html`。

Worker 契约测试：

```powershell
node --test worker/tests/stage-8.6b-worker.test.mjs
```

OTP Mock 契约测试：

```powershell
node --test tests/otp-auth.contract.test.mjs
```

不要在本地检查中连接真实 Supabase、调用真实 DeepSeek、执行 migration 或部署 Worker。
