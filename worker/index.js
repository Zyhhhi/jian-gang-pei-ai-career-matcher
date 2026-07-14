const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-pro';
const MAX_RESUME_CHARS = 12000;
const MAX_JD_CHARS = 8000;
const MAX_TOTAL_CHARS = 20000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = buildCorsHeaders(env, origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/platform-analyze') {
      return json(error('NOT_FOUND', 'API route not found.'), 404, cors);
    }
    if (request.method !== 'POST') {
      return json(error('METHOD_NOT_ALLOWED', 'Only POST is allowed.'), 405, cors);
    }

    const missingEnv = ['DEEPSEEK_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
      .filter((key) => !env[key]);
    if (missingEnv.length) {
      return json({
        ...error('WORKER_NOT_CONFIGURED', 'Platform AI backend is not configured.'),
        missing: missingEnv
      }, 500, cors);
    }

    const token = getBearerToken(request);
    if (!token) {
      return json(error('AUTH_REQUIRED', 'Platform AI requires login.'), 401, cors);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json(error('INVALID_JSON', 'Invalid request JSON.'), 400, cors);
    }

    let user;
    try {
      user = await verifySupabaseToken(env, token);
    } catch {
      return json(error('AUTH_REQUIRED', 'Platform AI requires login.'), 401, cors);
    }

    const userId = user.id;
    const requestId = String(payload.requestId || '').trim();
    const resumeProfile = payload.resumeProfile || {};
    const jobDraft = payload.jobDraft || {};
    const validation = validateInput(requestId, resumeProfile, jobDraft);
    if (validation) return json(validation, 400, cors);

    const resumeText = String(resumeProfile.resumeText || '').trim();
    const jdText = buildJobText(jobDraft);
    const inputChars = countChars(resumeText) + countChars(jdText);

    const existing = await findAiRequest(env, requestId);
    if (existing?.status === 'success') {
      return json(error('DUPLICATE_REQUEST', 'This request has already succeeded.'), 409, cors);
    }
    if (existing?.status === 'processing') {
      return json(error('REQUEST_PROCESSING', 'This request is still processing.'), 409, cors);
    }
    if (existing) {
      return json(error('DUPLICATE_REQUEST', 'This requestId was already used. Create a new requestId and retry.'), 409, cors);
    }

    const rateLimit = await checkRateLimit(env, userId);
    if (rateLimit) return json(rateLimit, 429, cors);

    const quota = await getOrCreateQuota(env, userId);
    const quotaType = chooseQuotaType(quota);
    if (!quotaType) {
      return json(error('QUOTA_EXHAUSTED', 'Free quota is exhausted. Later users can buy 15 full analyses for 5 CNY.'), 402, cors);
    }

    await createAiRequest(env, {
      request_id: requestId,
      user_id: userId,
      status: 'processing',
      quota_type: quotaType,
      model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
      input_chars: inputChars
    });

    try {
      const model = env.DEEPSEEK_MODEL || DEFAULT_MODEL;
      const modelText = await callDeepSeek(env, model, resumeProfile, jobDraft);
      let report;
      try {
        report = parseModelJson(modelText);
      } catch {
        await updateAiRequest(env, requestId, {
          status: 'failed',
          error_code: 'PARSE_FAILED',
          output_chars: countChars(modelText),
          completed_at: new Date().toISOString()
        });
        return json(error('DEEPSEEK_PARSE_FAILED', 'AI output could not be parsed as JSON.'), 502, cors);
      }

      const deductedQuota = await deductQuota(env, userId, quotaType, quota);
      await updateAiRequest(env, requestId, {
        status: 'success',
        quota_type: quotaType,
        model,
        output_chars: countChars(JSON.stringify(report)),
        completed_at: new Date().toISOString()
      });

      return json({
        success: true,
        report,
        quotaType,
        model,
        quota: quotaForClient(deductedQuota)
      }, 200, cors);
    } catch (err) {
      await updateAiRequest(env, requestId, {
        status: 'failed',
        error_code: err.name || 'PLATFORM_API_FAILED',
        completed_at: new Date().toISOString()
      });
      return json(error(err.name || 'PLATFORM_API_FAILED', 'Platform AI request failed.'), 502, cors);
    }
  }
};

function error(errorCode, message) {
  return { success: false, errorCode, message };
}

