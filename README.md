# 简历分析｜AI 简历-JD 匹配工具

一个面向应届生和初级求职者的 AI 求职辅助产品。用户粘贴简历文本和岗位 JD 后，系统生成匹配评分、岗位核心要求、简历优势、明显短板、关键词缺失、修改建议、面试问题和下一步行动建议。

这个版本不是替代原来的「简岗配」，而是作为一个新的产品化版本独立上线，用来展示从基础 Demo 到正式 AI 产品体验的迭代过程。

## 在线体验

部署到 GitHub Pages 后，可通过仓库 Pages 地址访问。

## 核心功能

- 简历文本与岗位 JD 匹配分析
- 结构化匹配评分和分析报告
- 8 组岗位示例随机填入
- 历史分析记录
- 一键复制分析结果
- Markdown 导出
- 用户反馈记录
- API 不可用时 Mock 兜底
- 移动端适配

## 示例岗位

- 初级 AI 产品经理 / AI 产品助理
- 数据产品助理
- 产品运营 / 用户运营
- AIGC 内容运营
- AI 应用运营
- ToB SaaS 产品助理
- 数据分析助理
- 智能硬件产品助理

## AI 能力边界

当前版本基于 DeepSeek 文本 API 设计，只分析用户粘贴的文本内容。

支持：

- 简历文本分析
- 岗位 JD 文本分析
- 结构化结果生成
- Mock 兜底演示

不支持：

- 图片简历识别
- 截图内容识别
- PDF 文件自动解析
- 自动保证通过筛选
- 替代 HR 或人工判断

如果用户手里是 PDF 或 Word 简历，建议先复制其中的文字，再粘贴到输入框中分析。

## 产品设计目标

功能可以保持 MVP 阶段，但视觉、信息架构和交互体验按照正式 AI 产品标准设计。用户第一次打开页面时，应感受到这是一个真实可用的 AI 求职产品，而不是学生 Demo 或技术实验。

重点体现：

- 求职场景需求拆解
- AI Agent 工作流设计
- Prompt 输出结构化
- 结果复用和历史记录
- Mock 兜底和异常处理
- 用户反馈与后续 Beta 化意识

## 技术实现

- 单文件静态页面：`index.html`
- 原生 HTML / CSS / JavaScript
- 数据存储：`localStorage`
- API：DeepSeek 文本 API；推荐通过 Cloudflare Worker 代理调用
- 部署：GitHub Pages

## 安全说明

项目不会在代码中写死 API Key。

推荐线上部署方式：

- GitHub Pages 托管前端页面
- Cloudflare Worker 作为 DeepSeek API 代理
- `DEEPSEEK_API_KEY` 放在 Cloudflare Worker 环境变量中
- 前端只请求 Worker，不直接暴露 DeepSeek Key

公开访问时，如果 Worker 未配置、DeepSeek 调用失败或 API 不可用，会自动使用本地兜底分析，保证演示流程不断。

## Cloudflare Worker 部署步骤

1. 登录 Cloudflare，进入 `Workers & Pages`
2. 创建一个新的 Worker
3. 将 `cloudflare-worker.js` 中的代码复制到 Worker 编辑器
4. 在 Worker 的环境变量中新增：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
```

可选环境变量：

```text
DEEPSEEK_MODEL=deepseek-chat
```

5. 保存并部署 Worker，得到类似这样的地址：

```text
https://your-worker-name.your-account.workers.dev
```

6. 回到 `index.html`，把顶部配置改成你的 Worker 分析接口：

```js
const WORKER_API_URL = 'https://your-worker-name.your-account.workers.dev/analyze';
```

如果 Worker 没有单独配置路由，也可以直接使用 Worker 根地址：

```js
const WORKER_API_URL = 'https://your-worker-name.your-account.workers.dev';
```

7. 提交并推送到 GitHub，等待 GitHub Pages 重新部署。

## 本地调试说明

如果还没有配置 Worker，可以在页面里临时输入 DeepSeek API Key 测试。但浏览器直连 DeepSeek 可能受到 CORS 或网络策略影响，线上稳定版本建议使用 Worker 代理。

## 面试表达

这个项目不是只做一个能跑的 Demo，而是围绕应届生投递前的真实痛点设计了完整 MVP。用户可以粘贴简历和岗位 JD，AI 输出结构化匹配结果，并支持历史记录、复制、导出、反馈和 Mock 兜底。这个版本作为独立项目上线，是为了展示从基础工具到正式 AI 产品体验的迭代能力。
