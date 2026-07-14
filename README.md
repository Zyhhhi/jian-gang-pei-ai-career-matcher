# 简岗配 AI｜求职岗位匹配与简历优化助手

面向应届生 / 初级岗位求职者的岗位匹配与简历优化工具。用户可在浏览器本地导入或粘贴简历、确认岗位 JD，并生成结构化的求职分析包。

当前发布基线为 `v0.8.6-alpha`，属于商业化演示版，还不是可运营或可付费版本。

## 在线体验

- 线上地址：[https://zyhhhi.github.io/jian-gang-pei-ai-career-matcher/](https://zyhhhi.github.io/jian-gang-pei-ai-career-matcher/)
- 当前部署方式：GitHub Pages，从 `main` 分支根目录发布

## 当前发布基线

- 产品版本：`v0.8.6-alpha`
- 本地演示模式：已开放，使用本地规则 / Mock 生成演示分析
- 自带 API Key 模式：仅完成本地保存与界面，尚未启用真实模型调用
- 平台 AI 模式：`ENABLE_PLATFORM_AI = false`，安全与额度闭环测试完成前不调用 Worker、不扣减额度
- Worker 基础地址与接口路径分开配置，分析接口固定为 `POST /api/platform-analyze`
- 当前不接真实支付、订单或自动增加付费额度

## 当前功能

- 首页产品介绍与功能入口
- 我的简历档案，本地保存简历摘要和结构化信息
- TXT / 文字型 PDF / DOCX 简历本地解析与简历文本输入
- 岗位 JD 文本输入、确认和手动补充
- 岗位截图上传限制和截图元信息展示
- AI 模式选择：本地演示模式、自带 API Key 模式、平台 AI 模式
- Supabase 账号登录入口与平台 AI 额度展示；平台 AI 当前默认关闭
- 完整求职分析包
- 求职记录保存、查看、删除和清空
- 8 组岗位示例随机填入
- 历史分析记录
- 一键复制分析结果
- Markdown 导出
- 用户反馈记录
- 匿名访问统计和产品行为埋点预留
- 本地产品数据看板
- 轻量反馈模块
- 无外部 API 依赖的本地演示分析
- 移动端适配

## 技术栈

- 前端：原生 HTML / CSS / JavaScript
- 页面结构：单文件静态页面 `index.html`
- 样式方案：`index.html` 内联 CSS
- 路由方案：无前端路由，使用页面锚点跳转
- 数据存储：浏览器 `localStorage`
- 当前分析：本地演示模式使用规则 / Mock；自带 Key 和平台 AI 均未开放真实模型调用
- 登录和额度：阶段 7 预留 Supabase Auth 和 `user_quota`，阶段 8 新增 Worker 后端额度校验与扣减
- 部署：GitHub Pages

## 主要文件结构

```text
.
├── AGENTS.md
├── README.md
├── PRODUCT.md
├── cloudflare-worker.js        # 旧入口已禁用，请使用 worker/index.js
├── docs
│   ├── supabase_auth_quota.sql
│   ├── supabase_ai_requests.sql
│   ├── supabase_usage_events.sql
│   ├── jian-gang-pei-product-audit.md
│   └── release-0.8.6-alpha.md
├── worker
│   ├── index.js
│   ├── README.md
│   └── wrangler.toml.example
└── index.html
```

## 本地运行方式

当前项目是纯静态页面，不需要安装依赖。

可以直接用浏览器打开 `index.html` 预览；如果需要模拟线上静态服务，也可以用任意本地静态文件服务器打开项目根目录。

## 构建方式

当前项目没有 `package.json`，也没有 npm 构建脚本，因此当前阶段无法执行 `npm run build`。

后续如果引入 Vite、React、Vue 或其他构建工具，需要补充：

- `package.json`
- `npm run dev`
- `npm run build`
- 构建产物说明

## 数据安全说明

- 不允许把平台 DeepSeek API Key 放在前端代码中
- 用户 API Key 只允许保存在浏览器本地，不允许上传服务器
- 简历原文默认只保存在本地浏览器
- TXT、PDF、DOCX 原始简历文件只在浏览器本地解析，不上传原始文件
- 简历档案当前保存到 `localStorage` 的 `resumeProfile`，不会上传服务器
- 岗位草稿当前保存到 `localStorage` 的 `jobDraft`
- 求职记录当前保存到 `localStorage` 的 `jobRecords`，不保存完整简历原文
- 岗位截图只保存文件名、大小、图片尺寸、类型、上传时间等元信息，不保存 base64 或原图内容
- 不默认保存手机号、邮箱、真实姓名、身份证、API Key
- 自带 API Key 当前保存到 `localStorage` 的 `userApiKey`，页面只脱敏展示
- `localStorage` 当前还用于保存历史记录和反馈记录
- 阶段 5 的匿名埋点只保存事件类型、匿名用户 ID、时间、成功状态、耗时和区间类元数据，不保存简历原文、完整 JD、API Key、截图 base64 或图片文件
- 阶段 7 的登录配置只允许使用 Supabase anon key，绝对不能把 service_role key 放到前端、README、AGENTS.md、URL 或公开仓库中
- Supabase 后续只用于保存匿名行为数据、登录信息、额度、订单状态等必要数据
- 平台 API 后续只能走 Cloudflare Worker 代理，接口路径固定为 `/api/platform-analyze`
- 公开部署时，真实 DeepSeek API Key 必须放在 Worker 环境变量中

## 当前项目边界

- 当前还不是完整商业化版本
- 暂未接真实支付
- 平台 AI 后端代理代码已新增到 `worker/`，但 `v0.8.6-alpha` 前端开关默认关闭，不会调用 DeepSeek 或扣减额度
- Supabase 登录和额度展示可配置；真实平台 AI 的安全与额度闭环仍需在阶段 8.6B 完成
- 暂未接真实 OCR / 多模态截图识别
- 支持本地读取 TXT、文字型 PDF 和 DOCX；扫描版 PDF、图片简历和复杂排版不在当前范围
- 当前岗位截图上传只做限制和流程预留，不做真实 OCR 或多模态识别
- 当前分析结果只适合作为求职准备参考，不能替代 HR 或人工判断

## 阶段 8：Cloudflare Worker + DeepSeek 平台 API

阶段 8 新增了独立的 `worker/` 目录，用于平台 AI 模式的后端代理。前端不会直接调用 DeepSeek，也不会保存或展示平台 DeepSeek API Key。阶段 8.6A 将前端平台 AI 开关设为关闭，以下流程是尚未正式开放的后端设计。

平台 AI 调用流程：

1. 用户选择 `platform_api`。
2. 前端确认用户已通过 Supabase Auth 登录。
3. 前端生成 `requestId`，携带 Supabase `access_token`、`resumeProfile`、`jobDraft` 和 `anonymousUserId` 请求 Cloudflare Worker。
4. Worker 校验 Supabase token，不信任前端传来的 userId。
5. Worker 校验 `jobDraft.jdConfirmed`、简历和 JD 文本长度。
6. Worker 读取 `user_quota`，判断使用免费额度还是付费额度。
7. Worker 查询 `ai_requests`，防止同一 `requestId` 重复扣费。
8. Worker 做基础限流：同一用户 24 小时最多 10 次成功生成，同一用户 1 分钟最多 2 次请求。
9. Worker 调用 DeepSeek `deepseek-v4-pro`，并使用官方 JSON 输出参数；thinking mode 参数已按 DeepSeek 官方文档开启。
10. 只有 DeepSeek 成功返回且 JSON 解析成功后，Worker 才扣减额度并返回完整求职分析包。

前端配置：

```js
const PLATFORM_AI_CONFIG = {
  PLATFORM_WORKER_BASE_URL: 'https://your-worker.workers.dev',
  PLATFORM_ANALYZE_PATH: '/api/platform-analyze',
  ENABLE_PLATFORM_AI: false
};
```

默认关闭平台 AI。未配置 Worker URL 时，平台 AI 模式会显示“平台 AI 后端尚未配置”，不会报错，也不会调用 DeepSeek。

Worker 环境变量：

- `DEEPSEEK_API_KEY`：只放在 Cloudflare Worker secret。
- `SUPABASE_URL`：Supabase 项目 URL。
- `SUPABASE_SERVICE_ROLE_KEY`：只放在 Cloudflare Worker secret，绝对不能放前端。
- `ALLOWED_ORIGIN`：允许访问 Worker 的前端域名。
- `DEEPSEEK_MODEL`：默认 `deepseek-v4-pro`。

Supabase SQL：

- `docs/supabase_auth_quota.sql`：`user_quota` 表，保存免费次数、已用免费次数、付费额度。
- `docs/supabase_ai_requests.sql`：`ai_requests` 表，保存 `requestId`、用户、处理状态、额度类型、模型、输入输出长度和错误码，用于防重复扣费、限流统计和审计。
- `docs/supabase_usage_events.sql`：匿名行为事件表，阶段 8 增加平台 AI 请求相关事件说明。

安全边界：

- DeepSeek API Key 不能进入 `index.html`、README、AGENTS、URL 或 GitHub。
- Supabase `service_role` key 只能放在 Worker 环境变量。
- 前端只允许使用 Supabase `anon` key。
- Worker 不把简历原文、完整 JD、API Key、截图 base64 或 DeepSeek 原始请求全文写入 `usage_events`。
- 输入校验失败、登录失败、额度不足、限流、重复请求、DeepSeek 失败、JSON 解析失败都不扣次数。
- JSON 解析失败时返回 `DEEPSEEK_PARSE_FAILED`，并在 `ai_requests.error_code` 记录 `PARSE_FAILED`；第一版策略是不扣用户次数。

当前限制：

- 阶段 8 不做真实支付、不做订单系统、不自动增加 `platform_paid_credits`。
- IP 持久化限流目前只做文档预留；当前 Worker 使用 `ai_requests` 做用户级限流和 `requestId` 去重。后续可用 Durable Objects、Cloudflare WAF 或为 `ai_requests` 增加 `ip_hash`。
- 自带 API Key 模式仍不在前端直连 DeepSeek；当前仍保持本地规则 / Mock 占位。
- OCR / 多模态截图识别不在本阶段实现。

## 当前本地数据

- `resumeProfile`：本地简历档案，包含 `id`、`resumeText`、`targetRole`、`educationSummary`、`skillKeywords`、`projectSummary`、`experienceSummary`、`portfolioLinks`、`createdAt`、`updatedAt`
- `jobDraft`：本地岗位草稿，包含 `id`、`jdText`、`jdConfirmed`、`sourceType`、`companyName`、`jobTitle`、`city`、`salaryRange`、`educationRequirement`、`experienceRequirement`、`travelRequirement`、`workSchedule`、`extraNotes`、`screenshotFiles`、`createdAt`、`updatedAt`
- `jobRecords`：本地求职记录，包含 `id`、`companyName`、`jobTitle`、`city`、`salaryRange`、`matchScore`、`applyRecommendation`、`strengthsSummary`、`weaknessesSummary`、`missingKeywords`、`generatedAt`、`status`、`reportSummary`、`fullReport`、`jdSnapshot`
- `userApiKey`：用户自带 API Key，仅保存在当前浏览器本地；旧版 `jian_gang_pei_api_key` 会自动迁移到 `userApiKey`
- `jian_gang_pei_history`：历史分析记录
- `jian_gang_pei_feedback`：本地反馈记录
- `anonymousUserId`：匿名用户 ID，首次访问时随机生成，不使用手机号、邮箱、姓名，也不做浏览器指纹识别
- `analyticsQueue`：本地匿名事件队列；未配置 Supabase 时用于本地看板统计
- `feedbackRecords`：阶段 5 轻量反馈记录；不保存联系方式原文
- `aiMode`：阶段 6 AI 模式选择，取值为 `mock`、`own_api`、`platform_api`

阶段 1 的简历摘要提取为规则 / Mock 方式，不调用真实 AI，不写入 Supabase，不接支付或额度系统。阶段 2 的截图上传只做格式、大小、尺寸和数量限制，不做 OCR / 多模态识别。阶段 3 的完整求职分析包使用本地规则 / Mock。阶段 4 增加隐私提示、自带 API Key 脱敏管理和本地数据清空能力。阶段 5 增加 Cloudflare Web Analytics 预留、Supabase 匿名行为埋点预留、本地统计看板和轻量反馈模块。阶段 6 增加 AI 模式选择和模式状态保存。阶段 7 增加 Supabase Auth 和 `user_quota` 表结构。阶段 8 新增 Cloudflare Worker 平台 AI 后端代理。

## 阶段 5：访问统计和行为埋点

### Cloudflare Web Analytics 接入方式

当前 `index.html` 的 `<head>` 中已经预留 Cloudflare Web Analytics 脚本位置，但没有写入真实 token。

接入步骤：

1. 登录 Cloudflare，进入 Web Analytics。
2. 创建站点，填写 GitHub Pages 线上域名。
3. 复制 Cloudflare 生成的统计脚本。
4. 粘贴到 `index.html` 顶部注释标记的 Cloudflare Web Analytics 预留位置。
5. 部署到 GitHub Pages 后，访问数据可在 Cloudflare Web Analytics 后台查看。

GitHub Pages 可以直接使用 Cloudflare Web Analytics。没有真实 token 时，不需要添加脚本，页面不会报错。

### Supabase 匿名行为埋点

`index.html` 中预留了轻量配置：

```js
const ANALYTICS_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  ENABLE_SUPABASE_ANALYTICS: false
};
```

默认 `ENABLE_SUPABASE_ANALYTICS = false`。未配置 Supabase URL 或 anon key 时，事件只进入本地 `analyticsQueue`，用于页面上的产品数据看板。

如果后续要写入 Supabase：

1. 在 Supabase 创建项目。
2. 执行 `docs/supabase_usage_events.sql` 中的建表 SQL。
3. 只把 Supabase `anon` key 填到前端配置中。
4. 不要把 `service_role` key 放到前端、README、AGENTS.md、URL 或公开仓库中。
5. 正式线上行为数据在 Supabase 后台或管理端查看；前端不直接读取 `usage_events` 全表。

### usage_events 表结构

```sql
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_user_id text,
  user_id text null,
  event_type text not null,
  api_mode text null,
  job_category text null,
  success boolean default true,
  duration_ms integer null,
  metadata jsonb null,
  created_at timestamptz default now()
);

alter table public.usage_events enable row level security;

create policy "anon can insert usage events"
on public.usage_events
for insert
to anon
with check (true);
```

RLS 建议：开启 RLS，允许 anon role insert，不允许 anon role select 全表数据。后续管理端查看数据应使用 Supabase 后台或服务端权限。

### 当前埋点事件

- `visit_site`
- `start_analysis`
- `upload_resume`
- `resume_profile_created`
- `resume_profile_deleted`
- `paste_jd`
- `upload_jd_screenshot`
- `jd_text_confirmed`
- `run_match_analysis`
- `generate_job_package`
- `save_job_record`
- `delete_job_record`
- `clear_all_local_data`
- `switch_to_own_api`
- `switch_to_platform_api`
- `api_key_saved`
- `api_key_cleared`
- `click_platform_api_payment`
- `submit_feedback`
- `login_opened`
- `login_success`
- `login_failed`
- `logout_success`
- `quota_loaded`
- `quota_initialized`
- `platform_api_requires_login`
- `platform_api_quota_viewed`
- `platform_api_free_available`
- `platform_api_limit_reached`

### 本地产品数据看板

当前看板展示：

- 本地访问事件数
- 简历档案创建次数
- JD 确认次数
- 完整求职包生成次数
- 求职记录保存次数
- API Key 保存次数
- 平台 API 付费点击次数
- 用户反馈条数

正式线上访问数据以 Cloudflare Web Analytics 为准；正式产品行为数据以 Supabase 后台为准。

## 阶段 6：AI 模式选择

当前已有三种 AI 模式：

- 本地演示模式 `mock`：默认模式，当前真正可运行。使用本地规则 / Mock 分析生成完整求职分析包，不需要登录，不需要 API Key，不消耗 API 额度。
- 自带 API Key 模式 `own_api`：用户使用自己的 API Key，免费不限次数，模型费用由用户自己的 API 账户承担。当前阶段只完成 UI、localStorage 保存、脱敏展示和流程占位；尚未接入真实自带 API 调用。
- 平台 AI 模式 `platform_api`：使用平台 AI 服务，无需用户自己配置 API。阶段 8 已新增 Cloudflare Worker 后端代理；默认关闭，配置 Supabase Auth、Worker URL 和 Worker secrets 后才会真实调用。真实支付尚未接入。

平台 AI 商业规则统一为：登录后免费体验 3 次，之后 5 元购买 15 次完整求职分析额度。每 1 次额度可生成 1 份完整求职分析包。

阶段 6 的分析按钮行为：

- `mock`：继续按当前本地规则 / Mock 流程生成完整求职分析包。
- `own_api`：没有保存 `userApiKey` 时阻止分析并提示先保存 Key；已保存 Key 时当前仍使用本地规则生成演示分析，并提示后续才接真实 API 调用。
- `platform_api`：未配置 Worker 时阻止调用并提示后端尚未配置；配置后由 Worker 校验登录、额度、限流并在 DeepSeek 成功后扣减额度；不创建订单。

## 阶段 7：登录和额度系统

阶段 7 新增 Supabase Auth 登录占位 / 接入能力，以及平台 AI 额度展示。

当前 `index.html` 中预留配置：

```js
const SUPABASE_AUTH_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  ENABLE_SUPABASE_AUTH: false
};
```

默认 `ENABLE_SUPABASE_AUTH = false`。未配置 Supabase URL 或 anon key 时，页面不会报错，登录模块显示“登录功能尚未配置，当前可继续使用本地演示模式或自带 API Key 模式。”

接入 Supabase Auth 的步骤：

1. 在 Supabase 创建项目并开启邮箱 Magic Link / OTP 登录。
2. 执行 `docs/supabase_auth_quota.sql` 创建 `user_quota` 表和 RLS。
3. 将 Supabase 项目 URL 和 anon key 填入 `SUPABASE_AUTH_CONFIG`。
4. 不要把 service_role key 放到前端；service_role 只能用于后续服务端或管理端。

`user_quota` 表结构：

```sql
create table if not exists public.user_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  platform_free_total integer default 3,
  platform_free_used integer default 0,
  platform_paid_credits integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

字段说明：

- `user_id`：对应 `auth.users.id`
- `platform_free_total`：默认 3
- `platform_free_used`：已使用免费次数
- `platform_paid_credits`：付费剩余额度，后续支付确认后增加

RLS 建议：

- 开启 RLS
- 用户只能 select 自己的 quota
- 可允许用户 insert 自己的一条默认 quota，便于首次登录初始化
- 不允许用户随意 update `platform_paid_credits`
- 后续付费额度增加必须由 Cloudflare Worker / 管理端服务端权限完成

平台 AI 规则：

- 必须登录
- 登录后免费体验 3 次
- 免费次数用完后，5 元购买 15 次完整求职分析额度
- 每 1 次额度可生成 1 份完整求职分析包

当前阶段限制：

- 平台 AI DeepSeek 调用代码已迁移到阶段 8 Worker，但 `v0.8.6-alpha` 明确关闭前端调用入口
- Cloudflare Worker 已新增为独立目录 `worker/`
- 没有真实支付
- 当前页面不会调用平台模型或扣减额度
- 自带 API Key 模式当前仍生成本地演示分析，不会使用保存的 Key 发起模型请求
- 平台 AI 后续若重新开放，必须通过 Worker，不能由前端直连 DeepSeek

额度不能只靠前端扣减。前端代码和 localStorage 容易被用户绕过，真正安全的额度扣减必须在阶段 8 的 Cloudflare Worker 中完成，由 Worker 校验登录、额度、限流后再调用平台 AI。

## 后续目标商业模式

- 自带 API Key：免费不限次数，用户自己承担模型费用
- 平台 AI：登录后免费体验 3 次，之后 5 元购买 15 次完整求职分析额度

## 后续推荐架构

- 前端：GitHub Pages
- 访问统计：Cloudflare Web Analytics
- 匿名行为数据：Supabase
- 登录：Supabase Auth
- 平台 API 代理：Cloudflare Worker
- 用户自带 API Key：localStorage
- 用户本地简历档案：localStorage

## 后续阶段计划

- 阶段 1：简历档案（已开始：本地 `resumeProfile`）
- 阶段 2：JD 输入和截图限制（已开始：本地 `jobDraft`）
- 阶段 3：完整求职分析包（已开始：本地规则分析 + `jobRecords`）
- 阶段 4：隐私和本地安全（已开始：本地数据管理 + `userApiKey`）
- 阶段 5：访问统计和行为埋点
- 阶段 6：AI 模式选择（已开始：`aiMode` + 三模式 UI）
- 阶段 7：登录和额度系统（已开始：Supabase Auth 配置占位 + `user_quota` 表结构 + 额度展示）
- 阶段 8：Cloudflare Worker + DeepSeek 平台 API（已开始：Worker 代理、后端额度校验、requestId 去重、限流和扣减）
- 阶段 8.6A：发布基线与线上一致性（`v0.8.6-alpha`，平台 AI 默认关闭）
- 阶段 8.6B：平台 AI、原子额度与可信输出
- 阶段 8.6C：账号隔离与完整线上验收
- 阶段 9：5 元买 15 次付费闭环
- 阶段 10：商用前最终验收

## 后续修改规则

- 每个阶段只做当前阶段任务
- 不要提前实现后续阶段
- 每次修改后必须尝试执行 `npm run build`
- 当前没有 npm 构建脚本时，需要在交付说明中明确说明
- 不要破坏现有页面和功能
- 不要暴露任何 API Key
- 重要数据结构变更必须更新 README 和 AGENTS.md
