import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workerSource = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(new URL('../../docs/migrations/20260716_stage_8_6c_v2_platform_daily_monthly_quota.sql', import.meta.url), 'utf8');
const worker = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const MODEL = 'deepseek-v4-pro';
const START_TIME = Date.parse('2026-07-01T00:00:00.000Z');
const ENV = {
  DEEPSEEK_API_KEY: 'test-only-placeholder',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-placeholder',
  PLATFORM_AI_ENABLED: 'true',
  ALLOWED_ORIGIN: 'http://127.0.0.1:4178',
  DEEPSEEK_MODEL: MODEL,
  MODEL_TIMEOUT_MS: '15'
};

function validPayload(requestId = 'request-12345678') {
  return {
    requestId,
    analysisMode: 'platform_api',
    resumeProfile: {
      targetRole: 'AI 产品助理', educationSummary: '虚构大学本科', skillKeywords: ['PRD', '用户调研'],
      projectSummary: '完成虚构校园项目的需求分析和原型设计。', experienceSummary: '参与需求访谈并整理反馈。',
      portfolioLinks: [], resumeText: '候选人完成了一个虚构校园项目，负责用户访谈、需求分析、PRD 和原型设计，并根据测试反馈迭代方案。'
    },
    jobDraft: {
      jdText: '岗位负责 AI 产品需求分析、用户调研、PRD 和原型设计，需要良好的沟通协作能力，并能跟进项目落地。',
      jdConfirmed: true, companyName: '示例科技', jobTitle: 'AI 产品助理', city: '上海', salaryRange: '',
      educationRequirement: '本科', experienceRequirement: '应届生', travelRequirement: '', workSchedule: '', extraNotes: ''
    },
    anonymousUserId: 'anonymous-test-user'
  };
}

function validReport(requestId = 'request-12345678', model = MODEL) {
  return {
    schemaVersion: '1.1', requestId, generatedAt: '2026-07-14T08:00:00.000Z', model,
    jobSummary: { jobTitle: 'AI 产品助理', companyName: '示例科技', location: '上海', salary: null, educationRequirement: '本科', experienceRequirement: '应届生', coreResponsibilities: ['JD 要求负责 AI 产品需求分析和原型设计'], hardRequirements: ['JD 明确要求良好的沟通协作能力'] },
    recommendation: { recommendation: 'cautious', summary: '现有项目证据覆盖部分核心职责，仍需核实落地深度。', reasons: [{ kind: 'inference', statement: '项目方向部分匹配', evidence: '简历写有用户访谈、PRD 和原型设计', confidence: 78 }] },
    scores: { overall: 72, skills: 76, projects: 70, tools: 62, industry: 55, educationAndExperience: 74, rationale: [{ dimension: 'skills', score: 76, evidence: '简历写有用户访谈、PRD 和原型设计' }] },
    matches: [{ jdRequirement: 'JD 要求需求分析和原型设计', resumeEvidence: '简历写有需求分析、PRD 和原型设计', matchLevel: 'strong', reasoning: '简历能力关键词与 JD 核心职责直接对应', confidence: 84 }],
    risks: [{ type: 'information_missing', jdEvidence: 'JD 要求跟进项目落地', resumeEvidence: '简历中未发现上线结果或业务指标证据', conclusion: '项目落地深度需要在面试中核实', canImproveShortTerm: true, interviewAdvice: '准备说明项目交付范围和实际反馈', confidence: 81 }],
    keywords: { jdKeywords: ['需求分析', '用户调研', 'PRD', '原型'], existingKeywords: ['需求分析', '用户调研', 'PRD', '原型'], missingKeywords: [{ keyword: '项目落地', status: 'needs_user_confirmation', reason: '简历未给出上线或交付证据' }] },
    resumeSuggestions: [{ section: '项目经历', originalText: '完成虚构校园项目的需求分析和原型设计。', issue: '缺少交付范围和反馈证据', suggestedText: '在确认事实后补充交付范围和测试反馈。', reason: 'JD 强调项目落地', evidenceStatus: 'needs_user_confirmation' }],
    interviewPrep: { likelyQuestions: ['如何完成需求优先级判断？'], projectDeepDiveQuestions: ['项目原型如何验证？'], weaknessQuestions: ['是否有上线或交付经验？'], conceptsToReview: ['需求优先级', '原型验证'], preparationAdvice: ['准备项目范围、过程和反馈证据'] },
    resumeRewrite: {
      summary: '需本人确认：具备需求访谈、PRD 和原型设计项目实践。',
      projectExample: '需本人确认：围绕虚构校园项目完成需求分析、PRD 与原型设计，并根据测试反馈迭代。',
      skillsExample: '需本人确认：可使用用户调研、需求分析、PRD 和原型设计推进项目。'
    },
    outreachScripts: {
      boss: '您好，我关注贵公司的 AI 产品助理岗位，简历中有需求访谈、PRD 和原型设计项目实践。',
      wechat: '您好，我想进一步了解 AI 产品助理岗位的需求分析和项目落地职责。',
      emailSubject: 'AI 产品助理岗位投递',
      emailBody: '您好，我希望投递 AI 产品助理岗位，简历中包含需求访谈、PRD 和原型设计项目实践。',
      attachmentReminder: '请确认已附上简历和已有作品材料。'
    },
    selfIntroduction: '您好，我有需求访谈、PRD 和原型设计的项目实践，希望应聘 AI 产品助理岗位。',
    reverseQuestions: ['该岗位入职后三个月最重要的项目交付是什么？'],
    trust: { overallConfidence: 78, missingInformation: ['项目是否真实上线'], assumptions: ['仅依据用户提供的简历和 JD 文本'], evidenceCoverage: 76 }
  };
}

