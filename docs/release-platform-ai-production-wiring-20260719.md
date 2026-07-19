# 正式 Worker 前端接线记录（2026-07-19）

## 本次范围

- 将前端平台 AI Worker 基地址从旧测试 Worker 替换为正式 Worker `https://jian-gang-pei-platform-ai.sozowali642.workers.dev`。
- 接口路径继续使用 `/api/platform-analyze`，完整接口为 `https://jian-gang-pei-platform-ai.sozowali642.workers.dev/api/platform-analyze`。
- 前端 `ENABLE_PLATFORM_AI=false` 保持不变；未修改现有双重关闭门禁。
- 新增前端配置契约测试，锁定正式地址、接口路径、完整端点、旧测试地址移除，以及关闭状态零 Worker 请求。

## 已确认的后端状态

- Supabase V2 migration 已真实执行一次，五个 V2 RPC、RLS、函数与最小权限已经验收；不得重复执行。
- 正式 Worker `jian-gang-pei-platform-ai` 已部署，实际入口为 `worker/index.js`。
- 已配置 Secret 名称为 `DEEPSEEK_API_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY`；未在仓库或文档记录值。
- 一次受控真实后端调用已成功完成 Worker、DeepSeek 与 V2 日/月计数闭环。
- 验收后 Worker `PLATFORM_AI_ENABLED` 已恢复为 `false`；本次未连接或修改 Cloudflare。

## 发布边界

- 当前只完成正式地址接线，平台 AI 尚未公开开放。
- 默认登录继续使用 Magic Link；OTP 前端代码保留但未启用。
- 登录后的自带 DeepSeek Key 浏览器直连已经可用，不经过平台 Worker 或 Supabase。
- 本次不修改 `PRODUCT.md`、V2 migration、Worker 代码、Secret、平台 AI 开关或历史 release 文档，也不执行 push、部署或 GitHub Pages 发布。
- 仓库没有明确的下一版本号规则，因此页面页脚版本与日期未在本次自行调整，留待发布决策确定。
