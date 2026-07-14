# 简岗配 AI 产品审计报告

审计日期：2026-07-14
审计范围：本地工作树、GitHub Pages 线上站点、Cloudflare Worker 公网入口、项目内 Supabase SQL 与浏览器实际流程。
审计原则：代码存在不等于功能完成；只有实际运行且符合验收条件才标记为 `✅ 已完成并实测通过`。

## 审计边界与证据

- 实际仓库：`jian-gang-pei-ai-career-matcher`，当前分支 `feature/commercial-mvp`。
- 本地验收地址：`http://127.0.0.1:4178/index.html`。
- 线上地址：`https://zyhhhi.github.io/jian-gang-pei-ai-career-matcher/`。
- Worker 路由：`POST /api/platform-analyze`。
- 未使用或读取 DeepSeek API Key、Supabase service role key、Cloudflare Token、支付密钥。
- 未使用真实用户登录凭据，因此“有效 JWT + 真实模型 + 真实额度”的完整线上链路标记为未完整确认。
- 未进入 Supabase 管理后台；表和 RLS 以项目 SQL 为代码证据，`usage_events` 匿名写入通过浏览器网络请求实测。
- 本轮未部署、未修改数据库、未修改业务代码；只新增本报告。

## 1. 当前项目概况

### 技术栈

- 前端：原生 HTML、CSS、JavaScript，主要逻辑集中在 `index.html`。
- 构建：无 `package.json`，无前端构建流程。
- 部署：GitHub Pages。
- 浏览器解析：FileReader；按需加载 PDF.js `3.11.174` 与 Mammoth.js `1.10.0`。
- 登录与数据库：Supabase Auth、PostgREST、RLS SQL。
- 平台 AI：Cloudflare Worker 代理 DeepSeek Chat Completions。
- 本地数据：localStorage。

### 主要文件

- `index.html`：页面、状态、Mock 分析、登录、埋点、文件导入、历史与 Worker 接入。
- `worker/index.js`：JWT 校验、输入校验、限流、requestId 去重、DeepSeek 调用和额度更新。
- `worker/wrangler.toml.example`、`worker/README.md`：Worker 配置与部署说明。
- `docs/supabase_auth_quota.sql`：`user_quota`。
- `docs/supabase_ai_requests.sql`：`ai_requests`。
- `docs/supabase_usage_events.sql`：`usage_events`。
- `README.md`、`AGENTS.md`、`PRODUCT.md`：项目说明与阶段规则。

### 工作树和部署状态

- 当前分支有大量未提交文件和修改：`index.html`、Worker、SQL、README、AGENTS 等均未形成可追踪发布版本。
- GitHub Pages 返回 HTTP 200，但仍为旧版页面，只包含简历文本、JD、API Key 和简易历史记录。
- 线上版没有 `resumeProfile`、`jobDraft`、`jobRecords`、三模式 UI、Supabase Auth、PDF/DOCX 导入。
- 线上旧版向 Worker 根路径 `/` 发 POST，实测返回 404，随后回退本地 Mock。
- 本地工作树中的 Worker 路由为 `/api/platform-analyze`，线上前端与 Worker 路由不一致。

### 当前数据存储方式

- `resumeProfile`、`jobDraft`、`jobRecords`、旧历史、反馈、匿名埋点队列、AI 模式和用户自带 Key 均在 localStorage。
- `usage_events` 会通过 Supabase anon/publishable key 写入 Supabase；实测 HTTP 201。
- 登录用户的简历和求职记录未同步 Supabase，也未按用户命名空间隔离。
- `user_quota` 与 `ai_requests` 由 Supabase 表承载；Worker 使用 service role 访问。

### 当前 AI 调用方式

- 本地 Mock：真实可用，不调用模型。
- 本地工作树的自带 Key 模式：只完成本地保存和状态提示，仍执行 Mock。
- 本地工作树的平台模式：代码会携带 Supabase access token 调 Worker，但未用有效账号完成本轮端到端实测。
- GitHub Pages 线上版：Worker 根路径返回 404，实际落入本地 Mock；可选用户 Key 的浏览器直连代码仍存在于旧版。

### 当前产品阶段

当前是“商业化演示版”：本地工作树已具备较完整交互和部分真实后端能力，但线上版本仍是旧静态 Demo，缺少一致、可复现、安全的生产闭环。

## 2. 功能核对表

