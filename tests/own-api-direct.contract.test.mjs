import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
const worker = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
const ownStart = html.indexOf('/* OWN_API_DIRECT_START */');
const ownEnd = html.indexOf('/* OWN_API_DIRECT_END */');
if (ownStart < 0 || ownEnd < 0 || ownEnd <= ownStart) throw new Error('无法定位自带 Key 直连模块');
const ownModuleSource = html.slice(ownStart, ownEnd);
const trustedStart = html.indexOf('function normalizeTrustedPlatformResult(');
const trustedEnd = html.indexOf('function buildOptimizationSuggestionsFromReport(', trustedStart);
if (trustedStart < 0 || trustedEnd < 0) throw new Error('无法定位可信结果规范化模块');
const trustedNormalizerSource = html.slice(trustedStart, trustedEnd);

const sanitizeStart = html.indexOf('function sanitizeReportForRecord(');
const snapshotStart = html.indexOf('function buildJdSnapshot(');
const snapshotEnd = html.indexOf('function saveCurrentJobRecord(', snapshotStart);
const saveHistoryStart = html.indexOf('function saveHistory(');
const saveHistoryEnd = html.indexOf('function getHistory(', saveHistoryStart);
if ([sanitizeStart, snapshotStart, snapshotEnd, saveHistoryStart, saveHistoryEnd].some(value => value < 0)) {
  throw new Error('无法定位历史保存模块');
}
const sanitizeSource = html.slice(sanitizeStart, snapshotStart);
const snapshotSource = html.slice(snapshotStart, snapshotEnd);
const saveHistorySource = html.slice(saveHistoryStart, saveHistoryEnd);

function createHarness(fetchImpl) {
  const api = new Function('deps', `
    const { fetchImpl } = deps;
    const fetch = fetchImpl;
    const TRUSTED_REPORT_SCHEMA_VERSION = '1.1';
    const OWN_API_CONFIG = Object.freeze({
      SCHEMA_VERSION: TRUSTED_REPORT_SCHEMA_VERSION,
      ENDPOINT: 'https://api.deepseek.com/chat/completions',
      MODEL: 'deepseek-v4-flash',
      MAX_TOKENS: 6144,
      TIMEOUT_MS: 45000
    });
    const window = {
      crypto: { randomUUID: () => 'own-request-id' },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    };
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const arr = value => Array.isArray(value) ? value : (value === undefined || value === null || value === '' ? [] : [value]);
    const getMatchLevel = score => score >= 80 ? '高匹配' : score >= 65 ? '中等匹配' : score >= 50 ? '低匹配' : '不匹配';
    const getApplyRecommendation = score => score >= 80 ? '值得重点投' : score >= 65 ? '可以投但不建议重点' : '不建议投';
    const buildOptimizationSuggestionsFromReport = () => [];
    const flattenInterviewPrep = prep => Object.values(prep || {}).flatMap(arr);
    ${ownModuleSource}
    ${trustedNormalizerSource}
    return {
      buildOwnApiDirectRequest,
      buildOwnApiReportSchemaExample,
      callOwnApiDirect,
      normalizeOwnApiResult,
      normalizeTrustedPlatformResult,
      normalizeResult,
      assertCompleteApplicationPackage,
      parseOwnApiModelJson,
      validateOwnApiDirectReport,
      ownApiErrorMessage,
      isUsableOwnApiKey
    };
  `)({ fetchImpl });
  return api;
}

function createHistoryHarness(profile, draft, confirmedJd) {
  const records = [];
  const api = new Function('deps', `
    const { records, profile, draft, confirmedJd } = deps;
    const STORAGE = { history: 'history' };
    const localDataStore = {
      writeJson(_key, value) { records.splice(0, records.length, ...structuredClone(value)); }
    };
    const getHistory = () => records;
    const getResumeProfile = () => profile;
    const getJobDraft = () => draft;
    const getConfirmedJobText = () => confirmedJd;
    const buildResumePreview = value => String(value || '').slice(0, 120);
    const cleanLine = value => String(value || '').replace(/\s+/g, ' ').trim();
    ${sanitizeSource}
    ${snapshotSource}
    ${saveHistorySource}
    return { saveHistory };
  `)({ records, profile, draft, confirmedJd });
  return { ...api, records };
}

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

