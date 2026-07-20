# 简岗配 · RoleFit AI v0.8.6C-G 发布记录

## 发布信息

- 产品版本：`v0.8.6c-g`
- Hotfix 发布日期：2026-07-20
- 修复范围：真实 AI 请求成功后，完整求职分析包的简历改写、投递话术、自我介绍和反问问题不得为空

## 根因与修复

- 可信模型输出契约从 Schema 1.0 升级为 1.1。
- 自带 Key prompt 与 Worker prompt 统一要求显式返回 `resumeRewrite`、`outreachScripts`、`selfIntroduction` 和 `reverseQuestions`。
- 所有 UI 成品字段必须存在且非空；信息不足时返回以“需本人确认：”开头的明确提示，不得静默返回空字符串。
- 规范化逻辑直接映射 Schema 字段，不再依赖 `resumeSuggestions.section` 的中文名称或正则表达式猜测。
- 任一关键字段缺失、空白或结构错误时返回 `INVALID_MODEL_OUTPUT`，不显示成功结果，也不保存历史。
- Mock、自带 Key 和平台 AI 的新结果均通过同一完整求职分析包断言。
- 历史 Schema 1.0 规范化记录仍可读取；新的真实请求只接受 Schema 1.1。
- 自动历史不再保存完整 JD、Key、Token 或完整输入，只保留必要的本地摘要和非正文元数据。

## 安全边界

- 前端 `ENABLE_PLATFORM_AI=false` 保持关闭。
- Worker `PLATFORM_AI_ENABLED=false` 保持关闭。
- 本次只更新 Worker 源码契约，不部署 Worker、不修改 Cloudflare 配置。
- 不执行数据库 migration，不连接真实 Supabase，不调用真实 DeepSeek。
- 测试只使用合成数据、mock Provider 和 mock RPC。