| 模块 | 目标功能 | 当前状态 | 代码证据 | 实测结果 | 问题或风险 |
| -- | -- | -- | -- | -- | -- |
| 模式说明 | 清楚区分 Mock、自带 Key、平台 AI | 🟠 部分实现 | `index.html:890-941` | 本地能切换且输入不丢 | 多处文案仍称“只有 Mock 可用”或“不会真实扣额度”，与 Worker 代码冲突 |
| 本地 Demo | 不登录、不耗额度、明确为演示 | ✅ 已完成并实测通过 | `index.html:3190-3549` | 成功生成完整分区报告；无 Worker/DeepSeek 请求 | 分数是规则计算，不含证据级可信度 |
| 自带 API Key | 不耗平台额度，真实调用用户模型 | 🟠 部分实现 | `index.html:2666-2695` | 无 Key 能正确拦截；Key 可本地保存/清除 | 本地工作树仍走 Mock；线上旧版存在浏览器直连逻辑但未用真实 Key 测试 |
| 平台 AI | 登录后真实调用 Worker | 🟡 已实现但未完整测试 | `index.html:2964-3089` | 未登录正确拦截；Worker 无 token 返回 401 | 无有效 JWT 端到端实测；线上前端路由错误 |
| 简历粘贴 | 粘贴后可编辑并保存 | ✅ 已完成并实测通过 | `index.html:794-825,2369-2398` | 首次保存、手动修改、刷新恢复通过 | localStorage 为设备级，不是账号级 |
| TXT 导入 | FileReader 本地读取 | ✅ 已完成并实测通过 | `index.html:2510-2524` | 正常 TXT 提取成功 | 测试文件名会显示在页面，但不进入埋点内容 |
| PDF 导入 | PDF.js 逐页提取文字 | 🟠 部分实现 | `index.html:2526-2565` | Helvetica 两页文字 PDF 成功；扫描 PDF正确提示；中文 CID 文字 PDF未提取 | 对部分中文字体映射 PDF 兼容不足 |
| DOCX 导入 | Mammoth.js 提取纯文本 | ✅ 已完成并实测通过 | `index.html:2567-2581` | 正常 DOCX 成功 | 不保留原排版，符合当前 v1 边界 |
| 文件异常 | 空、超限、损坏、组件失败可理解 | ✅ 已完成并实测通过 | `index.html:2430-2619` | 空文件、10MB+、RTF、损坏 PDF/DOCX、CDN 失败、错误后重选均通过 | 加密 PDF 分支仅代码审查，未准备真实加密样本实测 |
| 文件隐私 | 原文件不上传 | ✅ 已完成并实测通过 | `index.html:820` | 网络记录仅有 PDF.js/Mammoth 脚本，无测试文件上传请求 | 提取文本在用户点击平台分析后会发送 Worker |
| 12000 字 | 完整展示，不静默截断 | ✅ 已完成并实测通过 | `index.html:2482-2494,2830-2839` | 12050 字完整保留并显示提示 | 只对平台模式做前置限制，Mock 可处理长文本 |
| 简历清除 | 删除档案并阻止分析 | ✅ 已完成并实测通过 | `index.html:2400-2410,2734-2743` | 删除后 localStorage 清空，分析提示先建档 | 无账号切换隔离 |
| JD 粘贴 | 自动保存草稿、修改后取消确认 | ✅ 已完成并实测通过 | `index.html:2076-2139` | 确认、刷新保持、模式切换保持通过 | 无版本冲突处理 |
| JD TXT 上传 | 上传 TXT 岗位描述 | 🔴 未实现 | 无对应控件/函数 | 未测试 | 目标流程缺口 |
| JD 截图 | 限制文件并先确认文本 | 🟠 部分实现 | `index.html:2193-2298` | 有格式、数量、大小、尺寸和元数据逻辑 | 无 OCR；仅上传元数据，需手动粘贴文字 |
| JD 异常 | 空、短、长、特殊字符 | 🟡 已实现但未完整测试 | `index.html:2177-2192,2822-2828`；Worker `178-199` | 短 JD 正确拦截；普通/注入字符串可确认 | 超长 JD 只在 Worker 拦截，未用有效 JWT 实测 |
| 匹配度 | 可解释综合分 | 🟠 部分实现 | `index.html:3193-3230` | Mock 分数由关键词、证据和硬性风险计算 | 未拆出能力/项目/工具/行业/学历经验五个子分 |
| 综合建议 | 投递建议并说明原因 | 🟠 部分实现 | `index.html:3204-3230` | 有推荐标签和摘要 | 标签体系与目标三档不完全一致；平台输出缺少严格验证 |
| 核心匹配点 | JD 要求对应简历证据 | 🟠 部分实现 | `index.html:3214,3323-3334` | 有匹配点列表 | 没有逐项“JD 原文—简历原文—匹配程度—说明”结构 |
| 短板风险 | 区分缺失、硬性风险和未知 | 🟠 部分实现 | `index.html:3204-3217,3336-3350` | 有硬性风险和短板列表 | “未写”与“不会”的边界未系统标记，缺少低置信度 |
| 关键词 | 覆盖、缺失、建议位置 | 🟠 部分实现 | `index.html:3201-3203,3631-3639` | 三组关键词可展示 | 未绑定到具体简历段落；建议可能被误解为应直接加入 |
| 简历优化 | 原文、问题、建议、版本、原因 | 🟠 部分实现 | `index.html:3641-3660` | 有模块问题、方向和推荐表达 | 不展示原文对照和修改原因；模型可能补写无依据内容 |
| 面试准备 | 多类问题和建议 | ✅ 已完成并实测通过 | `index.html:3676-3686` | 报告含 JD、项目、短板、AI/产品、HR 问题 | 缺少可信来源和置信度 |
| 可信度 | 引用原文、事实/推断分离、低置信度 | 🔴 未实现 | Worker 只要求 JSON；前端无证据结构 | 报告无引用与置信度模块 | 核心信任风险 |
| Prompt Injection | 把简历/JD 当数据而非指令 | ⚠️ 存在安全或数据风险 | Worker `buildPrompt()` 直接拼接用户文本 | Mock 注入字符串未泄露密钥；平台模式未实测 | 系统提示未明确隔离数据指令，且无输出事实校验 |
| 报告展示 | 分区、复制、重新生成 | ✅ 已完成并实测通过 | `index.html:3557-3737` | 12 个标题区和复制按钮可见 | 线上旧版仍是简化报告 |
| 历史自动保存 | 成功分析后刷新恢复 | ✅ 已完成并实测通过 | `index.html:3848-3908` | 双击只生成 1 条历史；刷新恢复通过 | 与 `jobRecords` 两套概念并存 |
| 求职记录 | 保存、查看、删除、清空 | ✅ 已完成并实测通过 | `index.html:3739-3847` | 保存和刷新恢复通过；不含简历原文/API Key | 只在 localStorage |
| 历史增强 | 搜索、筛选、收藏、归档 | 🔴 未实现 | 无相关字段与控件 | 未测试 | 批量岗位管理能力不足 |
| 登录用户历史 | Supabase 同步和用户隔离 | ⚠️ 存在安全或数据风险 | 全部使用固定 localStorage key | 代码可确认账号切换不分区 | 同一浏览器换账号可看到上一位用户本地数据 |
| 针对岗位生成简历 | 可编辑简历、差异、DOCX/PDF | 🔴 未实现 | 仅改写片段与 Markdown 导出 | Markdown 导出可用 | 无完整编辑器、差异视图、DOCX/PDF 简历生成 |
| 公司核验 | 实时来源核验 | 🔴 未实现 | 无网络搜索模块 | 未测试 | 页面未伪装已实现，边界清楚 |
| Supabase Auth | Magic Link、恢复、退出 | 🟡 已实现但未完整测试 | `index.html:1601-1711` | SDK 能加载；未登录状态正确 | 未用真实邮箱完成本轮登录；无密码重置/重复注册专项测试 |
| 登录状态恢复 | 刷新恢复 session | 🟡 已实现但未完整测试 | `getSession()`、`onAuthStateChange()` | 无有效 session 实测 | 依赖未固定版本 Supabase SDK |
| 用户额度 | 3 次免费、付费额度展示 | 🟡 已实现但未完整测试 | `index.html:1731-1864`、quota SQL | 未登录展示正常 | UI 文案仍声称“不真实扣减”，与 Worker 冲突 |
| 成功后扣额度 | 后端校验和更新 | ⚠️ 存在安全或数据风险 | Worker `77-130,268-300` | 未用有效 JWT 实测 | 模型调用与额度变更不在同一原子事务，并发有成本与状态不一致风险 |
| requestId 幂等 | 同 requestId 不重复 | 🟡 已实现但未完整测试 | Worker `63-72,312-330`；SQL unique | 未授权请求实测 401；无有效账号并发测试 | 唯一约束能阻止双插入，但创建错误不统一处理 |
| 限流 | 用户、IP/设备防刷 | 🟠 部分实现 | Worker `221-234` | 未用有效账号实测 | 用户级查询存在；IP/设备级明确未实现 |
| 输入限制 | 简历/JD/总长度限制 | 🟡 已实现但未完整测试 | Worker `3-5,178-199` | 前端简历超限提示通过 | Worker 的 8000/20000 限制未授权无法触达实测 |
| 模型输出校验 | JSON + 完整 schema | 🟠 部分实现 | Worker `469-478` | 只做 JSON.parse | 没有 schema、字段类型、枚举、事实引用验证；前端缺字段时会默认 60 分 |
| Worker 超时重试 | 超时、失败恢复 | 🔴 未实现 | 无 AbortController/timeout/retry | 未测试 | DeepSeek/Supabase 慢请求可长期挂起并留下 processing |
| Worker 参数 | 当前 DeepSeek V4 API 合规 | ❌ 已实现但存在明显错误 | Worker `350-368` | 未执行真实模型请求 | 官方文档要求 `reasoning_effort` 顶层；当前代码把它放在 `thinking` 内；thinking 模式下 temperature 也不会生效 |
| Worker 部署性 | Wrangler 可打包 | 🟡 已实现但未完整测试 | `worker/index.js`、示例配置 | 显式入口 dry-run 成功；直接使用 `.toml.example` 失败 | 按文档复制为 `wrangler.toml` 后才是有效配置流程 |
| 支付 | 5 元/15 次订单闭环 | 🔴 未实现 | 仅规则按钮/文案 | 未创建订单、未支付、未加额度 | 不适合接真实付费 |
| RLS | 用户只读自己的 quota/request | 🟡 已实现但未完整测试 | 三份 SQL 均启用 RLS | SQL 静态检查通过 | 未在后台以多个真实用户做越权测试 |
| 密钥 | 平台密钥仅 Worker Secret | 🟡 已实现但未完整测试 | 前端只配置 publishable key；Worker 读取 env | 仓库文本扫描未发现真实 DeepSeek/service role/Cloudflare Token | 无法读取部署 Secret 验证实际配置；线上旧版保存用户 Key 到 localStorage |
| 埋点 | 匿名事件写 Supabase | 🟠 部分实现 | `index.html:1892-1981` | `usage_events` POST 返回 201 | `start_analysis` 因自动聚焦在页面加载即触发；登录后 user_id 仍为 null；Worker 不落 usage event |
| Cloudflare 访问统计 | 真实 Web Analytics | 🔴 未实现 | `index.html:7-9` 只有注释 | 无真实脚本 | 无线上独立访问统计证据 |
| 隐私说明 | 本地保存、清除、敏感提醒 | ✅ 已完成并实测通过 | 页面“使用前说明”“隐私与数据安全说明” | 清除简历通过 | 平台发送前无单独确认弹窗；账号切换数据不隔离 |
| 移动/桌面布局 | 无横向溢出、控件可用 | ✅ 已完成并实测通过 | 响应式 CSS | 1440×900、390×844 均无横向溢出 | 未覆盖全部移动浏览器内核 |
| 基础无障碍 | 表单名称、键盘、状态可感知 | 🟠 部分实现 | 大多数 label、aria-live 状态存在 | 控件可键盘访问 | 两个 file input 缺少关联 label/aria-label；未做完整 WCAG/读屏测试 |
| 线上发布一致性 | 线上等于当前受审版本 | ❌ 已实现但存在明显错误 | Git 状态与线上 DOM 对比 | 线上 HTTP 200，但核心功能为旧版，Worker 调用 404 | 当前最大上线阻塞之一 |