test('自带 Key 固定直连 DeepSeek，请求体不含 Key、Worker 或 Supabase 端点', async () => {
  const calls = [];
  const harness = createHarness(async (url, options) => {
    calls.push({ url, options });
    return response(200, { choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] });
  });
  const secret = 'sk-test-secret-never-persisted';
  const requestBody = harness.buildOwnApiDirectRequest('own-request-id', {
    targetRole: '产品助理', resumeText: '测试简历文本', skillKeywords: []
  }, { jdText: '测试岗位 JD 文本', jobTitle: '产品助理' });

  assert.equal(requestBody.model, 'deepseek-v4-flash');
  assert.deepEqual(requestBody.thinking, { type: 'disabled' });
  assert.equal(requestBody.stream, false);
  assert.deepEqual(requestBody.response_format, { type: 'json_object' });
  assert.equal(requestBody.max_tokens, 6144);
  assert.doesNotMatch(JSON.stringify(requestBody), new RegExp(secret));

  await harness.callOwnApiDirect(secret, requestBody);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${secret}`);
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.doesNotMatch(calls[0].url, /worker|supabase|rpc/i);
});

test('自带 Key 与 Worker 使用同一份 Schema 1.1 严格结构', () => {
  const harness = createHarness(async () => response(500, {}));
  const report = harness.buildOwnApiReportSchemaExample('own-request-id', 'deepseek-v4-flash');
  assert.deepEqual(report, worker.schemaExample('own-request-id', 'deepseek-v4-flash'));
  const parsed = harness.parseOwnApiModelJson(`\`\`\`json\n${JSON.stringify(report)}\n\`\`\``);
  assert.deepEqual(
    harness.validateOwnApiDirectReport(parsed, { requestId: 'own-request-id', model: 'deepseek-v4-flash' }),
    report
  );
  assert.throws(
    () => harness.validateOwnApiDirectReport({ ...report, requestId: 'other-request' }, { requestId: 'own-request-id', model: 'deepseek-v4-flash' }),
      error => error.code === 'INVALID_MODEL_OUTPUT'
  );
  assert.throws(
    () => harness.validateOwnApiDirectReport({ report }, { requestId: 'own-request-id', model: 'deepseek-v4-flash' }),
    error => error.code === 'INVALID_MODEL_OUTPUT'
  );
});

