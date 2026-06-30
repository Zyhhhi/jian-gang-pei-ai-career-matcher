const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Only POST is supported' }, 405);
    }

    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: 'Worker missing DEEPSEEK_API_KEY environment variable' }, 500);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const resumeText = String(payload.resumeText || '').trim();
    const jdText = String(payload.jdText || '').trim();

    if (resumeText.length < 40 || jdText.length < 40) {
      return json({ error: 'Resume text and JD text must both be at least 40 characters' }, 400);
    }

    try {
      const deepseekResp = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是资深 HR 和 AI 产品经理教练，只能分析用户提供的文本，只返回严格 JSON。'
            },
            {
              role: 'user',
              content: buildAnalyzePrompt(resumeText, jdText)
            }
          ],
          temperature: 0.25,
          max_tokens: 2600
        })
      });

      const deepseekData = await readJsonResponse(deepseekResp);
      if (!deepseekResp.ok) {
        const message = deepseekData.error?.message || deepseekData.error || `DeepSeek HTTP ${deepseekResp.status}`;
        return json({ error: message }, deepseekResp.status);
      }

      const content = deepseekData.choices?.[0]?.message?.content || '';
      const result = JSON.parse(stripCodeFence(content));
      return json(result);
    } catch (err) {
      return json({ error: err.message || 'DeepSeek proxy failed' }, 500);
    }
  }
};

async function readJsonResponse(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || 'Response is not JSON' };
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function stripCodeFence(text) {
  const match = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/);
  return (match ? match[1] : text).trim();
}

function buildAnalyzePrompt(resumeText, jdText) {
  return `你是一个基于 DeepSeek 文本模型的求职匹配分析 Agent。请只基于用户粘贴的简历文本和岗位 JD 文本进行分析，输出严格 JSON，不要 Markdown。

JSON 字段：
{
  "jobTitle": "岗位名称",
  "score": 0-100,
  "summary": "一句话摘要",
  "coreRequirements": ["岗位核心要求"],
  "strengths": ["简历匹配优势"],
  "weaknesses": ["简历明显短板"],
  "missingKeywords": ["缺失关键词"],
  "resumeSuggestions": ["简历修改建议"],
  "interviewQuestions": ["面试可能被问的问题"],
  "hrMessage": "给 HR 的打招呼话术",
  "nextActions": ["下一步行动建议"]
}

要求：
1. 不要假设你读取了图片、PDF、附件或网页内容。
2. 如果简历或 JD 信息不足，请明确提示需要用户补充文本。
3. 不要夸大结果；保留人工复核空间；建议具体可执行。
4. strengths 和 weaknesses 必须紧扣简历与 JD 的具体内容，不要使用模板化套话。

【简历文本】
${resumeText}

【岗位 JD 文本】
${jdText}`;
}
