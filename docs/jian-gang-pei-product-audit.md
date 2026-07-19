# 简岗配 AI 产品审计摘要

更新时间：2026-07-19
审计性质：当前状态摘要；以工作树和已提交版本为准，不代表线上已发布版本。历史阶段结论保留在对应 `release-*.md` 文档中。

## 当前产品边界

- 未登录用户仅可使用本地 Mock 分析、本地简历导入、本地 JD 输入和本地历史记录。
- 页面必须说明：本模式仅用于体验产品流程，结果由本地规则生成，不调用真实大模型。
- 登录后可使用自带 DeepSeek API Key 浏览器直连真实分析；Key 按已验证 Supabase `user.id` 隔离保存，退出或切换账号时删除离开账号的 Key。
- 平台 AI 的规则为每日最多 5 次、每月最多 30 次，且仅成功分析计次；前端已接线正式 Worker，但 `ENABLE_PLATFORM_AI = false`，平台 AI 尚未公开开放。
- 默认登录仍为 Supabase Magic Link。邮箱 OTP 的发送、验证和倒计时代码已保留，但默认隐藏，SMTP 模板与真实收码尚未验收。
- 登录用户与访客的简历、JD、历史、反馈、AI 模式和 Key 已使用 V2 本地存储空间隔离。

## 已保留的安全基线

- 正式 Worker `jian-gang-pei-platform-ai` 已部署，实际入口为 `worker/index.js`，接口为 `https://jian-gang-pei-platform-ai.sozowali642.workers.dev/api/platform-analyze`；根目录 `cloudflare-worker.js` 仅为历史禁用入口。
- Worker 保留 JWT 校验、输入校验、限流、请求幂等、原子预留、成功确认与失败恢复能力；`PLATFORM_AI_ENABLED=false` 时在认证、V2 RPC 和 DeepSeek 前返回 `503 PLATFORM_AI_DISABLED`。
- V2 migration 已在真实 Supabase 执行一次，五个 V2 RPC、RLS、函数 owner、`SECURITY DEFINER`、`search_path` 与最小权限均已人工验收。
- 已完成一次受控真实后端调用，Worker、DeepSeek 与 V2 日/月计数链路成功；验收后已立即恢复 `PLATFORM_AI_ENABLED=false`。
- Worker 已配置名为 `DEEPSEEK_API_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 的两个 Secret；文档与仓库只记录名称，不记录值。
- 平台密钥和 Supabase 服务端密钥仅应存在于 Worker Secret；前端不得保存或暴露这些密钥。
- 文件导入在浏览器本地解析；Mock 分析不请求 Worker 或模型服务。
- 旧额度字段（包括 `platform_paid_credits`）暂时保留在数据库兼容层，但前端不读取、不展示、不依赖，标记为 deprecated。

## 仍待完成的发布工作

1. 合并、push 与 GitHub Pages 发布；这些操作必须另行授权。
2. 最终线上验收 Magic Link、账号隔离、自带 Key、无付费文案、前端关闭态与 Worker 关闭态。
3. GitHub Pages 正式域名下的自带 DeepSeek Key CORS 验收；失败时停止该功能发布，不引入代理。
4. 是否对公众开启平台 AI 必须另行明确决定；在此之前前后端开关都保持 `false`。
5. 邮箱 OTP 的 SMTP 模板、后台参数和真实收码验收；完成前继续使用 Magic Link。

## 历史审计结论

此前的商业化、计次展示和线上发布问题不再作为当前页面规则。不得重复执行 V2 migration，不得在未授权时修改 Worker 配置、调用真实 DeepSeek、push、部署或发布。
