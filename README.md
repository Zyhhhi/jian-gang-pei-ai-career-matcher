# 简岗配 · RoleFit AI｜免费求职分析体验工具

简岗配 · RoleFit AI 面向应届生和初级岗位求职者。用户可在浏览器本地导入简历、输入岗位 JD，并生成岗位匹配分析与求职记录。

## 当前产品状态

- 当前阶段：登录策略、自带 Key、平台 AI V2 额度和正式 Worker 后端闭环均已完成对应验证；平台 AI 尚未公开开放。
- 当前前端开关：`PLATFORM_AI_CONFIG.ENABLE_PLATFORM_AI = false`。
- 当前真实可用分析：本地规则 / Mock 分析，以及登录后的自带 DeepSeek Key 浏览器直连分析。
- 当前发布登录：Supabase 邮箱 Magic Link。OTP 发送与验证代码已保留，但默认不对用户开放，等待 SMTP 配置和真实验收。
- 当前自带 API Key：已支持登录后使用自己的 DeepSeek Key 由浏览器直连真实分析；新的模型输出使用 Schema 1.2 有界业务内容契约，`schemaVersion`、`requestId`、`model` 和 UTC `generatedAt` 均由应用注入，平台 AI 仍未开放。
- 当前平台 AI：前端已接线正式 Worker，但前端 `ENABLE_PLATFORM_AI=false`、Worker `PLATFORM_AI_ENABLED=false`，公开页面不会调用平台 Worker、DeepSeek 或真实额度 RPC。

本地演示模式仅用于体验产品流程，结果由本地规则生成，不调用真实大模型。

## 正式免费方案

### 未登录用户

可以使用本地 Mock 演示、简历本地导入、JD 本地输入和本地历史记录。平台 AI 与自带 API Key 模式均锁定；点击会引导登录，且不会发送 Worker 请求。

### 已登录用户

- 平台 AI：V2 后端规则为成功分析才计次，按 Asia/Shanghai 自然日最多 5 次、自然月最多 30 次；每用户滚动 60 秒最多接受 2 次请求。V2 migration 已在真实 Supabase 执行一次并完成函数、RLS 与最小权限验收；正式 Worker 已部署并完成一次受控真实后端调用。验收后服务端开关已恢复 `false`，前端开关也保持 `false`，因此这不是已开放的线上能力。
- 自带 DeepSeek API Key：登录后可用，不占平台次数，费用由用户自己的 DeepSeek 账户承担。Key 默认仅保存在当前浏览器；开始分析前页面会明确提示已确认的简历和 JD 将直接发送给 DeepSeek，且不会经过 Worker、Supabase 或代理。

收费、支付和订单方案已取消。历史数据库中的 `platform_paid_credits` 字段暂时保留以避免破坏既有数据和 migration，但已废弃：前端不展示、不读取、不依赖该字段。

## 发布登录模式

- `SUPABASE_AUTH_CONFIG.LOGIN_MODE` 是唯一登录模式来源，当前固定为 `magic_link`。
- `magic_link`：前端调用 `signInWithOtp({ email, options: { emailRedirectTo } })`；`emailRedirectTo` 由当前 HTTP(S) 页面地址动态生成，保留页面路径、移除 query/hash，因此兼容本地静态服务器与 GitHub Pages。
- `email_otp`：保留现有 `signInWithOtp({ email })`、`verifyOtp({ email, token, type: 'email' })`、数字输入、60 秒重发和错误处理；当前默认隐藏，不能由普通用户触发。
- 两种模式均复用 session 恢复、退出和未登录仅 Mock 门禁；没有邮箱密码字段。

Supabase **Authentication → URL Configuration** 在 Magic Link 发布前需要包含：

- Site URL：`https://zyhhhi.github.io/jian-gang-pei-ai-career-matcher/`
- Redirect URLs：`https://zyhhhi.github.io/jian-gang-pei-ai-career-matcher/`、`https://zyhhhi.github.io/jian-gang-pei-ai-career-matcher/index.html`
- 本地预览实际使用的精确地址，例如 `http://127.0.0.1:4178/index.html` 与 `http://localhost:4178/index.html`

未来启用 OTP 前，必须先完成 [Supabase 邮箱 OTP 人工配置](docs/supabase-email-otp-setup.md) 并做真实收码验收。该文档只是操作说明，不代表后台已经配置完成。

## 本地数据与隐私

