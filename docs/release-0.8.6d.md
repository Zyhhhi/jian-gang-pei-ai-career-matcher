# 简岗配 · RoleFit AI v0.8.6d

发布日期：2026-07-23

## 平台 AI 正式开放

- 登录后可使用平台 AI；仅成功分析扣除额度，每日最多 5 次、每月最多 30 次。
- 已确认的简历与 JD 会发送至平台模型处理；页面明确提示不要上传身份证、银行卡、API Key 等敏感信息。
- 本地 Mock、自带 DeepSeek Key、Magic Link 登录、数据隔离、正式 Worker 地址与 V2 配额逻辑保持不变。
- Worker 服务端熔断开关 `PLATFORM_AI_ENABLED=true` 后提供正式能力；紧急关闭时仍在鉴权、额度 RPC 与模型调用之前返回 `PLATFORM_AI_DISABLED`。

## 请求生命周期

- stale recovery Cron 每 2 分钟运行，自动恢复超过 5 分钟的 `reserved` / `processing` V2 请求预留。
- 浏览器断线后分析结果可能无法取回，但陈旧额度预留会自动释放；不会增加成功次数，也不会自动重试模型。
- Queue、`202 Accepted` 与状态轮询是后续架构优化，不是本次公开开放阻塞项。
