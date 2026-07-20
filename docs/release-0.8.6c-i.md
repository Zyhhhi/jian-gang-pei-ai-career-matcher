# 简岗配 · RoleFit AI v0.8.6C-I 发布记录

发布日期：2026-07-20

## 本次修复

- 将可信 AI 输出契约升级为 Schema 1.2，减少模型轻微结构漂移导致的整次失败。
- 模型只生成业务内容；`schemaVersion`、`requestId`、`model` 和 UTC `generatedAt` 在内容校验成功后由应用注入。模型额外返回的 `generatedAt` 会作为未知字段丢弃。
- 对允许列表以外的未知字段进行递归丢弃，不将字段名、字段值或未知内容写入 UI 与历史。
- 为全部列表和用户可见文本设置集中、可测试的数量与长度边界，超出边界时明确失败，不截断后伪装成功。
- 精简 Prompt，仅保留一份紧凑业务结构、输出边界、真实性和完整性约束。
- 增加脱敏错误分类，可区分截断、JSON 解析、字段缺失、类型错误、空内容与边界超限。
- 保持单次调用，不自动重试；校验失败不保存历史、不渲染成功结果。

## 安全边界

- 简历改写、沟通话术和自我介绍只能使用简历与 JD 中已有事实；信息不足时必须使用“需本人确认：……”提示。
- 错误对象只包含固定错误码、允许列表字段路径和枚举化结束原因，不包含模型正文、简历、JD、API Key、Token 或 Authorization Header。
- 自带 Key 的模型、`temperature` 和 `max_tokens` 本次保持不变；未在确认官方参数支持前调整调用配置。

## 发布状态

- 前端 `ENABLE_PLATFORM_AI=false` 保持关闭。
- Worker `PLATFORM_AI_ENABLED=false` 保持关闭，本次不部署 Worker。
- 本次不调用 DeepSeek、Worker 或 Supabase，不执行 migration，不修改 Secret。
