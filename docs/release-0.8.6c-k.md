# 简岗配 · RoleFit AI v0.8.6c-k

发布日期：2026-07-22
范围：Worker-only 稳定性 Hotfix（尚未部署）

## 修复目标

平台 Worker 在 `deepseek-v4-pro` 配合高推理配置下，受控验收曾出现 `MODEL_TIMEOUT` 与 `OUTPUT_TRUNCATED`。本版本降低单次结构化输出的推理与 Prompt 开销，同时保持完整结果契约和失败退款。

## 变更

- 平台 Worker 保持 `deepseek-v4-pro`、`max_tokens: 8192` 和 JSON object 响应格式。
- 将平台请求的 thinking 调整为 disabled，并移除 `reasoning_effort: high`。
- 精简 Worker Prompt：保留 Schema 1.2 的 13 个业务字段、严格字段形状、真实性要求、信息不足时“需本人确认”、JSON-only 与边界要求；优先生成每个数组的最小简洁内容。
- 保留严格 Schema 校验、`finish_reason=length` 到 `OUTPUT_TRUNCATED`、超时到 `MODEL_TIMEOUT`、失败退款、日/月预留归零和不自动重试。
- 若上游提供 usage，只允许脱敏数值诊断；不记录或返回模型正文、Prompt、简历、JD、Token、Key 或字段值。

## 安全状态

- 前端 `ENABLE_PLATFORM_AI=false`。
- Worker `PLATFORM_AI_ENABLED=false`。
- 未执行 migration，未修改 Secret，未调用真实服务。
- 本版本未部署 Worker；受控验收和公开开放均需另行授权。