function makeRequest(payload, token = 'valid-token') {
  return new Request('https://worker.example/api/platform-analyze', {
    method: 'POST',
    headers: { Origin: 'http://127.0.0.1:4178', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload)
  });
}

async function body(response) { return response.json(); }

class MockBackend {
  constructor({ providerMode = 'success', rpcResponseLoss = [], paidCredits = 0, nowMs = START_TIME } = {}) {
    this.requests = new Map();
    this.periods = new Map();
    this.providerMode = providerMode;
    this.providerCalls = 0;
    this.rpcResponseLoss = new Set(rpcResponseLoss);
    this.lostRpcResponses = new Set();
    this.paidCredits = paidCredits; // Legacy data deliberately never read by V2 logic.
    this.nowMs = nowMs;
    this.fetch = this.fetch.bind(this);
  }

  advance(ms) { this.nowMs += ms; }
  dateInShanghai() { return new Date(this.nowMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 10); }
  monthInShanghai() { return `${this.dateInShanghai().slice(0, 7)}-01`; }
  periodKey(userId, kind, start) { return `${userId}:${kind}:${start}`; }
  period(userId, kind, start) {
    const key = this.periodKey(userId, kind, start);
    if (!this.periods.has(key)) this.periods.set(key, { userId, kind, start, reserved: 0, success: 0 });
    return this.periods.get(key);
  }
  existingPeriod(userId, kind, start) { return this.periods.get(this.periodKey(userId, kind, start)); }
  snapshot(userId, dayStart, monthStart) {
    const day = this.period(userId, 'day', dayStart);
    const month = this.period(userId, 'month', monthStart);
    return {
      daily_limit: 5, daily_success_count: day.success, daily_reserved_count: day.reserved,
      daily_remaining: Math.max(0, 5 - day.success - day.reserved),
      monthly_limit: 30, monthly_success_count: month.success, monthly_reserved_count: month.reserved,
      monthly_remaining: Math.max(0, 30 - month.success - month.reserved)
    };
  }
  row(outcome, request = null) {
    const response = { outcome, request_status: request?.status || null };
    if (request?.dayStart && request?.monthStart) Object.assign(response, this.snapshot(request.userId, request.dayStart, request.monthStart));
    return response;
  }
  applyRefund(request, errorCode) {
    if (request.status === 'success') return this.row('already_success', request);
    if (request.status === 'refunded') return this.row('already_refunded', request);
    if (!['reserved', 'processing', 'failed'].includes(request.status)) return this.row('invalid_state', request);
    const day = this.period(request.userId, 'day', request.dayStart);
    const month = this.period(request.userId, 'month', request.monthStart);
    assert.ok(day.reserved >= 1 && month.reserved >= 1, 'reserved counters cannot become negative');
    day.reserved -= 1; month.reserved -= 1;
    request.status = 'refunded'; request.errorCode = errorCode; request.updatedAt = this.nowMs;
    return this.row('refunded', request);
  }
  recoverStaleForUser(userId) {
    for (const request of this.requests.values()) {
      if (request.userId === userId && request.quotaPolicy === 'daily_monthly_v2'
        && ['reserved', 'processing'].includes(request.status) && request.updatedAt < this.nowMs - 300000) {
        this.applyRefund(request, 'STALE_RESERVATION_TIMEOUT');
      }
    }
  }
  rpc(name, input) {
    const requestId = input.p_request_id;
    const userId = input.p_user_id;
    const existing = this.requests.get(requestId);

    if (name === 'reserve_platform_ai_quota_v2') {
      this.recoverStaleForUser(userId);
      const current = this.requests.get(requestId);
      if (current) {
        if (current.userId !== userId || current.quotaPolicy !== 'daily_monthly_v2') return this.row('request_id_conflict');
        if (current.status === 'success') return this.row('already_completed', current);
        if (['reserved', 'processing'].includes(current.status)) return this.row('in_progress', current);
        return this.row('retry_with_new_request_id', current);
      }
      const recent = [...this.requests.values()].filter(row => row.userId === userId
        && row.quotaPolicy === 'daily_monthly_v2' && row.createdAt >= this.nowMs - 60000);
      if (recent.length >= 2) return { outcome: 'rate_limited', request_status: null };
      const dayStart = this.dateInShanghai();
      const monthStart = this.monthInShanghai();
      const day = this.period(userId, 'day', dayStart);
      const month = this.period(userId, 'month', monthStart);
      if (day.success + day.reserved >= 5) return this.row('daily_limit_exhausted', { userId, dayStart, monthStart });
      if (month.success + month.reserved >= 30) return this.row('monthly_limit_exhausted', { userId, dayStart, monthStart });
      day.reserved += 1; month.reserved += 1;
      const record = { requestId, userId, status: 'reserved', quotaPolicy: 'daily_monthly_v2', dayStart, monthStart, createdAt: this.nowMs, updatedAt: this.nowMs, model: input.p_model };
      this.requests.set(requestId, record);
      return this.row('reserved', record);
    }

    if (!existing || existing.userId !== userId || existing.quotaPolicy !== 'daily_monthly_v2') return this.row('request_id_conflict');
    if (name === 'mark_platform_ai_request_processing_v2') {
      if (existing.status === 'reserved') { existing.status = 'processing'; existing.updatedAt = this.nowMs; return this.row('processing', existing); }
      return this.row(existing.status === 'processing' ? 'already_processing' : 'invalid_state', existing);
    }
    if (name === 'finalize_platform_ai_request_success_v2') {
      if (existing.status === 'success') return this.row('already_success', existing);
      if (existing.status !== 'processing') return this.row('invalid_state', existing);
      const day = this.period(userId, 'day', existing.dayStart);
      const month = this.period(userId, 'month', existing.monthStart);
      assert.ok(day.reserved >= 1 && month.reserved >= 1, 'finalize cannot reduce below zero');
      day.reserved -= 1; month.reserved -= 1; day.success += 1; month.success += 1;
      existing.status = 'success'; existing.updatedAt = this.nowMs;
      return this.row('success', existing);
    }
    if (name === 'refund_platform_ai_quota_v2') return this.applyRefund(existing, input.p_error_code);
    if (name === 'recover_stale_platform_ai_request_v2') {
      if (existing.status === 'success') return this.row('already_success', existing);
      if (existing.status === 'refunded') return this.row('already_refunded', existing);
      return existing.updatedAt < this.nowMs - 300000 ? this.applyRefund(existing, 'STALE_RESERVATION_TIMEOUT') : this.row('not_stale', existing);
    }
    throw new Error(`Unknown RPC ${name}`);
  }
  async fetch(urlValue, options = {}) {
    const url = new URL(urlValue);
    if (url.pathname === '/auth/v1/user') {
      const token = String(options.headers?.Authorization || '').replace(/^Bearer\s+/, '');
      if (token === 'valid-token') return Response.json({ id: USER_ID });
      if (token === 'other-token') return Response.json({ id: OTHER_USER_ID });
      return Response.json({ message: 'invalid' }, { status: 401 });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').pop();
      const result = this.rpc(name, JSON.parse(options.body || '{}'));
      if (this.rpcResponseLoss.has(name) && !this.lostRpcResponses.has(name)) {
        this.lostRpcResponses.add(name);
        return Response.json({ message: 'simulated response loss after commit' }, { status: 503 });
      }
      return Response.json([result]);
    }
    if (url.pathname === '/rest/v1/ai_requests') {
      const requestId = url.searchParams.get('request_id')?.replace(/^eq\./, '');
      const rows = requestId ? [this.requests.get(requestId)].filter(Boolean) : [];
      return Response.json(rows.map(row => ({ request_id: row.requestId, user_id: row.userId, status: row.status, quota_policy: row.quotaPolicy })));
    }
    if (url.href === 'https://api.deepseek.com/chat/completions') return this.provider(options);
    throw new Error(`Unexpected URL ${url.href}`);
  }
  provider(options) {
    this.providerCalls += 1;
    const input = JSON.parse(options.body);
    const requestId = JSON.parse(input.messages[1].content.match(/Set requestId to exactly ("[^"]+")/)[1]);
    if (this.providerMode === 'timeout') return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    if (this.providerMode === '429') return Response.json({ error: { message: 'limited' } }, { status: 429 });
    if (this.providerMode === 'non-json') return Response.json({ choices: [{ message: { content: 'not json' } }] });
    const report = validReport(requestId, input.model);
    if (this.providerMode === 'missing-field') delete report.scores.overall;
    return Response.json({ choices: [{ message: { content: JSON.stringify(report) } }] });
  }
}

test('V2 migration contains the required non-destructive policy, lock, periods and grants', () => {
  assert.match(migrationSource, /create table if not exists public\.platform_ai_quota_periods/i);
  assert.match(migrationSource, /reserved_count >= 0/i);
  assert.match(migrationSource, /success_count >= 0/i);
  assert.match(migrationSource, /primary key \(user_id, period_kind, period_start\)/i);
  assert.match(migrationSource, /at time zone 'Asia\/Shanghai'/i);
  assert.match(migrationSource, /interval '60 seconds'/i);
  assert.match(migrationSource, /interval '5 minutes'/i);
  assert.match(migrationSource, /pg_advisory_xact_lock\(hashtextextended\('platform-ai-request:'/i);
  assert.match(migrationSource, /pg_advisory_xact_lock\(hashtextextended\('platform-ai-user:'/i);
  for (const rpc of ['reserve_platform_ai_quota_v2', 'mark_platform_ai_request_processing_v2', 'finalize_platform_ai_request_success_v2', 'refund_platform_ai_quota_v2', 'recover_stale_platform_ai_request_v2']) {
    assert.match(migrationSource, new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*?from public, anon, authenticated`, 'i'));
    assert.match(migrationSource, new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*?to service_role`, 'i'));
  }
  assert.doesNotMatch(migrationSource, /create or replace function public\.reserve_ai_quota/i);
});

test('Worker uses only V2 quota RPCs and no legacy quota or pre-query authority', () => {
  assert.match(workerSource, /reserve_platform_ai_quota_v2/);
  assert.match(workerSource, /mark_platform_ai_request_processing_v2/);
  assert.match(workerSource, /finalize_platform_ai_request_success_v2/);
  assert.match(workerSource, /refund_platform_ai_quota_v2/);
  assert.doesNotMatch(workerSource, /reserve_ai_quota/);
  assert.doesNotMatch(workerSource, /checkRateLimit/);
  assert.doesNotMatch(workerSource, /platform_paid_credits|platform_free_used|platform_free_total/);
});

test('DeepSeek request and sanitized Supabase diagnostics retain their security contract', () => {
  const requestBody = worker.buildDeepSeekRequest({ model: MODEL, requestId: 'request-12345678', resumeProfile: validPayload().resumeProfile, jobDraft: validPayload().jobDraft });
  assert.deepEqual(requestBody.thinking, { type: 'enabled' });
  assert.equal(requestBody.response_format.type, 'json_object');
  assert.equal('temperature' in requestBody, false);
  const headers = worker.buildSupabaseAdminHeaders({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test-only-placeholder' });
  assert.equal(headers.Authorization, undefined);
  const diagnostic = worker.buildSupabaseFailureDiagnostic('/rest/v1/rpc/reserve_platform_ai_quota_v2?private=x', 400, JSON.stringify({ message: 'private@example.com sb_secret_hidden sk-hidden' }));
  assert.doesNotMatch(JSON.stringify(diagnostic), /private@example\.com|sb_secret_hidden|sk-hidden/);
});

test('Schema 1.1 requires every complete application package field', () => {
  const report = validReport();
  assert.deepEqual(worker.validateAnalysisReport(report, { requestId: report.requestId, model: MODEL }), report);
  assert.equal(worker.schemaExample(report.requestId, MODEL).schemaVersion, '1.1');
  assert.match(worker.buildPrompt(report.requestId, MODEL, validPayload().resumeProfile, validPayload().jobDraft), /Do not rename, nest, alias, or omit/);

  const invalidReports = [
    value => { delete value.resumeRewrite; },
    value => { delete value.outreachScripts.emailBody; },
    value => { value.resumeRewrite.summary = '   '; },
    value => { value.outreachScripts.boss = ''; },
    value => { value.selfIntroduction = '\t'; },
    value => { value.reverseQuestions = []; },
    value => { value.reverseQuestions = ['   ']; }
  ];
  invalidReports.forEach(mutate => {
    const value = structuredClone(report);
    mutate(value);
    assert.throws(
      () => worker.validateAnalysisReport(value, { requestId: report.requestId, model: MODEL }),
      error => error.code === 'INVALID_MODEL_OUTPUT'
    );
  });

  const needsConfirmation = structuredClone(report);
  needsConfirmation.resumeRewrite.summary = '需本人确认：请确认该总结中的项目范围。';
  assert.equal(
    worker.validateAnalysisReport(needsConfirmation, { requestId: report.requestId, model: MODEL }).resumeRewrite.summary,
    needsConfirmation.resumeRewrite.summary
  );
});

test('server kill switch is closed by default and explicit false prevents every external request', async () => {
  for (const env of [
    Object.fromEntries(Object.entries(ENV).filter(([name]) => name !== 'PLATFORM_AI_ENABLED')),
    { ...ENV, PLATFORM_AI_ENABLED: 'false' },
    { ...ENV, PLATFORM_AI_ENABLED: 'TRUE' }
  ]) {
    let fetchCalls = 0;
    const response = await worker.handleRequest(makeRequest(validPayload('request-kill-switch-closed')), env, {
      fetchImpl: async () => { fetchCalls += 1; throw new Error('external fetch must not run while disabled'); }
    });
    const result = await body(response);
    assert.equal(response.status, 503);
    assert.equal(result.errorCode, 'PLATFORM_AI_DISABLED');
    assert.match(result.message, /平台 AI 当前未开放/);
    assert.equal(fetchCalls, 0);
  }
});

test('OPTIONS remains available while the server kill switch is closed', async () => {
  let fetchCalls = 0;
  const request = new Request('https://worker.example/api/platform-analyze', {
    method: 'OPTIONS',
    headers: { Origin: ENV.ALLOWED_ORIGIN }
  });
  const response = await worker.handleRequest(request, { ...ENV, PLATFORM_AI_ENABLED: 'false' }, {
    fetchImpl: async () => { fetchCalls += 1; throw new Error('OPTIONS must not fetch'); }
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ENV.ALLOWED_ORIGIN);
  assert.equal(fetchCalls, 0);
});

test('an enabled server kill switch proceeds to the existing Supabase authentication flow', async () => {
  let fetchCalls = 0;
  const response = await worker.handleRequest(makeRequest(validPayload('request-kill-switch-enabled'), 'invalid-token'), ENV, {
    fetchImpl: async (url) => {
      fetchCalls += 1;
      assert.equal(String(url), 'https://example.supabase.co/auth/v1/user');
      return new Response(JSON.stringify({ message: 'invalid token' }), { status: 401 });
    }
  });
  assert.equal(response.status, 401);
  assert.equal((await body(response)).errorCode, 'INVALID_TOKEN');
  assert.equal(fetchCalls, 1);
});

test('input validation still rejects unauthenticated, malformed and invalid platform requests', async () => {
  const backend = new MockBackend();
  assert.equal((await body(await worker.handleRequest(makeRequest(validPayload(), ''), ENV, { fetchImpl: backend.fetch }))).errorCode, 'AUTH_REQUIRED');
  assert.equal((await body(await worker.handleRequest(makeRequest(validPayload(), 'fake-token'), ENV, { fetchImpl: backend.fetch }))).errorCode, 'INVALID_TOKEN');
  const malformed = new Request('https://worker.example/api/platform-analyze', { method: 'POST', headers: { Origin: ENV.ALLOWED_ORIGIN, 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' }, body: '{' });
  assert.equal((await body(await worker.handleRequest(malformed, ENV, { fetchImpl: backend.fetch }))).errorCode, 'INVALID_JSON');
  const wrongMode = validPayload('request-wrong-mode'); wrongMode.analysisMode = 'mock';
  assert.equal((await body(await worker.handleRequest(makeRequest(wrongMode), ENV, { fetchImpl: backend.fetch }))).errorCode, 'INVALID_ANALYSIS_MODE');
});

test('a successful V2 platform request reserves then consumes its two original periods exactly once', async () => {
  const backend = new MockBackend();
  const response = await worker.handleRequest(makeRequest(validPayload()), ENV, { fetchImpl: backend.fetch });
  const result = await body(response);
  assert.equal(response.status, 200); assert.equal(result.quotaType, 'daily_monthly_v2');
  assert.deepEqual(result.quota, { daily: { limit: 5, successCount: 1, reservedCount: 0, remaining: 4 }, monthly: { limit: 30, successCount: 1, reservedCount: 0, remaining: 29 } });
  assert.equal(backend.providerCalls, 1);
  const replay = await worker.handleRequest(makeRequest(validPayload()), ENV, { fetchImpl: backend.fetch });
  assert.equal((await body(replay)).errorCode, 'REQUEST_ALREADY_COMPLETED');
  assert.equal(backend.providerCalls, 1);
});

test('lost reserve and finalize RPC responses recover through the committed V2 request only', async () => {
  const backend = new MockBackend({ rpcResponseLoss: ['reserve_platform_ai_quota_v2', 'finalize_platform_ai_request_success_v2'] });
  const result = await body(await worker.handleRequest(makeRequest(validPayload('request-rpc-response-loss')), ENV, { fetchImpl: backend.fetch }));
  assert.equal(result.success, true); assert.equal(result.quota.daily.successCount, 1);
  assert.equal(backend.requests.get('request-rpc-response-loss').status, 'success');
});

test('the sixth Asia/Shanghai daily success is rejected without a provider call', async () => {
  const backend = new MockBackend();
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await body(await worker.handleRequest(makeRequest(validPayload(`request-day-${index}`)), ENV, { fetchImpl: backend.fetch }))).success, true);
    backend.advance(61000);
  }
  const sixth = await body(await worker.handleRequest(makeRequest(validPayload('request-day-sixth')), ENV, { fetchImpl: backend.fetch }));
  assert.equal(sixth.errorCode, 'DAILY_QUOTA_EXHAUSTED'); assert.equal(backend.providerCalls, 5);
});

test('the thirty-first monthly success is rejected while daily headroom remains', async () => {
  const backend = new MockBackend();
  let id = 0;
  for (let day = 0; day < 6; day += 1) {
    for (let request = 0; request < 5; request += 1) {
      assert.equal((await body(await worker.handleRequest(makeRequest(validPayload(`request-month-${id++}`)), ENV, { fetchImpl: backend.fetch }))).success, true);
      backend.advance(61000);
    }
    backend.advance(24 * 60 * 60 * 1000 - 5 * 61000);
  }
  const thirtyFirst = await body(await worker.handleRequest(makeRequest(validPayload('request-month-31')), ENV, { fetchImpl: backend.fetch }));
  assert.equal(thirtyFirst.errorCode, 'MONTHLY_QUOTA_EXHAUSTED'); assert.equal(backend.providerCalls, 30);
});

test('the third accepted request in a rolling 60-second window is rejected, including concurrent requests', async () => {
  const backend = new MockBackend();
  const [a, b, c] = await Promise.all(['a', 'b', 'c'].map(suffix => worker.handleRequest(makeRequest(validPayload(`request-rate-${suffix}`)), ENV, { fetchImpl: backend.fetch })));
  const results = await Promise.all([body(a), body(b), body(c)]);
  assert.equal(results.filter(result => result.success).length, 2);
  assert.equal(results.filter(result => result.errorCode === 'RATE_LIMITED').length, 1);
  assert.equal(backend.providerCalls, 2);
});

for (const [mode, expected] of [['429', 'MODEL_PROVIDER_ERROR'], ['timeout', 'MODEL_TIMEOUT'], ['non-json', 'INVALID_MODEL_OUTPUT'], ['missing-field', 'INVALID_MODEL_OUTPUT']]) {
  test(`provider ${mode} refunds daily and monthly reservations but remains in the anti-abuse window`, async () => {
    const backend = new MockBackend({ providerMode: mode });
    const id = `request-failure-${mode}`;
    const result = await body(await worker.handleRequest(makeRequest(validPayload(id)), ENV, { fetchImpl: backend.fetch }));
    assert.equal(result.errorCode, expected);
    const record = backend.requests.get(id);
    assert.equal(record.status, 'refunded');
    assert.equal(backend.existingPeriod(USER_ID, 'day', record.dayStart).reserved, 0);
    assert.equal(backend.existingPeriod(USER_ID, 'month', record.monthStart).reserved, 0);
    assert.equal([...backend.requests.values()].filter(item => item.createdAt >= backend.nowMs - 60000).length, 1);
  });
}

test('finalize and refund use reservation-time periods across both a day and a month boundary', () => {
  const beforeBoundary = Date.parse('2026-07-31T15:59:00.000Z'); // 23:59 Asia/Shanghai.
  const input = { p_request_id: 'request-cross-finalize', p_user_id: USER_ID, p_model: MODEL, p_input_chars: 100 };
  const finalized = new MockBackend({ nowMs: beforeBoundary });
  assert.equal(finalized.rpc('reserve_platform_ai_quota_v2', input).outcome, 'reserved');
  assert.equal(finalized.rpc('mark_platform_ai_request_processing_v2', input).outcome, 'processing');
  finalized.advance(120000); // Now August in Shanghai.
  assert.equal(finalized.rpc('finalize_platform_ai_request_success_v2', input).outcome, 'success');
  assert.equal(finalized.existingPeriod(USER_ID, 'day', '2026-07-31').success, 1);
  assert.equal(finalized.existingPeriod(USER_ID, 'month', '2026-07-01').success, 1);

  const refunded = new MockBackend({ nowMs: beforeBoundary });
  const refundInput = { ...input, p_request_id: 'request-cross-refund' };
  refunded.rpc('reserve_platform_ai_quota_v2', refundInput);
  refunded.rpc('mark_platform_ai_request_processing_v2', refundInput);
  refunded.advance(120000);
  assert.equal(refunded.rpc('refund_platform_ai_quota_v2', { ...refundInput, p_error_code: 'MODEL_TIMEOUT' }).outcome, 'refunded');
  assert.equal(refunded.existingPeriod(USER_ID, 'day', '2026-07-31').reserved, 0);
  assert.equal(refunded.existingPeriod(USER_ID, 'month', '2026-07-01').reserved, 0);
});

test('same request id finalization and refund are idempotent without negative reservations', () => {
  const backend = new MockBackend();
  const input = { p_request_id: 'request-idempotent-v2', p_user_id: USER_ID, p_model: MODEL, p_input_chars: 100 };
  backend.rpc('reserve_platform_ai_quota_v2', input); backend.rpc('mark_platform_ai_request_processing_v2', input);
  assert.equal(backend.rpc('finalize_platform_ai_request_success_v2', input).outcome, 'success');
  assert.equal(backend.rpc('finalize_platform_ai_request_success_v2', input).outcome, 'already_success');
  assert.equal(backend.rpc('refund_platform_ai_quota_v2', { ...input, p_error_code: 'NEVER' }).outcome, 'already_success');
  const record = backend.requests.get(input.p_request_id);
  assert.equal(backend.existingPeriod(USER_ID, 'day', record.dayStart).reserved, 0);
  assert.equal(backend.existingPeriod(USER_ID, 'day', record.dayStart).success, 1);
});

test('automatic stale recovery occurs on the same user next reserve after a five-minute TTL', () => {
  const backend = new MockBackend();
  const stale = { p_request_id: 'request-stale-v2', p_user_id: USER_ID, p_model: MODEL, p_input_chars: 100 };
  backend.rpc('reserve_platform_ai_quota_v2', stale); backend.rpc('mark_platform_ai_request_processing_v2', stale);
  const staleRecord = backend.requests.get(stale.p_request_id);
  backend.advance(300001);
  assert.equal(backend.rpc('reserve_platform_ai_quota_v2', { ...stale, p_request_id: 'request-after-stale-v2' }).outcome, 'reserved');
  assert.equal(staleRecord.status, 'refunded');
  // The original reservation was released; the one remaining reservation is the new request.
  assert.equal(backend.existingPeriod(USER_ID, 'day', staleRecord.dayStart).reserved, 1);
});

test('cross-user request id conflict is generic and does not expose the original request state', async () => {
  const backend = new MockBackend();
  const payload = validPayload('request-cross-user-v2');
  assert.equal((await body(await worker.handleRequest(makeRequest(payload), ENV, { fetchImpl: backend.fetch }))).success, true);
  const conflict = await body(await worker.handleRequest(makeRequest(payload, 'other-token'), ENV, { fetchImpl: backend.fetch }));
  assert.equal(conflict.errorCode, 'REQUEST_ID_CONFLICT');
  assert.equal('quota' in conflict, false); assert.equal(backend.providerCalls, 1);
});

test('legacy paid credits remain nonzero and unused by V2', async () => {
  const backend = new MockBackend({ paidCredits: 99 });
  const result = await body(await worker.handleRequest(makeRequest(validPayload('request-legacy-paid-ignored')), ENV, { fetchImpl: backend.fetch }));
  assert.equal(result.success, true); assert.equal(result.quotaType, 'daily_monthly_v2');
  assert.equal(backend.paidCredits, 99);
});

test('the verified Supabase user remains authoritative over a forged payload user id', async () => {
  const backend = new MockBackend();
  const payload = validPayload('request-forged-user-v2'); payload.userId = OTHER_USER_ID;
  assert.equal((await body(await worker.handleRequest(makeRequest(payload), ENV, { fetchImpl: backend.fetch }))).success, true);
  assert.equal(backend.requests.get(payload.requestId).userId, USER_ID);
});
