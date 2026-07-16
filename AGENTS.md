# 简岗配 AI｜项目规则

## 当前产品定义：8.6C-B 免费方案与邮箱 OTP

简岗配 AI 是面向应届生和初级岗位求职者的本地优先求职分析工具。

- 未登录用户只可使用本地 Mock 演示、简历本地导入、JD 本地输入和本地历史记录。
- 未登录时，平台 AI 与自带 API Key 模式必须锁定；点击必须引导登录，绝不发送 Worker 请求。
- 本地 Mock 必须明确说明：本模式仅用于体验产品流程，结果由本地规则生成，不调用真实大模型。
- 已登录用户后续可选择平台 AI 或自带 API Key。
- 平台 AI 正式目标：成功分析才计次，每日最多 5 次、每月最多 30 次，同时受两个上限约束。
- 自带 API Key 正式目标：登录后可用，不占平台次数，费用由用户自己的模型账户承担。
- 付费、支付、订单、购买、购买记录和自动增加额度方案已取消。
- `platform_paid_credits` 暂时保留在既有数据库 schema 中，但已废弃；前端不得展示、读取或依赖它，不得进行破坏性 migration。

## 当前真实实现边界

- `PLATFORM_AI_CONFIG.ENABLE_PLATFORM_AI` 必须保持 `false`，不得公开打开。
- `SUPABASE_AUTH_CONFIG.LOGIN_MODE` 是登录模式唯一事实来源，当前必须为 `magic_link`。正式发布使用 `signInWithOtp({ email, options: { emailRedirectTo } })`；redirect 由当前 HTTP(S) 页面路径生成，不得硬编码本地地址。
- `email_otp` 的发送、验证、倒计时与 Mock 测试必须继续保留，但默认隐藏且不得由普通用户触发。只有完成 SMTP 模板与真实验收后，才可将 `LOGIN_MODE` 改为 `email_otp`。
- 真实 Supabase 邮件模板、邮件服务、OTP 过期时间、发送频率和真实收码登录均未在本阶段配置或验证。管理员只能按 `docs/supabase-email-otp-setup.md` 手动配置，不能把这些待办写成已完成。
- 产品目标为 6 位验证码，但未读取真实后台配置；前端只接受数字而不固定长度。
- 当前自带 API Key 仅支持浏览器本地保存、脱敏显示和清除；尚未接入真实模型调用，不得回退为 Mock 后伪装成真实 Key 分析。
- 当前平台 AI 仍处于测试阶段；前端不得调用 Worker、DeepSeek 或真实 Supabase 额度 RPC。
- 真实每日/月度计数、自带 API Key 调用、真实平台 AI 开放及真实 OTP 端到端验收尚未完成，不得写成已完成。

## 数据安全边界

- 用户 API Key 只能保存在浏览器本地，不能上传 Supabase、Worker、URL 或代码仓库。
- 简历原文、完整 JD 和原始上传文件默认只保存在浏览器本地。
- Supabase 仅可保存登录、匿名行为和未来由服务端管理的必要使用状态；前端不得使用 service role key。
- Worker secrets 只能配置在 Cloudflare Worker 环境中，不能写入页面、文档或 Git。
- Worker 与埋点不得记录简历原文、完整 JD、API Key、token、邮箱、手机号或模型原始响应。

## 8.6B/8.6C 安全能力必须保留

- 平台 AI 必须通过 `worker/index.js`，前端不得直连 DeepSeek。
- Worker 以后端验证的 Supabase 用户 ID 为准，不信任前端 userId。
- 保留原子预留、处理、成功确认、失败恢复、stale 恢复与 requestId 幂等。
- 保留输入长度限制、限流、严格 Schema 验证、Prompt Injection 数据边界和脱敏 Supabase 错误诊断。
- 只有模型成功并通过 Schema 验证才确认成功；失败不得计入成功分析次数。
- 根目录 `cloudflare-worker.js` 是旧入口，继续保持禁用。

## 文档与测试要求

- 产品规则变化时同步更新 `README.md`、本文件和对应 release 文档；不得修改用户维护的 `PRODUCT.md`，除非用户明确要求。
- 当前根目录没有 `package.json`，不要强行运行 `npm run build`。
- Worker 改动至少运行 `node --test worker/tests/stage-8.6b-worker.test.mjs`。
- 页面规则改动至少检查：未登录只能 Mock、非 Mock 不发 Worker、`ENABLE_PLATFORM_AI` 为 false、收费文案和付费埋点已移除、导入函数仍在。
- 登录模式改动至少运行 `node --test tests/login-mode.contract.test.mjs` 与 `node --test tests/otp-auth.contract.test.mjs`，检查默认 Magic Link redirect、OTP 休眠保留、session 恢复和退出后的门禁。
- 未获明确授权时，不连接真实 Supabase、不执行 migration、不调用真实 DeepSeek、不部署 Worker、不 push。
