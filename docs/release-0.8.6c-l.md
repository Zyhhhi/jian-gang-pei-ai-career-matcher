# 简岗配 · RoleFit AI v0.8.6c-l

发布日期：2026-07-23

## 平台 AI 请求生命周期修复

- 新增 Worker Scheduled stale recovery 源码，解决浏览器断线或 Worker 上下文提前结束后请求长期停留在 `reserved` 或 `processing` 的额度风险。
- Scheduled 路径每轮最多扫描 50 条超过 5 分钟的 V2 请求元数据，只读取 `requestId`、`userId`、`status` 与 `updatedAt`，并逐条调用既有 `recover_stale_platform_ai_request_v2`。
- 恢复依赖既有 V2 RPC 的幂等、用户锁、请求锁和原始日/月周期记录；不会直接改写额度计数，不增加成功次数，不调用 DeepSeek，也不自动重试模型。
- TTL 必须严格大于模型超时加 60 秒安全余量；不满足时 Scheduled 恢复拒绝执行并返回固定脱敏错误码，日志仍只记录汇总数字。
- Cron 仅保证额度最终释放；不会保留断线请求的分析结果。Queue + `202 Accepted` + 状态轮询需要单独的隐私与架构评审。

## 发布状态

- 前端 `ENABLE_PLATFORM_AI=false`。
- Worker `PLATFORM_AI_ENABLED=false`。
- 示例 Cron 仅写入 `worker/wrangler.toml.example`；尚未在 Cloudflare Dashboard 配置，也未部署 Worker。
- 未修改 migration、Secret、前端版本或公开开放状态。
