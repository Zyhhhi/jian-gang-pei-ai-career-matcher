# 简岗配 AI v0.8.6C-A 发布记录

## 范围

- 阶段：8.6C-A 免费产品方案与页面规则重置。
- 基线：`3672ccacdd098b2d2f9aac41b597f120021b22cd`。
- 不修改用户维护的 `PRODUCT.md`。
- 不连接真实 Supabase、不执行 migration、不部署 Worker、不调用真实 DeepSeek。

## 已完成的页面规则

- 未登录只可选择本地 Mock；平台 AI 与自带 API Key 卡片显示锁定，点击会引导登录。
- Mock 明确标注为本地规则体验，不调用真实大模型。
- 已登录后可选择平台 AI 或自带 API Key。
- 平台 AI 展示每日 5 次、每月 30 次、仅成功计次的目标规则，但 `ENABLE_PLATFORM_AI` 继续为 `false`，不会发送 Worker 请求。
- 自带 API Key 仅支持本地保存、脱敏显示与清除，真实调用明确标记为待接入，不会伪装为 Mock 或真实结果。
- 前端移除收费、支付、订单、购买、付费额度和相关转化埋点；不再读取或初始化 `platform_paid_credits`。

## 文档状态

- 正式产品方案见 `docs/product-plan-free-v1.md`。
- 登录目标改为邮箱 6 位 OTP；当前实际代码仍为 Magic Link。
- 历史 `platform_paid_credits` 字段保留并标记 deprecated；未执行任何数据库变更。
- 8.6B/8.6C 后端安全能力继续保留，未开启真实平台 AI。

## 验证

- 本阶段完成页面静态检查、导入逻辑存在性检查、JavaScript 语法检查和 Worker 24 项契约测试。
- 未运行 Playwright，未进行任何真实外部服务调用。
