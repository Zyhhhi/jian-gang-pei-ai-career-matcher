# 简岗配 AI v0.8.6-alpha 发布记录

> 历史发布记录。8.6C-A 已将产品规则调整为免费、登录后分层使用；以 `docs/product-plan-free-v1.md` 为当前规则来源。

## 发布信息

- 产品版本：`v0.8.6-alpha`
- 发布日期：2026-07-14
- 应用代码基线 commit：`3a0240050b5925e4e1f8cbdaa38a2ce2bf379b29`
- 首次 GitHub Pages 发布 commit：`5df839d5ff6e2f1e6486485728542b91da1f7b93`
- 发布来源：远端 `main` 分支根目录
- 线上地址：https://zyhhhi.github.io/jian-gang-pei-ai-career-matcher/
- Worker 基础地址：https://late-hall-c73cjian-gang-pei-api.sozowali642.workers.dev
- 平台分析接口：`POST /api/platform-analyze`

## 当前开放能力

- 本地简历档案 `resumeProfile`
- TXT、文字型 PDF、DOCX 本地解析；原始文件不上传
- 岗位草稿 `jobDraft`、JD 文本确认和手动补充岗位信息
- 本地规则 / Mock 完整求职分析包
- 历史记录和求职记录 `jobRecords`
- Supabase 邮箱登录入口
- 本地数据管理、匿名埋点和反馈

## 当前关闭能力

- 真实自带 API Key 模型调用
- 真实平台 AI 调用：`ENABLE_PLATFORM_AI = false`
- Worker 模型请求和真实使用次数计数
- OCR、多模态岗位截图识别和扫描版简历识别

平台 AI 关闭时仍展示模式说明，但点击分析不会请求 Worker，不会扣减额度，也不会回退并伪装成真实平台 AI 结果。

## 本地验收结果

验收地址：`http://127.0.0.1:4178/index.html`

- 页面加载与版本号：通过
- TXT 导入：通过
- 标准文字型 PDF 导入：通过
- DOCX 导入：通过
- 简历、JD、求职记录刷新恢复：通过
- 本地 Mock 完整分析包：通过
- 自带 API Key 无 Key 拦截：通过
- 平台 AI 开关拦截：通过，Worker 请求数为 0
- 390 x 844 与 1440 x 900 横向溢出检查：通过
- `jobRecords`、`analyticsQueue` 和截图元数据敏感内容检查：通过
- 浏览器控制台 error：0

## 线上验收结果

验收地址：https://zyhhhi.github.io/jian-gang-pei-ai-career-matcher/?release=5df839d

- GitHub Pages 构建状态：通过，构建 commit 与 `5df839d5ff6e2f1e6486485728542b91da1f7b93` 一致
- 首页加载和 `v0.8.6-alpha` 版本展示：通过
- TXT 导入：通过
- 标准 Helvetica 文字型 PDF 导入：通过
- DOCX 导入：通过
- 简历、JD 和求职记录刷新恢复：通过
- 本地 Mock 完整分析包和历史记录：通过
- 自带 API Key 无 Key 拦截：通过
- 平台 AI 功能开关拦截：通过，测试期间 Worker 请求数为 0
- Worker 端点配置：`/api/platform-analyze`，没有向 Worker 根路径 `/` 发起 POST
- 原始简历文件上传检查：未发现原始文件网络请求
- 390 x 844 与 1440 x 900 横向溢出检查：通过
- `jobRecords`、`analyticsQueue`、截图元数据和 API Key 原文检查：通过
- 浏览器控制台 error：0
- 已知失败：现有中文 CID 字体映射 PDF 测试文件仍可能提取为空；该问题未伪装为通过，保留在已知问题中

## 已知问题

- 部分中文 CID 字体映射的文字型 PDF 可能无法正确提取；扫描版和图片版 PDF 不支持 OCR。
- 自带 API Key 模式当前仍使用本地演示规则，不会使用保存的 Key 调用模型。
- 平台 Worker 代码存在，但原子额度、可信输出、Prompt Injection 防护完成前不会开放前端入口。
- 登录用户的简历、JD 和历史仍使用全局 localStorage key，尚未完成账号级隔离。
- Supabase JS CDN 当前未固定补丁版本，CSP/SRI 尚未完善。

## 回滚方式

上一线上基线为 `02d6bdbf21f146565587dee6ba49bae432771c33`。

不使用强制重置。若新版出现阻断问题，在 `main` 上创建针对应用代码基线提交的 revert 提交并推送：

```powershell
git fetch origin main
git switch -c rollback/v0.8.6-alpha origin/main
git revert 3a0240050b5925e4e1f8cbdaa38a2ce2bf379b29
git push origin HEAD:main
```

紧急情况下还可先把 `PLATFORM_AI_CONFIG.ENABLE_PLATFORM_AI` 保持为 `false`；当前发布默认已经关闭平台 AI。

## 下一阶段

历史后续阶段 8.6B 的安全能力已完成并由 8.6C 继续保留。当前下一步以免费方案的真实 OTP、每日/月度计数和平台 AI 端到端验收为准。
