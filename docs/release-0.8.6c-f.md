# 简岗配 AI v0.8.6C-F 发布记录

## 发布信息

- 产品版本：`v0.8.6c-f`
- 计划发布日期：2026-07-19
- 发布入口：GitHub Pages

## 本次发布能力

- 默认登录继续使用 Supabase 邮箱 Magic Link，支持 session 恢复与退出后的权限重新锁定。
- 邮箱 OTP 的发送、验证与倒计时代码继续休眠保留，默认不展示、不启用，不作为本次 Magic Link 发布阻塞项。
- 登录用户可使用自己的 DeepSeek API Key 从浏览器直连 DeepSeek；请求不经过平台 Worker 或 Supabase，失败不回退 Mock。
- Guest 与不同登录账号的简历、JD、历史、反馈、AI 模式和自带 Key 使用独立的 V2 本地存储空间；账号切换先清空页面敏感状态，再加载新空间。
- 平台 AI V2 额度规则为成功分析每日最多 5 次、每月最多 30 次，并受滚动 60 秒最多 2 次请求限制；失败释放日/月预留，但仍保留在防刷窗口中。
- Supabase V2 migration 已真实执行一次，五个 V2 RPC、RLS、函数配置与最小权限已经人工验收；不得重复执行 migration。
- 正式 Worker `jian-gang-pei-platform-ai` 已部署，实际入口为 `worker/index.js`，并已完成一次受控真实后端调用。

## 平台 AI 发布边界

- 前端已接线正式接口 `https://jian-gang-pei-platform-ai.sozowali642.workers.dev/api/platform-analyze`。
- 前端 `ENABLE_PLATFORM_AI=false` 保持关闭。
- Worker `PLATFORM_AI_ENABLED=false` 已在受控验收后恢复并保持关闭。
- 平台 AI 尚未向公众开放；本次发布不启用前端请求，也不改变服务端熔断状态。

## 不包含

- 不启用邮箱 OTP。
- 不开启平台 AI。
- 不重复执行数据库 migration。
- 不修改 Worker 配置或敏感环境配置。
- 不包含付费、积分、购买、订单或退款金额能力。