function buildCorsHeaders(env, origin) {
  const allowed = String(env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes('*')
    ? '*'
    : (allowed.includes(origin) ? origin : allowed[0] || '');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

function getBearerToken(request) {
  const authHeader = request.headers.get('Authorization') || '';
  return authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

async function verifySupabaseToken(env, token) {
  const resp = await fetch(`${trimSlash(env.SUPABASE_URL)}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!resp.ok) throw new Error('AUTH_REQUIRED');
  const user = await resp.json();
  if (!user?.id) throw new Error('AUTH_REQUIRED');
  return user;
}

function validateInput(requestId, resumeProfile, jobDraft) {
  if (!requestId) return error('INVALID_REQUEST_ID', 'requestId is required.');
  if (!resumeProfile || !String(resumeProfile.resumeText || '').trim()) {
    return error('RESUME_REQUIRED', 'resumeProfile.resumeText is required.');
  }
  if (!jobDraft || jobDraft.jdConfirmed !== true) {
    return error('JD_NOT_CONFIRMED', 'JD text must be confirmed first.');
  }
  if (!String(jobDraft.jdText || '').trim()) {
    return error('JD_REQUIRED', 'jobDraft.jdText is required.');
  }

  const resumeChars = countChars(resumeProfile.resumeText);
  const jdChars = countChars(buildJobText(jobDraft));
  if (
    resumeChars > MAX_RESUME_CHARS ||
    jdChars > MAX_JD_CHARS ||
    resumeChars + jdChars > MAX_TOTAL_CHARS
  ) {
    return error('TEXT_TOO_LONG', 'Resume or JD text is too long.');
  }
  return null;
}

function buildJobText(jobDraft) {
  return [
    jobDraft.jdText,
    jobDraft.companyName && `Company: ${jobDraft.companyName}`,
    jobDraft.jobTitle && `Job title: ${jobDraft.jobTitle}`,
    jobDraft.city && `City: ${jobDraft.city}`,
    jobDraft.salaryRange && `Salary: ${jobDraft.salaryRange}`,
    jobDraft.educationRequirement && `Education: ${jobDraft.educationRequirement}`,
    jobDraft.experienceRequirement && `Experience: ${jobDraft.experienceRequirement}`,
    jobDraft.travelRequirement && `Travel: ${jobDraft.travelRequirement}`,
    jobDraft.workSchedule && `Schedule: ${jobDraft.workSchedule}`,
    jobDraft.extraNotes && `Notes: ${jobDraft.extraNotes}`
  ].filter(Boolean).join('\n');
}

function countChars(value) {
  return String(value || '').length;
}

async function checkRateLimit(env, userId) {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const minuteAgo = new Date(now - 60 * 1000).toISOString();

  const daily = await supabaseRest(env, `/rest/v1/ai_requests?user_id=eq.${userId}&status=eq.success&created_at=gte.${encodeURIComponent(dayAgo)}&select=id`);
  if (daily.length >= 10) return error('RATE_LIMITED', 'Too many successful platform AI generations today.');

  const recent = await supabaseRest(env, `/rest/v1/ai_requests?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(minuteAgo)}&select=id`);
  if (recent.length >= 2) return error('RATE_LIMITED', 'Requests are too frequent.');

  // Persistent IP throttling is intentionally documented as a follow-up. Current
  // Stage 8 uses ai_requests for user-level limits and requestId de-duplication.
  return null;
}

async function getOrCreateQuota(env, userId) {
  const rows = await supabaseRest(env, `/rest/v1/user_quota?user_id=eq.${userId}&select=*`);
  if (rows[0]) return normalizeQuota(rows[0]);
  const inserted = await supabaseRest(env, '/rest/v1/user_quota?select=*', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      platform_free_total: 3,
      platform_free_used: 0,
      platform_paid_credits: 0
    }),
    prefer: 'return=representation'
  });
  return normalizeQuota(inserted[0]);
}

function normalizeQuota(quota = {}) {
  return {
    user_id: quota.user_id,
    platform_free_total: Number(quota.platform_free_total ?? 3),
    platform_free_used: Number(quota.platform_free_used ?? 0),
    platform_paid_credits: Number(quota.platform_paid_credits ?? 0)
  };
}

function chooseQuotaType(quota) {
  if (quota.platform_free_used < quota.platform_free_total) return 'free';
  if (quota.platform_paid_credits > 0) return 'paid';
  return '';
}

async function deductQuota(env, userId, quotaType, quota) {
  const now = new Date().toISOString();
  if (quotaType === 'free') {
    const rows = await supabaseRest(
      env,
      `/rest/v1/user_quota?user_id=eq.${userId}&platform_free_used=eq.${quota.platform_free_used}&select=*`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          platform_free_used: quota.platform_free_used + 1,
          updated_at: now
        }),
        prefer: 'return=representation'
      }
    );
    if (!rows[0]) throw namedError('QUOTA_UPDATE_FAILED');
    return normalizeQuota(rows[0]);
  }

  const rows = await supabaseRest(
    env,
    `/rest/v1/user_quota?user_id=eq.${userId}&platform_paid_credits=eq.${quota.platform_paid_credits}&select=*`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        platform_paid_credits: quota.platform_paid_credits - 1,
        updated_at: now
      }),
      prefer: 'return=representation'
    }
  );
  if (!rows[0]) throw namedError('QUOTA_UPDATE_FAILED');
  return normalizeQuota(rows[0]);
}

function quotaForClient(quota) {
  return {
    platform_free_total: quota.platform_free_total,
    platform_free_used: quota.platform_free_used,
    platform_free_remaining: Math.max(0, quota.platform_free_total - quota.platform_free_used),
    platform_paid_credits: quota.platform_paid_credits
  };
}

async function findAiRequest(env, requestId) {
  const rows = await supabaseRest(env, `/rest/v1/ai_requests?request_id=eq.${encodeURIComponent(requestId)}&select=*`);
  return rows[0] || null;
}

async function createAiRequest(env, record) {
  await supabaseRest(env, '/rest/v1/ai_requests', {
    method: 'POST',
    body: JSON.stringify(record),
    prefer: 'return=minimal'
  });
}

async function updateAiRequest(env, requestId, patch) {
  await supabaseRest(env, `/rest/v1/ai_requests?request_id=eq.${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    prefer: 'return=minimal'
  });
}

async function supabaseRest(env, path, options = {}) {
  const resp = await fetch(`${trimSlash(env.SUPABASE_URL)}${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    body: options.body
  });
  const text = await resp.text();
  if (!resp.ok) throw namedError('SUPABASE_REST_FAILED', text);
  if (!text) return [];
  return JSON.parse(text);
}

async function callDeepSeek(env, model, resumeProfile, jobDraft) {
  const prompt = buildPrompt(resumeProfile, jobDraft);
  const deepseekRequest = {
    model,
    messages: [
      {
        role: 'system',
        content: 'You are a career coach for junior job seekers. Return strict JSON only. Write all user-facing report content in Simplified Chinese. Avoid guarantees about interview or hiring outcomes.'
      },
      { role: 'user', content: prompt }
    ],
    thinking: {
      type: 'enabled',
      reasoning_effort: 'high'
    },
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 6000
  };
  const resp = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify(deepseekRequest)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw namedError('DEEPSEEK_FAILED', data.error?.message || 'DeepSeek request failed.');
  const content = data.choices?.[0]?.message?.content || '';
  if (!content) throw namedError('DEEPSEEK_EMPTY');
  return content;
}

function buildPrompt(resumeProfile, jobDraft) {
  const schema = `{
  "matchScore": 0,
  "matchLevel": "",
  "applyRecommendation": "",
  "jdAnalysis": {
    "coreResponsibilities": [],
    "hardRequirements": [],
    "bonusPoints": [],
    "hiddenRequirements": [],
    "jobRisks": [],
    "interviewFocus": []
  },
  "resumeMatches": [],
  "resumeWeaknesses": [],
  "missingKeywords": {
    "covered": [],
    "missing": [],
    "suggested": []
  },
  "resumeOptimization": {
    "summaryAdvice": {"problem": "", "direction": "", "recommendedExpression": ""},
    "skillsAdvice": {"problem": "", "direction": "", "recommendedExpression": ""},
    "projectAdvice": {"problem": "", "direction": "", "recommendedExpression": ""},
    "experienceAdvice": {"problem": "", "direction": "", "recommendedExpression": ""},
    "portfolioAdvice": {"problem": "", "direction": "", "recommendedExpression": ""}
  },
  "rewrittenResumeContent": {
    "tailoredSummary": "",
    "projectRewrite": "",
    "skillsRewrite": ""
  },
  "messages": {
    "bossGreeting": "",
    "wechatMessage": "",
    "emailSubject": "",
    "emailBody": ""
  },
  "interviewPrep": {
    "jdQuestions": [],
    "projectDeepDiveQuestions": [],
    "weaknessValidationQuestions": [],
    "aiProductQuestions": [],
    "hrQuestions": []
  },
  "selfIntroduction": "",
  "reverseQuestions": [],
  "finalReminder": ""
}`;

  return [
    'Generate a complete job application analysis package.',
    'Output strict JSON only. No Markdown fences.',
    'All report content must be Simplified Chinese.',
    'The applyRecommendation must be one of four natural Simplified Chinese labels: worth prioritizing, can apply but not a priority, not recommended, or insufficient information requiring human judgment.',
    'Do not use any wording that guarantees passing, hiring, entry, absolute fit, absolute unfit, or system failure judgment.',
    'The finalReminder must state in Simplified Chinese that the content is only for job preparation reference, does not represent hiring results, does not guarantee interview or offer, and should be judged with real job requirements, personal experience, and HR communication.',
    'Use this exact JSON shape:',
    schema,
    'Resume profile:',
    JSON.stringify({
      targetRole: resumeProfile.targetRole || '',
      educationSummary: resumeProfile.educationSummary || '',
      skillKeywords: resumeProfile.skillKeywords || [],
      projectSummary: resumeProfile.projectSummary || '',
      experienceSummary: resumeProfile.experienceSummary || '',
      portfolioLinks: resumeProfile.portfolioLinks || [],
      resumeText: resumeProfile.resumeText || ''
    }),
    'Job draft:',
    JSON.stringify({
      jdText: jobDraft.jdText || '',
      companyName: jobDraft.companyName || '',
      jobTitle: jobDraft.jobTitle || '',
      city: jobDraft.city || '',
      salaryRange: jobDraft.salaryRange || '',
      educationRequirement: jobDraft.educationRequirement || '',
      experienceRequirement: jobDraft.experienceRequirement || '',
      travelRequirement: jobDraft.travelRequirement || '',
      workSchedule: jobDraft.workSchedule || '',
      extraNotes: jobDraft.extraNotes || ''
    })
  ].join('\n\n');
}

function parseModelJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw namedError('PARSE_FAILED');
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function namedError(name, message = '') {
  const err = new Error(message || name);
  err.name = name;
  return err;
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}