## 3. 当前真实用户流程

### 本地工作树可运行流程

```text
打开本地页面
→ 粘贴或导入 TXT / 部分文字型 PDF / DOCX
→ 浏览器本地提取文字
→ 用户检查、修改并保存 resumeProfile
→ 粘贴 JD 或补充岗位字段
→ 确认 JD，保存 jobDraft
→ 选择 Mock / 自带 Key / 平台模式
→ Mock：本地规则生成完整求职包
→ 自带 Key：无 Key 拦截；有 Key 仍使用 Mock
→ 平台：未登录拦截；已登录代码路径会请求 Worker，但本轮未完成有效 JWT 实测
→ 成功结果自动进入旧历史，可手动保存 jobRecords
→ 刷新后 resumeProfile、jobDraft、历史和 jobRecords 保持
```

### GitHub Pages 线上真实流程

```text
打开旧版页面
→ 粘贴简历与 JD
→ 点击分析
→ POST Worker 根路径 /
→ Worker 返回 404
→ 页面明确显示 Worker 失败并回退本地 Mock
→ 本地生成简化报告并保存旧历史
```

线上当前没有简历档案、JD 确认、三模式选择、登录、额度、PDF/DOCX 导入和新版完整求职包。

## 4. Mock、预留和真实能力区分

