# 简岗配 AI v0.8.6C-D 发布记录

## 范围

- 阶段：浏览器本地数据按登录账号隔离。
- 基线：`067a2335aa42bfb8803a92a915b36afda5ee76c4`。
- 未修改 `PRODUCT.md`、Worker、V2 migration、`LOGIN_MODE` 或 `ENABLE_PLATFORM_AI`；未连接真实服务、未执行 migration、未部署或 push。

## 已实现

- 以 schema version `2` 的单一访问层处理敏感浏览器存储。登录用户键为 `jian_gang_pei:v2:user:<Supabase user.id>:<resource>`，访客键为 `jian_gang_pei:v2:guest:<resource>`；页面不接受 URL、输入或业务参数作为 uid。
- `resumeProfile`、`jobDraft`、`jobRecords`、`jian_gang_pei_history`、`jian_gang_pei_feedback`、`feedbackRecords`、`aiMode` 和自带 DeepSeek Key 都按 scope 隔离。
- session 恢复完成前默认不加载敏感资料。账号切换、登出和 session 失效遵循固定顺序：先清空页面内存、输入、分析结果、历史和文件引用；再删除离开账号的 Key；随后激活 verified scope 并加载对应数据。
- Key 可在同一账号刷新恢复；离开该账号时定向删除，其他账号不能读取或继承。
- 旧全局敏感键一次性复制到 `jian_gang_pei:v2:legacy:quarantine:<resource>` 后再删除原键；迁移带完成标记且幂等，不会自动归属给任一账号。旧全局 API Key 直接删除，不进入 quarantine。旧数据主动导入界面尚未实现。
- `anonymousUserId` 和净化后的 `analyticsQueue` 继续按设备保存；净化规则拒绝用户 ID、邮箱、token、简历、JD、Key、报告、原始反馈正文等敏感字段。
- “清空本地数据”仅清空当前 active scope，不会删除其他 uid 或访客空间。

## 本地验证

- `node --test tests/local-data-isolation.contract.test.mjs`：覆盖 auth 恢复默认拒绝、guest/A/B 隔离、A 清空不影响 B、Key 刷新恢复与离开账号清除、legacy quarantine 幂等、损坏 JSON 降级、唯一访问层与切换顺序。
- 回归检查：登录模式、OTP、自带 Key 直连与 Worker 契约测试在本地运行；未调用真实 Supabase、DeepSeek 或浏览器端真实登录。

## 未验证边界

- 尚未用真实 Supabase session 在浏览器完成 A→B、session 过期和多标签页切换验收。
- GitHub Pages 正式域名的自带 Key CORS 二次验收仍待发布前由用户本人使用临时 Key 完成。
- 浏览器 localStorage 不提供静态加密；共用设备需要退出登录并按需清空当前数据空间。