- 敏感本地数据使用单一的 V2 存储访问层和 schema version `2`。已登录数据的键为 `jian_gang_pei:v2:user:<Supabase user.id>:<resource>`；访客数据为 `jian_gang_pei:v2:guest:<resource>`。`user.id` 只从已验证的 Supabase session 获取。
- `resumeProfile`、`jobDraft`、`jobRecords`、分析历史、反馈、`aiMode` 和自带 Key 都按上述空间隔离。登录状态尚在恢复时默认不读取任何敏感空间，避免上一账号资料闪现；账号切换或退出时先清空页面内存，再解析新空间并加载。
- 自带 Key 可在同一已登录账号刷新后恢复；登出、session 失效或切换账号时会删除离开账号的 Key，另一个账号不能继承它。未迁移任何旧全局 Key。
- 旧版全局敏感数据只会一次性移至 `jian_gang_pei:v2:legacy:quarantine:<resource>`，不会自动归属给第一个登录账号；旧 Key 直接删除。旧数据的“主动导入”界面尚未实现。
- `anonymousUserId` 与净化后的 `analyticsQueue` 仍是设备级数据；其中不允许保存简历、JD、Key、分析全文、邮箱或 `user.id`。浏览器本地存储并非加密存储，共用设备仍应使用退出登录和“清空当前数据空间”。
- “清空本地数据”仅清空当前账号或访客空间，不会删除其他账号空间。
- TXT、PDF、DOCX 只在浏览器本地解析，不上传原始文件。
- 用户自带 API Key 不写入 URL、Supabase、Worker 日志或代码仓库。
- 自带 Key 固定请求 `https://api.deepseek.com/chat/completions`，固定模型 `deepseek-v4-flash`；不接受用户填写任意 Base URL。Key 只出现在浏览器到 DeepSeek 的 Authorization 请求头，不进入 Prompt、历史记录、埋点、错误信息或页面日志。
- Schema 1.2 只要求模型生成允许列表内的业务字段；未知字段递归丢弃，必要字段缺失、类型错误、空内容或超出有界输出限制时均失败且不保存历史。
- 本地浏览器 CORS 探针已由人工验证通过；GitHub Pages 正式域名发布前仍必须用用户本人临时 Key 完成一次 OPTIONS/POST 二次验收。若 CORS 失败，停止自带 Key 发布，不引入代理，也不回退 Mock。
- 平台 AI 未开放前，前端不会把简历或 JD 发送到 Worker。

## 平台 AI 安全基线

8.6B/8.6C 已保留以下后端安全能力，后续开放平台 AI 时继续使用：

- 正式 Worker：`jian-gang-pei-platform-ai`，接口为 `https://jian-gang-pei-platform-ai.sozowali642.workers.dev/api/platform-analyze`；实际入口为 `worker/index.js`。
- Worker 已配置 `DEEPSEEK_API_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 两个 Secret；仓库只记录名称，不保存或展示值。
- Worker 后端验证 Supabase access token，不信任前端 userId。
- 原子预留、成功确认、失败恢复、请求幂等和 stale 请求恢复。
- V2 周期额度只由 service-role Worker RPC 处理：一次 reserve 在同一用户事务锁内完成陈旧预留恢复、60 秒防刷与日/月预留；失败/超时释放请求创建时的日/月预留，但仍保留该请求在 60 秒防刷窗口中。
- 陈旧 `reserved` / `processing` 请求会在同一用户下一次 reserve 时自动恢复。TTL 为 5 分钟，长于 Worker 允许的最长 120 秒模型超时；完成或退款始终按请求记录的原始周期回写，跨日或跨月不改变归属。
- `platform_paid_credits`、旧 `user_quota` 与旧 RPC 仍为兼容数据保留；V2 Worker 不读取、不扣减、不返回这些字段。
- Schema 1.2 有界结果契约、允许列表投影、Prompt Injection 数据边界、输入长度限制和脱敏错误诊断。
- Worker 仅在模型成功且结果通过验证后确认一次成功；失败不会计入成功分析次数。

当前本地检查不会连接真实 Supabase、重复执行 migration、调用真实 DeepSeek、修改 Worker 配置或写入真实密钥。任何再次部署前都必须单独确认，并检查被忽略的 `worker/wrangler.toml` 不会覆盖生产 CORS 配置。

## 文件说明

- `index.html`：静态前端、模式权限门禁、双模式登录开关与本地 Mock 分析。
- `worker/index.js`：平台 AI Worker 安全实现；当前前端开关关闭。
- `docs/product-plan-free-v1.md`：免费产品正式方案与未完成项。
- `docs/release-0.8.6c-a.md`：8.6C-A 页面和规则重置记录。
- `docs/release-0.8.6c-b.md`：8.6C-B OTP 前端实现与验证边界。
- `docs/release-0.8.6c-f.md`：v0.8.6C-F 发布范围、正式 Worker 接线与关闭状态记录。
- `docs/release-0.8.6c-g.md`：v0.8.6C-G 完整 AI 输出契约 hotfix 记录。
- `docs/release-0.8.6c-h.md`：v0.8.6C-H 示例数据隐私 hotfix 记录。
- `docs/release-0.8.6c-i.md`：v0.8.6C-I AI 输出稳定性 hotfix 记录。
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

默认 Magic Link 模式契约测试：

```powershell
node --test tests/login-mode.contract.test.mjs
```

自带 DeepSeek Key 直连契约测试：

```powershell
node --test tests/own-api-direct.contract.test.mjs
```

本地数据隔离契约测试：

```powershell
node --test tests/local-data-isolation.contract.test.mjs
```

平台 AI 前端配置契约测试：

```powershell
node --test tests/platform-ai-config.contract.test.mjs
```

不要在本地检查中连接真实 Supabase、调用真实 DeepSeek、执行 migration 或部署 Worker。