### 真正调用真实服务

- 本地工作树会真实加载 PDF.js、Mammoth.js CDN，文件解析在浏览器执行。
- Supabase `usage_events` 匿名插入真实返回 201。
- Worker `/api/platform-analyze` 真实在线：OPTIONS 204，未授权/假 token POST 返回 401，GET 返回 405。
- GitHub Pages 静态站点真实在线，但版本陈旧。

### 只在前端模拟

- 本地 Demo 匹配分析、分数、建议和完整求职包。
- 本地工作树的自带 Key 模式分析。
- 付费规则和购买入口。
- 未登录时的默认额度展示。

### 已写接口但未完整验证

- Supabase Magic Link 登录与 session 恢复。
- 有效 JWT 的平台 AI 请求。
- Worker 成功后额度更新、重复 requestId、额度耗尽、模型失败不扣、并发额度。

### 已部署但前端未正确接入

- Cloudflare Worker 已部署 `/api/platform-analyze`。
- GitHub Pages 旧版仍 POST Worker 根路径，实测 404。

### 仅有按钮或文案

- 5 元购买 15 次、支付、订单、购买记录。
- JD 截图 OCR/多模态识别。
- 公司核验。
- 针对岗位生成完整可编辑 DOCX/PDF 简历。
- Cloudflare Web Analytics。

