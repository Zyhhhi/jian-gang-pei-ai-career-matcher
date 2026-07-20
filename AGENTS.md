# 简岗配 · RoleFit AI｜项目规则

## 当前产品定义：免费方案、Magic Link 与双模式 AI

简岗配 · RoleFit AI 是面向应届生和初级岗位求职者的本地优先求职分析工具。

- 未登录用户只可使用本地 Mock 演示、简历本地导入、JD 本地输入和本地历史记录。
- 未登录时，平台 AI 与自带 API Key 模式必须锁定；点击必须引导登录，绝不发送 Worker 请求。
- 本地 Mock 必须明确说明：本模式仅用于体验产品流程，结果由本地规则生成，不调用真实大模型。
- 已登录用户可选择平台 AI 或自带 DeepSeek API Key。
- 平台 AI 正式目标：成功分析才计次，每日最多 5 次、每月最多 30 次，同时受两个上限约束。
- 自带 DeepSeek API Key：登录后可用，不占平台次数，费用由用户自己的 DeepSeek 账户承担；简历与已确认 JD 由浏览器直接发送到 DeepSeek，不经过平台后端。
- 付费、支付、订单、购买、购买记录和自动增加额度方案已取消。
- `platform_paid_credits` 暂时保留在既有数据库 schema 中，但已废弃；前端不得展示、读取或依赖它，不得进行破坏性 migration。

## 当前真实实现边界

- `PLATFORM_AI_CONFIG.ENABLE_PLATFORM_AI` 必须保持 `false`，不得公开打开。
- 正式 Worker `jian-gang-pei-platform-ai` 已部署，入口为 `worker/index.js`，接口为 `https://jian-gang-pei-platform-ai.sozowali642.workers.dev/api/platform-analyze`。根目录 `cloudflare-worker.js` 仅为历史禁用入口。
- 前端已接线正式 Worker 地址，但 `ENABLE_PLATFORM_AI` 继续为 `false`。Worker 的 `PLATFORM_AI_ENABLED` 是独立的服务端紧急熔断开关，当前也为 `false`；缺失或除严格字符串 `true` 外的任何值均视为关闭。关闭时平台分析 POST 必须在 Supabase Auth、V2 RPC 和 DeepSeek 之前返回 `503 PLATFORM_AI_DISABLED`，但 OPTIONS/CORS 预检必须继续可用。
- 正式 Worker 已配置 `DEEPSEEK_API_KEY` 与 `SUPABASE_SERVICE_ROLE_KEY` 两个 Secret；只能记录名称，绝不能输出、复制或写入其值。实际部署前必须确认被 `.gitignore` 忽略的 `worker/wrangler.toml` 不会覆盖 Dashboard 中已验证的 CORS Origin 配置。
- `SUPABASE_AUTH_CONFIG.LOGIN_MODE` 是登录模式唯一事实来源，当前必须为 `magic_link`。正式发布使用 `signInWithOtp({ email, options: { emailRedirectTo } })`；redirect 由当前 HTTP(S) 页面路径生成，不得硬编码本地地址。
- `email_otp` 的发送、验证、倒计时与 Mock 测试必须继续保留，但默认隐藏且不得由普通用户触发。只有完成 SMTP 模板与真实验收后，才可将 `LOGIN_MODE` 改为 `email_otp`。
- 真实 Supabase 邮件模板、邮件服务、OTP 过期时间、发送频率和真实收码登录均未在本阶段配置或验证。管理员只能按 `docs/supabase-email-otp-setup.md` 手动配置，不能把这些待办写成已完成。
- 产品目标为 6 位验证码，但未读取真实后台配置；前端只接受数字而不固定长度。
- 自带 DeepSeek API Key 已固定直连 `https://api.deepseek.com/chat/completions`，模型固定为 `deepseek-v4-flash`；Key 仅能通过 V2 本地存储访问层按已验证 Supabase `user.id` 空间保存，不能进入 URL、Prompt、历史、埋点、错误信息、Supabase、Worker 或代码仓库。Key 可在同一账号刷新后恢复，但登出、session 失效或账号切换时必须删除离开账号的 Key。
- 自带 Key 调用前必须同时满足：已登录、已保存有效 Key、已确认简历与 JD 将直接发送给 DeepSeek；失败不得回退 Mock，只有通过本地 JSON 结构校验后才可渲染并写入本地历史。
- 已由本地浏览器探针确认 DeepSeek 直连 CORS 可用；GitHub Pages 正式域名仍须在发布前做一次独立 CORS 验收。若正式域名 CORS 失败，停止该功能发布，不得引入代理。
- 当前平台 AI 尚未公开开放；前端关闭门禁必须阻止 Worker 请求，服务端熔断必须阻止 Supabase Auth、V2 RPC 和 DeepSeek 调用。
- V2 migration 已在真实 Supabase 执行一次；V2 RPC、RLS、函数 owner、`SECURITY DEFINER`、`search_path` 和最小权限均已人工验收，不得重复执行 migration。
- 已完成一次受控真实后端调用，Worker、DeepSeek 与 V2 日/月计数链路均成功；验收后已立即恢复 `PLATFORM_AI_ENABLED=false`。该结果只证明后端闭环可用，不代表平台 AI 已公开开放。