test('Schema 1.1 规范化后所有 UI 成品字段完整且不依赖 section 名称', () => {
  const harness = createHarness(async () => response(500, {}));
  const report = harness.buildOwnApiReportSchemaExample('own-request-id', 'deepseek-v4-flash');
  report.resumeSuggestions[0].section = '任意合法模块名称';
  report.resumeSuggestions[0].evidenceStatus = 'needs_user_confirmation';
  report.resumeRewrite.summary = '需本人确认：请确认总结中的项目范围。';

  const ownResult = harness.normalizeOwnApiResult(report, 'own-request-id', { jobTitle: '合成岗位' });
  const platformResult = harness.normalizeTrustedPlatformResult(report, { model: 'deepseek-v4-flash' }, { jobTitle: '合成岗位' });
  const mockResult = structuredClone(ownResult);
  mockResult.meta = { mock: true };

  [ownResult, platformResult, mockResult].forEach(result => {
    assert.equal(harness.assertCompleteApplicationPackage(result), result);
    Object.values(result.resumeRewrite).forEach(value => assert.ok(value.trim()));
    Object.values(result.outreachScripts).forEach(value => assert.ok(value.trim()));
    assert.ok(result.selfIntroduction.trim());
    assert.ok(result.reverseQuestions.length > 0);
  });
  assert.equal(ownResult.resumeRewrite.summary, report.resumeRewrite.summary);
  assert.equal(ownResult.outreachScripts.boss, report.outreachScripts.boss);
  assert.doesNotMatch(trustedNormalizerSource, /directlySupported|\.find\(item\s*=>\s*\/总结|outreachScripts:\s*\{\s*boss:\s*''/);
  assert.match(html, /function createMockResult[\s\S]*?assertCompleteApplicationPackage/);
});

test('关键成品字段缺失、空白或空数组必须拒绝，需本人确认内容允许展示', () => {
  const harness = createHarness(async () => response(500, {}));
  const base = harness.buildOwnApiReportSchemaExample('own-request-id', 'deepseek-v4-flash');
  const invalidMutations = [
    value => { delete value.resumeRewrite; },
    value => { delete value.outreachScripts.emailBody; },
    value => { value.resumeRewrite.projectExample = '   '; },
    value => { value.outreachScripts.wechat = ''; },
    value => { value.selfIntroduction = '\n'; },
    value => { value.reverseQuestions = []; },
    value => { value.reverseQuestions = ['   ']; }
  ];
  invalidMutations.forEach(mutate => {
    const report = structuredClone(base);
    mutate(report);
    assert.throws(
      () => harness.validateOwnApiDirectReport(report, { requestId: 'own-request-id', model: 'deepseek-v4-flash' }),
      error => error.code === 'INVALID_MODEL_OUTPUT'
    );
  });

  const allowed = structuredClone(base);
  allowed.resumeRewrite.skillsExample = '需本人确认：请确认该技能确实用于项目。';
  assert.equal(
    harness.normalizeOwnApiResult(allowed, 'own-request-id', {}).resumeRewrite.skillsExample,
    allowed.resumeRewrite.skillsExample
  );
});

test('完整结果保存并重新加载后不丢字段，历史不保存 Key、Token 或完整输入', () => {
  const harness = createHarness(async () => response(500, {}));
  const report = harness.buildOwnApiReportSchemaExample('own-request-id', 'deepseek-v4-flash');
  const result = harness.normalizeOwnApiResult(report, 'own-request-id', { jobTitle: '合成岗位' });
  result.meta.accessToken = 'result-access-token';
  const fullResume = 'FULL_RESUME_INPUT_SHOULD_NOT_BE_STORED';
  const fullJd = 'FULL_JD_INPUT_SHOULD_NOT_BE_STORED';
  const history = createHistoryHarness(
    { experienceSummary: '', projectSummary: '', resumeText: fullResume },
    { jdText: fullJd, userApiKey: 'sk-test-history-secret', accessToken: 'test-access-token', jdConfirmed: true, jobTitle: '合成岗位', screenshotFiles: [] },
    fullJd
  );
  history.saveHistory(result);
  assert.equal(history.records.length, 1);
  const serialized = JSON.stringify(history.records[0]);
  assert.equal(serialized.includes(fullResume), false);
  assert.equal(serialized.includes(fullJd), false);
  assert.doesNotMatch(serialized, /sk-test-history-secret|test-access-token|result-access-token|"jdText"|"resumeText"|"accessToken"/);
  const reloaded = harness.normalizeResult(history.records[0].result);
  assert.equal(harness.assertCompleteApplicationPackage(reloaded), reloaded);
  assert.deepEqual(reloaded.resumeRewrite, result.resumeRewrite);
  assert.deepEqual(reloaded.outreachScripts, result.outreachScripts);
});

test('401、截断输出和非 JSON 响应都明确失败，不产生成功结果', async () => {
  const unauthorized = createHarness(async () => response(401, { error: { message: 'ignored' } }));
  await assert.rejects(
    () => unauthorized.callOwnApiDirect('sk-test-secret-never-persisted', {}),
    error => error.code === 'INVALID_API_KEY'
  );
  assert.match(unauthorized.ownApiErrorMessage({ code: 'INVALID_API_KEY' }), /401/);

  const truncated = createHarness(async () => response(200, { choices: [{ finish_reason: 'length', message: { content: '{' } }] }));
  await assert.rejects(
    () => truncated.callOwnApiDirect('sk-test-secret-never-persisted', {}),
    error => error.code === 'INVALID_MODEL_OUTPUT'
  );
  assert.throws(() => truncated.parseOwnApiModelJson('not json'), error => error.code === 'INVALID_MODEL_OUTPUT');
});

test('未登录不能保存 Key，分析分支不会把自带 Key 失败回退为 Mock', () => {
  assert.match(html, /function saveApiKey\(\)\s*\{\s*if \(!currentAuthSession\)/);
  assert.match(html, /if \(mode === 'own_api'\)\s*\{[\s\S]*?await runOwnApiAnalyze[\s\S]*?return;\s*\}\s*if \(mode === 'platform_api'\)/);
  assert.match(html, /if \(requestedMode !== 'own_api'\)\s*\{\s*trackEvent\('run_match_analysis'/);
  assert.doesNotMatch(ownModuleSource, /workers\.dev|supabase\.co|\/rpc/i);
  assert.equal(createHarness(async () => response(500, {})).isUsableOwnApiKey('sk-test-secret-never-persisted'), true);
  assert.equal(createHarness(async () => response(500, {})).isUsableOwnApiKey('bad\nkey'), false);
});