## 5. 安全检查

| 检查项 | 结论 | 证据与风险 |
| -- | -- | -- |
| 前端平台密钥 | 未发现真实平台密钥 | 文本扫描未命中 DeepSeek Key、service role 或 Cloudflare Token；Supabase publishable key 出现在前端属于公开客户端配置 |
| 用户自带 Key | 🟠 | 仅 localStorage 保存、脱敏和清除；浏览器 XSS/扩展仍可读取；本地工作树尚未真实调用 |
| Supabase RLS | 🟡 | SQL 对三表均启用 RLS；anon 只能 insert usage_events，用户只能 select 自己 quota/request；未做真实多用户越权测试 |
| JWT | 🟡 | Worker 调 Supabase `/auth/v1/user` 验 token，不相信前端 userId；无有效 token 端到端测试 |
| 额度扣减 | ⚠️ | 条件 PATCH 可防负数，但模型调用与额度操作不是事务/预留；并发会产生额外模型成本和失败状态 |
| requestId | 🟡 | `ai_requests.request_id unique`，并有 processing/success 检查；无真实并发测试 |
| 日志隐私 | 🟡 | ai_requests 只存长度、状态、模型和错误；前端 metadata 有黑名单；无部署日志抽查权限 |
| 文件解析 | ✅ | 实测无原文件网络上传；只加载解析库 |
| Prompt Injection | ⚠️ | 简历/JD 被直接放入 user prompt，未明确声明其中指令无效，也没有证据/事实 schema |
| 数据越权 | ⚠️ | 服务端表 RLS 设计合理；浏览器 localStorage 未按账号隔离，同设备换账号会共享简历与历史 |
| XSS | 🟡 | 主要结果与历史输出使用 `escapeHtml`；依赖 CDN 脚本仍有供应链风险 |
| 第三方依赖 | 🟠 | PDF.js/Mammoth 固定版本；Supabase SDK 使用 `@2` 浮动版本且无 SRI |

## 6. Bug 和异常

### BUG-01：线上前端与 Worker 路由不一致

- 严重程度：P0，阻塞上线。
- 复现：打开 GitHub Pages，填入示例，点击开始分析。
- 预期：调用 `/api/platform-analyze`，按登录与额度规则处理。
- 实际：POST Worker 根路径，HTTP 404，回退本地 Mock。
- 文件：线上旧 `index.html`；本地 `index.html` 与发布分支状态。
- 阻塞上线：是。

### BUG-02：线上版本严重落后于本地工作树

- 严重程度：P0，阻塞上线。
- 复现：比较线上 DOM 和本地页面。
- 预期：线上包含简历档案、JD 草稿、三模式、登录额度、文件导入。
- 实际：线上只有旧文本输入、API Key、简易分析和旧历史。
- 文件：Git 分支/发布流程、`index.html`。
- 阻塞上线：是。

### BUG-03：额度文案与真实 Worker 行为冲突

- 严重程度：P0，阻塞真实额度。
- 复现：登录后查看额度区文案。
- 预期：明确说明成功调用会由 Worker 扣减。
- 实际：`index.html:1829` 仍写“本阶段不会真实扣减额度”，而 Worker `108` 会更新额度。
- 文件：`index.html`。
- 阻塞上线：是。

### BUG-04：额度并发不是原子业务事务

- 严重程度：P0，阻塞真实额度和付费。
- 复现：同一用户在仅剩 1 次时用两个不同 requestId 并发请求。
- 预期：只允许一个请求进入模型调用，或失败请求可靠退款，数据库状态一致。
- 实际：两个请求可能都先调用模型；只有一个条件 PATCH 成功，另一个在已产生模型成本后失败。
- 文件：`worker/index.js:77-130,268-300`。
- 阻塞上线：是。

### BUG-05：模型结果仅解析 JSON，不验证业务 schema 和事实依据