## 数据安全边界

- 敏感浏览器数据必须只经过唯一的 V2 存储访问层，禁止业务代码直接调用 `localStorage.getItem`、`setItem` 或 `removeItem`。登录用户键格式为 `jian_gang_pei:v2:user:<uid>:<resource>`，访客键格式为 `jian_gang_pei:v2:guest:<resource>`；`uid` 只可来自已验证的 Supabase session。
- session 恢复完成前默认拒绝读取敏感本地数据。账号变化必须依次清空页面内存与文件引用、删除离开账号 Key、激活新的 verified scope、加载新 scope，不能闪现上一账号数据。
- 旧全局敏感键只能一次性移至 legacy quarantine，不能自动导入任何账号；旧全局 API Key 必须直接删除。当前不提供旧数据导入 UI，未来如增加必须由当前登录用户主动确认。
- `anonymousUserId` 和净化后的 `analyticsQueue` 可保持设备级，但不得含简历、JD、Key、分析全文、邮箱、`user.id`、token 或原始反馈正文。“清空本地数据”只可清空当前 active scope。
- 用户 API Key 只能保存在浏览器本地，不能上传 Supabase、Worker、URL 或代码仓库。
- 简历原文、完整 JD 和原始上传文件默认只保存在浏览器本地。
- Supabase 仅可保存登录、匿名行为和未来由服务端管理的必要使用状态；前端不得使用 service role key。
- Worker secrets 只能配置在 Cloudflare Worker 环境中，不能写入页面、文档或 Git。
- Worker 与埋点不得记录简历原文、完整 JD、API Key、token、邮箱、手机号或模型原始响应。
- “填入示例”只能使用仓库内经审计的明显虚构数据并覆盖页面临时态；认证 scope 恢复前必须禁用，用户主动保存简历并确认 JD 前不得写入正式档案或发起分析。

## 8.6B/8.6C 安全能力必须保留

- 平台 AI 必须通过 `worker/index.js`，前端不得直连 DeepSeek。
- Worker 以后端验证的 Supabase 用户 ID 为准，不信任前端 userId。
- 平台 AI V2 额度由 `docs/migrations/20260716_stage_8_6c_v2_platform_daily_monthly_quota.sql` 的 service-role RPC 唯一裁决：`reserve_platform_ai_quota_v2` 必须在同一用户事务锁内完成 Asia/Shanghai 日 5、月 30、滚动 60 秒 2 次、requestId 去重和陈旧恢复。Worker 不得以 RPC 外的预查询作为额度或限流权威，也不得读取、扣减或返回 legacy free/paid credits。
- V2 的 `reserved` / `processing` 请求在同一用户下一次 reserve 时自动恢复；TTL 固定 5 分钟，必须大于 Worker 最大 120 秒模型调用超时。失败、超时或非法输出只释放请求创建时记录的日/月预留，仍计入 60 秒防刷窗口；finalize、refund、recover 必须幂等且不得使 reserved_count 为负。
- 保留旧原子预留、处理、成功确认、失败恢复、stale 恢复与 requestId 幂等 RPC，供历史数据兼容；新 Worker 只能使用 V2 RPC。
- 保留输入长度限制、限流、严格 Schema 验证、Prompt Injection 数据边界和脱敏 Supabase 错误诊断。
- 只有模型成功并通过 Schema 验证才确认成功；失败不得计入成功分析次数。
- 根目录 `cloudflare-worker.js` 是旧入口，继续保持禁用。

## 文档与测试要求

- 产品规则变化时同步更新 `README.md`、本文件和对应 release 文档；不得修改用户维护的 `PRODUCT.md`，除非用户明确要求。
- 当前根目录没有 `package.json`，不要强行运行 `npm run build`。
- Worker 改动至少运行 `node --test worker/tests/stage-8.6b-worker.test.mjs`。
- 平台 AI 前端地址或开关改动至少运行 `node --test tests/platform-ai-config.contract.test.mjs`，检查正式基地址、接口路径、完整端点、旧测试地址移除和关闭状态零 Worker 请求。
- 页面规则改动至少检查：未登录只能 Mock、非 Mock 不发 Worker、`ENABLE_PLATFORM_AI` 为 false、收费文案和付费埋点已移除、导入函数仍在。
- 登录模式改动至少运行 `node --test tests/login-mode.contract.test.mjs` 与 `node --test tests/otp-auth.contract.test.mjs`，检查默认 Magic Link redirect、OTP 休眠保留、session 恢复和退出后的门禁。
- 自带 DeepSeek Key 改动至少运行 `node --test tests/own-api-direct.contract.test.mjs`，检查固定端点、无 Key 请求体泄露、结构校验、错误不回退 Mock 与未登录门禁。
- 本地敏感数据或认证切换改动至少运行 `node --test tests/local-data-isolation.contract.test.mjs`，检查 auth 恢复默认拒绝、guest/A/B 隔离、定向 Key 清除、legacy quarantine、损坏 JSON 降级与切换顺序。
- 未获明确授权时，不连接真实 Supabase、不执行 migration、不调用真实 DeepSeek、不部署 Worker、不 push。
