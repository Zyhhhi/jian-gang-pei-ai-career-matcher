# 0.8.6C-E：平台 AI 服务端熔断开关

## 已完成

- Worker 新增普通配置 `PLATFORM_AI_ENABLED`；只有严格字符串 `true` 才允许 `/api/platform-analyze` 的 POST 进入既有认证、V2 RPC 与 DeepSeek 调用链。
- 缺失、`false` 或其他值均默认关闭，并返回 HTTP 503 / `PLATFORM_AI_DISABLED` 与中文提示；关闭路径不会访问 Supabase、额度 RPC 或 DeepSeek。
- OPTIONS 保持可用，便于部署后的 CORS 健康检查。
- V2 migration、五个 V2 RPC、RLS 与最小数据库权限已在真实 Supabase 人工验收。Worker 仍未部署。

## 发布门禁

- 前端 `PLATFORM_AI_CONFIG.ENABLE_PLATFORM_AI` 继续为 `false`。
- 初次部署与健康检查中，Worker `PLATFORM_AI_ENABLED` 必须保持 `false`。
- 只有以专用测试账号完成受控真实验收后，才能单独评估开启服务端开关；前端开关仍须单独授权。

## 不包含

- 不部署 Worker，不配置真实 Secret，不调用真实 DeepSeek。
- 不修改 `PRODUCT.md`，不改变登录策略、自带 Key、额度 SQL 或前端平台 AI 开关。