- 严重程度：P0，阻塞可信 AI 输出。
- 复现：模型返回合法 JSON 但缺字段、错类型或无依据改写。
- 预期：拒绝无效结构，不扣额度，不展示编造内容。
- 实际：JSON.parse 即视为成功；前端缺失分数时默认 60，缺字段被默认值补齐。
- 文件：`worker/index.js:95-115,469-478`、`index.html:3103-3173`。
- 阻塞上线：是。

### BUG-06：部分中文文字型 PDF 被误判为扫描版

- 严重程度：P1。
- 复现：上传使用中文 CID 字体、缺少可用 ToUnicode 映射的文字 PDF。
- 预期：提取可复制文字，或更精确说明字体映射不兼容。
- 实际：提取为空并提示扫描版；标准 Helvetica 文字 PDF 可成功。
- 文件：`index.html:2526-2565`。
- 阻塞上线：否，但会影响中国用户常见简历。

### BUG-07：页面加载即记录 start_analysis

- 严重程度：P1。
- 复现：只打开本地页面，不点击分析区。
- 预期：只有用户主动进入/操作分析流程才记录。
- 实际：请求依次写入 `visit_site` 和 `start_analysis`，自动聚焦触发 focusin。
- 文件：`index.html:1448-1462,1920-1929`。
- 阻塞上线：否，但指标失真。

### BUG-08：DeepSeek thinking 参数层级与官方文档不符

- 严重程度：P1。
- 复现：按当前 Worker 请求体调用严格校验的 DeepSeek V4 API。
- 预期：`thinking` 只含 `type`，`reasoning_effort` 为顶层字段。
- 实际：`reasoning_effort` 被嵌套到 `thinking`；thinking 模式同时传 temperature，官方说明该参数不生效。
- 文件：`worker/index.js:350-368`。
- 阻塞上线：可能导致 400 或配置失效，需真实 API 合约测试。
- 参考：[DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)、[JSON Output](https://api-docs.deepseek.com/guides/json_mode/)。

### BUG-09：缺少请求超时，processing 可能长期残留

- 严重程度：P1。
- 复现：DeepSeek 或 Supabase 长时间无响应。
- 预期：达到超时后标记 failed，可安全重试且不扣额度。
- 实际：无 AbortController/timeout/retry，Worker 可一直等待。
- 文件：`worker/index.js`。
- 阻塞上线：高延迟或故障时会影响可用性。

### BUG-10：登录账号切换不隔离本地敏感数据

- 严重程度：P0，隐私阻塞。
- 复现：账号 A 保存简历后退出，账号 B 在同一浏览器登录。
- 预期：明确迁移/隔离/清理，账号 B 看不到账号 A 数据。
- 实际：固定 localStorage key，不随 session 变化。
- 文件：`index.html` 的 STORAGE、登录和本地数据函数。
- 阻塞上线：是。

### BUG-11：文件输入缺少可访问名称

- 严重程度：P1。
- 复现：读屏读取 `resumeFileInput`、`jobScreenshotInput`。
- 预期：有可理解的 label 或 aria-label。
- 实际：两个 file input 没有关联 label/aria-label。
- 文件：`index.html:808,862` 附近。
- 阻塞上线：否。

### BUG-12：初次 CLI 页面加载出现 favicon 404

- 严重程度：低。
- 复现：本地打开页面并检查 console。
- 预期：无无关资源错误。
- 实际：一次 Playwright CLI 记录 `/favicon.ico` 404；后续核心流程无 JavaScript console error。
- 文件：`index.html`/静态资源。
- 阻塞上线：否。

## 7. 功能差距

### P0：不修不能给真实用户使用（5 项）

1. 线上 GitHub Pages 与当前工作树严重不一致，核心新功能均未发布，且 Worker 路由 404。
2. 额度文案与实际 Worker 扣减冲突，用户无法知道是否会真实消耗额度。
3. 额度并发控制不是原子闭环，可能产生额外模型成本和请求/额度状态不一致。
4. 模型结果没有业务 schema、事实引用和防编造校验，合法 JSON 即可展示并扣额度。
5. 登录账号切换不隔离本地简历、JD 和历史，存在同设备用户数据泄漏风险。

### P1：商业 MVP 上线前应完成（18 项）

1. 提升中文文字 PDF 的字体映射兼容性和错误分类。
2. 增加 JD TXT 上传并复用本地文本读取逻辑。
3. 完成并实测自带 API Key 的真实分析模式，明确本地保存同意与风险。
4. 建立有效 JWT 的平台 AI 自动化端到端测试。
5. Worker 增加 DeepSeek/Supabase 超时、失败状态修复和安全重试策略。
6. 增加 IP/设备级基础防刷，而不只依赖 user_id。
7. 修正 DeepSeek thinking 参数并建立官方 API 合约测试。
8. 明确抵御 Prompt Injection，把简历/JD 作为不可执行数据。
9. 报告增加原文证据、事实/推断/建议、置信度和信息不足状态。
10. 增加能力、项目、工具、行业、学历经验的可解释子分。
11. 历史记录增加搜索、公司/岗位筛选、收藏、归档、分析模式和额度字段。
12. 登录用户历史同步或至少完成账号级本地命名空间隔离。
13. 补齐 Magic Link 的真实登录、过期 token、重复注册、错误链接和重置入口测试。
14. 修正埋点触发时机、登录 user_id 归属和 Worker 侧成功/失败事件记录。
15. 接入真实 Cloudflare Web Analytics，建立线上访问口径。
16. 固定 Supabase JS 具体版本并评估 SRI/CSP。
17. 补齐 file input 的可访问名称和完整键盘/读屏测试。
18. 在平台发送简历/JD 前提供明确、可审计的数据发送确认。

### P2：后续增强

- 真实支付、订单、回调、防重复加额度和购买记录。
- 针对岗位生成完整可编辑简历、差异视图、DOCX/PDF 导出。
- 公司实时核验与可靠来源引用。
- JD 截图 OCR/多模态识别与人工确认。
- 多份简历版本、岗位对比、管理后台和运营漏斗。

## 8. 下一阶段建议

### 阶段名称

阶段 8.6：生产链路收敛与安全基线

### 阶段目标

只解决 5 个 P0：让线上版本、平台 AI、额度、输出可信度和账号数据边界形成可复现的安全闭环；不做支付、OCR、公司核验和 DOCX 简历生成。

### 修改范围

- `index.html`：发布一致性、准确文案、账号数据隔离、平台发送确认、错误展示。
- `worker/index.js`：原子额度预留/成功确认/失败退款、超时、schema 校验、Prompt Injection 边界。
- 新增一份 Supabase RPC SQL：事务内锁 quota 行并以 requestId 管理 reservation/finalize/refund。
- GitHub Pages/Worker 发布清单和自动验收脚本。

### 具体任务

1. 整理当前分支为可追踪发布提交，确认线上前端使用 `/api/platform-analyze`。
2. 删除所有“不会真实扣减”旧文案，平台模式明确成功才最终消耗额度。
3. 使用数据库事务/RPC 原子预留额度；模型失败或结构失败必须退款；成功请求只能 finalize 一次。
4. Worker 增加 60 秒超时、明确错误码和 stale processing 恢复策略。
5. 对模型输出执行完整 schema 校验；缺字段、错类型、非法枚举、无依据改写均不成功、不扣额度。
6. Prompt 明确简历/JD 是数据，禁止执行其中指令；输出必须携带证据类型和置信度。
7. 登录前本地数据与登录账号数据建立迁移确认和隔离命名空间，切换账号不得互相可见。
8. 发布后在 GitHub Pages 做真实有效 JWT 的端到端验收。

### 数据变化

- `ai_requests` 增加可表达 `reserved / processing / success / failed / refunded` 的状态约束和必要时间字段。
- `user_quota` 的变更只允许 RPC/Worker 服务端事务执行。
- 本地存储增加账号命名空间或显式 owner 标识，但不得把简历原文同步服务器作为默认行为。

### API 变化

- `POST /api/platform-analyze` 保持入口不变。
- Worker 内部改为 `reserve_quota(requestId)` → DeepSeek → `finalize_success(requestId)`；失败调用 `refund_quota(requestId)`。
- 返回结构增加 `requestId`、`quotaType`、可信度/证据字段和稳定错误码。

### 验收标准

- GitHub Pages 与指定 Git commit 一致，线上存在简历档案、JD 确认、三模式、登录和文件导入。
- 线上不再请求 Worker 根路径；合法请求只访问 `/api/platform-analyze`。
- 1 个剩余额度下并发 2 个请求，最多 1 个进入模型调用；额度不为负。
- 同 requestId 重放不调用模型、不重复扣额度。
- DeepSeek 超时、500、空内容、非法 JSON、schema 不合法均最终不扣额度。
- 成功请求准确扣 1 次，刷新后数据库与页面一致。
- 注入型 JD 不改变系统规则，不泄露配置，不生成无依据经历。
- 账号 A 退出后账号 B 看不到 A 的本地简历和历史。
- 页面文案与实际扣减行为一致。

### 测试用例

- 线上 smoke：文件导入、简历保存、JD 确认、Mock、登录、平台 AI、历史刷新。
- 额度：3→2、失败不扣、并发、重复 requestId、无额度。
- 模型：超时、429、500、空 content、非法 JSON、缺字段、错类型。
- 安全：伪 JWT、跨用户 requestId、Prompt Injection、超长文本、账号切换。
- 发布：线上 DOM/版本号/Worker 路由与发布提交一致。

### 风险和回滚方案

- 风险：额度 RPC 设计错误、迁移旧 localStorage 失败、Worker 新版本错误率上升。
- 回滚：保留上一 Worker version；前端 `ENABLE_PLATFORM_AI` 可立即关闭平台模式；数据库变更采用新增 RPC/字段，不破坏旧表；GitHub Pages 保留上一个可恢复 commit。

## 9. 最终结论

1. **当前产品阶段**：商业化演示版。它比静态 Demo 更完整，但线上仍是旧版，不能视为可运营产品。
2. **是否适合给真实用户使用**：仅适合小范围、明确告知 Mock 边界的内测；不适合公开承诺真实平台 AI 服务。
3. **是否适合接入真实付费**：不适合。额度事务、发布一致性、数据隔离和输出可信度尚未达到付费要求。
4. **最大三个阻塞问题**：线上版本/Worker 路由不一致；额度并发不是原子闭环；AI 输出没有 schema 与事实依据校验。
5. **下一步最应该做什么**：执行“阶段 8.6：生产链路收敛与安全基线”，先关闭或暂停真实额度入口，修完 P0 并完成线上端到端验收，再讨论支付。

## 附录 A：实测记录摘要

### 文件导入

- TXT：成功，显示文件名/类型/大小并填入文本框。
- 标准 Helvetica 两页文字 PDF：成功，逐页文本合并。
- 中文 CID 文字 PDF：提取为空，提示扫描/图片版。
- 图片型扫描 PDF：正确提示无法自动识别。
- DOCX：成功，纯文本可编辑。
- 空文件、10MB+、RTF、损坏 PDF、损坏 DOCX：均显示中文错误。
- 解析组件加载失败：通过拦截 PDF.js CDN 实测，提示检查网络或粘贴文本。
- 错误后重新选择正常 TXT：成功。
- 12050 字：完整保留，显示 12000 字限制，不截断。
- 保存、修改、刷新、删除：均通过。
- 网络请求未出现测试简历文件名或原文件上传。

### 核心流程

- Mock 分析：成功；结果包含 JD 拆解、匹配点、短板、关键词、优化、改写、沟通话术、面试、自我介绍和反问。
- 双击分析：只生成 1 条历史记录。
- 求职记录：保存、刷新恢复通过；序列化记录不含 `resumeText`、完整简历或 API Key。
- 自带 Key 无 Key：正确拦截。
- 平台模式未登录：正确拦截。
- 短 JD：正确拦截。
- Prompt Injection 字符串在 Mock 中未导致密钥输出；平台模型链路未实测。

### 浏览器与接口

- 本地桌面 1440×900、移动 390×844：无横向溢出。
- 后续核心流程没有 JavaScript console error；一次初始 CLI 运行有 favicon 404。
- `usage_events`：浏览器 POST 实测 201。
- Worker：OPTIONS 204；无 token/假 token POST 401；GET 405。
- Wrangler：显式指定 `worker/index.js` 的 dry-run 成功，17.42 KiB；直接把 `.toml.example` 当 config 使用失败。
- GitHub Pages：HTTP 200，但 Worker 请求根路径返回 404，页面回退 Mock。

## 附录 B：当前数据结构差距

| 数据 | 当前结构 | 相比目标缺失/差异 |
| -- | -- | -- |
| resumeProfile | id、resumeText、targetRole、educationSummary、skillKeywords、projectSummary、experienceSummary、portfolioLinks、createdAt、updatedAt | 缺 userId、fileName、fileType、source、version |
| jobDraft | id、jdText、jdConfirmed、sourceType、公司/岗位/城市/薪资/学历/经验/出差/作息/备注、截图元数据、createdAt、updatedAt | 基本覆盖；无 userId/version，sourceType 不含 txt |
| jobRecords | id、公司、岗位、城市、薪资、matchScore、建议、优劣势摘要、缺失词、生成时间、status、reportSummary、fullReport、jdSnapshot | 缺 userId、resumeVersion、analysisMode、requestId、quotaConsumed、favorite、archived；不保存完整 JD 是隐私取舍 |
| user_quota | user_id、platform_free_total、platform_free_used、platform_paid_credits、created_at、updated_at | 剩余额度由计算得到；无事务 RPC、CHECK 约束和 reservation 状态 |
| usage_events | id、anonymous_user_id、user_id nullable、event_type、api_mode、job_category、success、duration_ms、metadata、created_at | 基本覆盖；requestId/errorCode 多在 metadata，前端当前始终 user_id=null，无去重键 |
| ai_requests | id、request_id unique、user_id、status、quota_type、model、input/output chars、error_code、时间 | 能做基础幂等；缺原子额度事务、stale processing 和退款状态 |
| orders | 不存在 | 真实支付全链路未实现 |
