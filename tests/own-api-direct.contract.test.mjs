import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
const worker = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
const limitsStart = html.indexOf('const AI_OUTPUT_LIMITS =');
const limitsEnd = html.indexOf('const OWN_API_CONFIG =', limitsStart);
if (limitsStart < 0 || limitsEnd < 0) throw new Error('无法定位输出边界契约');
const limitsSource = html.slice(limitsStart, limitsEnd);
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
    const effects = [];
    let ownApiRequestInFlight = false;
    let currentAuthSession = { user: { id: 'synthetic-user' } };
    let currentResult = null;
    let currentRecordId = null;
    const getUserApiKey = () => 'sk-test-secret-never-persisted';
    const setStatus = (message, type = '') => effects.push({ type: 'status', message, statusType: type });
    const setStep = step => effects.push({ type: 'step', step });
    const finishSteps = () => effects.push({ type: 'finish' });
    const renderResult = () => effects.push({ type: 'renderResult' });
    const renderHistory = () => effects.push({ type: 'renderHistory' });
    const saveHistory = () => { effects.push({ type: 'saveHistory' }); return 'history-id'; };
    const TRUSTED_REPORT_SCHEMA_VERSION = '1.2';
    ${limitsSource}
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
      buildOwnApiPrompt,
      callOwnApiDirect,
      injectOwnApiTrustedMetadata,
      normalizeOwnApiResult,
      normalizeTrustedPlatformResult,
      normalizeResult,
      assertCompleteApplicationPackage,
      parseOwnApiModelJson,
      projectOwnApiAllowedContent,
      validateOwnApiDirectReport,
      ownApiErrorMessage,
      isUsableOwnApiKey,
      AI_OUTPUT_LIMITS,
      runOwnApiAnalyze,
      effects
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
  assert.equal('temperature' in requestBody, false);
  assert.doesNotMatch(JSON.stringify(requestBody), new RegExp(secret));

  await harness.callOwnApiDirect(secret, requestBody);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${secret}`);
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.doesNotMatch(calls[0].url, /worker|supabase|rpc/i);
});

test('自带 Key 与 Worker 使用同一份 Schema 1.2 内容结构和边界', () => {
  const harness = createHarness(async () => response(500, {}));
  const content = harness.buildOwnApiReportSchemaExample();
  assert.deepEqual(content, worker.schemaExample());
  assert.deepEqual(Object.keys(content), [
    'jobSummary', 'recommendation', 'scores', 'matches', 'risks', 'keywords',
    'resumeSuggestions', 'interviewPrep', 'resumeRewrite', 'outreachScripts',
    'selfIntroduction', 'reverseQuestions', 'trust'
  ]);
  assert.deepEqual(harness.AI_OUTPUT_LIMITS, worker.AI_OUTPUT_LIMITS);
  assert.deepEqual(Object.keys(harness.AI_OUTPUT_LIMITS.arrays).sort(), [
    'coreResponsibilities', 'existingKeywords', 'hardRequirements', 'interviewItems',
    'jdKeywords', 'matches', 'missingKeywords', 'recommendationReasons',
    'resumeSuggestions', 'reverseQuestions', 'risks', 'scoreRationale', 'trustItems'
  ].sort());
  Object.values(harness.AI_OUTPUT_LIMITS.arrays).forEach(limit => {
    assert.ok(Number.isInteger(limit.min) && limit.min >= 1);
    assert.ok(Number.isInteger(limit.max) && limit.max >= limit.min);
  });
  Object.values(harness.AI_OUTPUT_LIMITS.text).forEach(max => assert.ok(Number.isInteger(max) && max > 0));
  assert.equal('schemaVersion' in content, false);
  assert.equal('requestId' in content, false);
  assert.equal('model' in content, false);
  assert.equal('generatedAt' in content, false);
  const prompt = harness.buildOwnApiPrompt({}, {});
  assert.doesNotMatch(prompt, /Set requestId|Set model|"schemaVersion"|"requestId"|"model"|"generatedAt"/);
  assert.match(prompt, /Array bounds:[\s\S]*reverse questions 1-4/);
  assert.match(prompt, /Text bounds in characters:[\s\S]*email subject\/email body\/attachment 360\/360\/100\/800\/240/);
  const parsed = harness.parseOwnApiModelJson(`\`\`\`json\n${JSON.stringify(content)}\n\`\`\``);
  assert.deepEqual(harness.validateOwnApiDirectReport(parsed), content);

  const applicationTime = '2026-07-20T12:34:56.789Z';
  const injected = harness.injectOwnApiTrustedMetadata(content, 'own-request-id', 'deepseek-v4-flash', applicationTime);
  assert.equal(injected.schemaVersion, '1.2');
  assert.equal(injected.requestId, 'own-request-id');
  assert.equal(injected.model, 'deepseek-v4-flash');
  assert.equal(injected.generatedAt, applicationTime);
  assert.equal(new Date(injected.generatedAt).toISOString(), injected.generatedAt);
});

test('Schema 1.2 规范化后所有 UI 成品字段完整且不依赖 section 名称', () => {
  const harness = createHarness(async () => response(500, {}));
  const report = harness.buildOwnApiReportSchemaExample();
  report.resumeSuggestions[0].section = '任意合法模块名称';
  report.resumeSuggestions[0].evidenceStatus = 'needs_user_confirmation';
  report.resumeRewrite.summary = '需本人确认：请确认总结中的项目范围。';

  const ownResult = harness.normalizeOwnApiResult(report, 'own-request-id', { jobTitle: '合成岗位' });
  const trusted = harness.injectOwnApiTrustedMetadata(report, 'own-request-id', 'deepseek-v4-flash');
  const platformResult = harness.normalizeTrustedPlatformResult(trusted, { model: 'deepseek-v4-flash' }, { jobTitle: '合成岗位' });
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
  const base = harness.buildOwnApiReportSchemaExample();
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
      () => harness.validateOwnApiDirectReport(report),
      error => ['MISSING_FIELD', 'EMPTY_STRING', 'EMPTY_REVERSE_QUESTIONS'].includes(error.code)
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
  const report = harness.buildOwnApiReportSchemaExample();
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
  assert.equal(history.records[0].result.trustDetails.generatedAt, result.trustDetails.generatedAt);
  assert.equal(new Date(result.trustDetails.generatedAt).toISOString(), result.trustDetails.generatedAt);
});

test('401、截断输出和非 JSON 响应都以脱敏错误明确失败', async () => {
  const unauthorized = createHarness(async () => response(401, { error: { message: 'ignored' } }));
  await assert.rejects(
    () => unauthorized.callOwnApiDirect('sk-test-secret-never-persisted', {}),
    error => error.code === 'INVALID_API_KEY'
  );
  assert.match(unauthorized.ownApiErrorMessage({ code: 'INVALID_API_KEY' }), /401/);

  const truncated = createHarness(async () => response(200, { choices: [{ finish_reason: 'length', message: { content: '{' } }] }));
  await assert.rejects(
    () => truncated.callOwnApiDirect('sk-test-secret-never-persisted', {}),
    error => error.code === 'OUTPUT_TRUNCATED' && error.finishReason === 'length'
  );
  assert.throws(() => truncated.parseOwnApiModelJson('not json'), error => error.code === 'MODEL_JSON_PARSE_FAILED');
  assert.throws(() => truncated.parseOwnApiModelJson('{"scores":'), error => error.code === 'MODEL_JSON_PARSE_FAILED');
});

test('未知字段被投影丢弃，别名与错误嵌套仍因缺少允许字段失败', () => {
  const harness = createHarness(async () => response(500, {}));
  const content = harness.buildOwnApiReportSchemaExample();
  content.unexpectedRoot = 'PRIVATE_UNKNOWN_VALUE';
  content.outreachScripts.extraMessage = 'PRIVATE_NESTED_VALUE';
  const diagnostics = [];
  const validated = harness.validateOwnApiDirectReport(content, { diagnostics });
  assert.equal('unexpectedRoot' in validated, false);
  assert.equal('extraMessage' in validated.outreachScripts, false);
  assert.deepEqual(diagnostics.map(item => item.code), ['UNEXPECTED_FIELD_DROPPED', 'UNEXPECTED_FIELD_DROPPED']);
  assert.deepEqual(diagnostics.map(item => item.fieldPath), ['outreachScripts', 'report']);
  assert.doesNotMatch(JSON.stringify(diagnostics), /PRIVATE_UNKNOWN_VALUE|PRIVATE_NESTED_VALUE|unexpectedRoot|extraMessage/);

  const aliased = structuredClone(validated);
  aliased.outreachScripts.email = aliased.outreachScripts.emailBody;
  delete aliased.outreachScripts.emailBody;
  assert.throws(
    () => harness.validateOwnApiDirectReport(aliased),
    error => error.code === 'MISSING_FIELD' && error.fieldPath === 'outreachScripts.emailBody'
  );
  const nested = structuredClone(validated);
  nested.resumeRewrite = { content: nested.resumeRewrite };
  assert.throws(
    () => harness.validateOwnApiDirectReport(nested),
    error => error.code === 'MISSING_FIELD' && error.fieldPath === 'resumeRewrite.summary'
  );
});

test('模型伪造 generatedAt 被丢弃，最终只使用应用 UTC 时间', () => {
  const harness = createHarness(async () => response(500, {}));
  const content = harness.buildOwnApiReportSchemaExample();
  const forgedTime = '1900-01-01T00:00:00.000Z';
  const applicationTime = '2026-07-20T13:00:00.000Z';
  content.generatedAt = forgedTime;
  const diagnostics = [];
  const validated = harness.validateOwnApiDirectReport(content, { diagnostics });
  assert.equal('generatedAt' in validated, false);
  assert.deepEqual(diagnostics, [{ code: 'UNEXPECTED_FIELD_DROPPED', fieldPath: 'report' }]);
  assert.equal(JSON.stringify(diagnostics).includes(forgedTime), false);

  const report = harness.injectOwnApiTrustedMetadata(validated, 'own-request-id', 'deepseek-v4-flash', applicationTime);
  assert.equal(report.generatedAt, applicationTime);
  assert.notEqual(report.generatedAt, forgedTime);
  assert.equal(new Date(report.generatedAt).toISOString(), report.generatedAt);
});

test('null 可空字段通过，空字符串、错误类型和输出上限明确失败', () => {
  const harness = createHarness(async () => response(500, {}));
  const base = harness.buildOwnApiReportSchemaExample();
  assert.equal(harness.validateOwnApiDirectReport(base).jobSummary.salary, null);

  const empty = structuredClone(base);
  empty.jobSummary.salary = '';
  assert.throws(() => harness.validateOwnApiDirectReport(empty), error => error.code === 'EMPTY_STRING' && error.fieldPath === 'jobSummary.salary');

  const wrongType = structuredClone(base);
  wrongType.reverseQuestions = '问题';
  assert.throws(() => harness.validateOwnApiDirectReport(wrongType), error => error.code === 'TYPE_MISMATCH' && error.fieldPath === 'reverseQuestions');

  const longText = structuredClone(base);
  longText.outreachScripts.emailSubject = '字'.repeat(harness.AI_OUTPUT_LIMITS.text.emailSubject + 1);
  assert.throws(() => harness.validateOwnApiDirectReport(longText), error => error.code === 'OUTPUT_LIMIT_EXCEEDED' && error.fieldPath === 'outreachScripts.emailSubject');

  const longArray = structuredClone(base);
  longArray.reverseQuestions = Array.from({ length: harness.AI_OUTPUT_LIMITS.arrays.reverseQuestions.max + 1 }, () => '有效问题？');
  assert.throws(() => harness.validateOwnApiDirectReport(longArray), error => error.code === 'OUTPUT_LIMIT_EXCEEDED' && error.fieldPath === 'reverseQuestions');
});

test('错误对象与用户提示只包含错误码和允许字段路径，不包含正文、输入或凭证', () => {
  const harness = createHarness(async () => response(500, {}));
  const privateSentinels = ['PRIVATE_MODEL_BODY', 'PRIVATE_RESUME_INPUT', 'PRIVATE_JOB_INPUT', 'sk-private-key', 'Bearer private-token'];
  const content = harness.buildOwnApiReportSchemaExample();
  delete content.outreachScripts.emailBody;
  let caught;
  try { harness.validateOwnApiDirectReport(content); } catch (error) { caught = error; }
  const serialized = JSON.stringify({ code: caught.code, fieldPath: caught.fieldPath, finishReason: caught.finishReason, message: harness.ownApiErrorMessage(caught) });
  assert.equal(caught.code, 'MISSING_FIELD');
  assert.equal(caught.fieldPath, 'outreachScripts.emailBody');
  privateSentinels.forEach(value => assert.equal(serialized.includes(value), false));
});

test('直连失败不会自动重试，单次 fetch 后即返回错误', async () => {
  let calls = 0;
  const harness = createHarness(async () => {
    calls += 1;
    return response(200, { choices: [{ finish_reason: 'length', message: { content: '{' } }] });
  });
  await assert.rejects(() => harness.callOwnApiDirect('sk-test-secret-never-persisted', {}), error => error.code === 'OUTPUT_TRUNCATED');
  assert.equal(calls, 1);
  assert.doesNotMatch(ownModuleSource, /retry|secondAttempt|for\s*\([^)]*callOwnApiDirect/i);
});

test('结构失败不保存、不渲染成功，完整 Schema 1.2 才保存一次', async () => {
  let failedCalls = 0;
  const failed = createHarness(async () => {
    failedCalls += 1;
    return response(200, { choices: [{ finish_reason: 'stop', message: { content: '{"scores":' } }] });
  });
  await assert.rejects(
    () => failed.runOwnApiAnalyze({ resumeText: '固定虚构简历' }, { jdText: '固定虚构 JD' }),
    error => error.code === 'MODEL_JSON_PARSE_FAILED'
  );
  assert.equal(failedCalls, 1);
  assert.equal(failed.effects.some(item => ['saveHistory', 'renderResult', 'finish'].includes(item.type)), false);

  let successCalls = 0;
  let successHarness;
  successHarness = createHarness(async () => {
    successCalls += 1;
    const content = successHarness.buildOwnApiReportSchemaExample();
    return response(200, { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] });
  });
  await successHarness.runOwnApiAnalyze({ resumeText: '固定虚构简历' }, { jdText: '固定虚构 JD', jobTitle: '虚构岗位' });
  assert.equal(successCalls, 1);
  assert.equal(successHarness.effects.filter(item => item.type === 'saveHistory').length, 1);
  assert.equal(successHarness.effects.filter(item => item.type === 'renderResult').length, 1);
  assert.equal(successHarness.effects.filter(item => item.type === 'finish').length, 1);
});

test('未登录不能保存 Key，分析分支不会把自带 Key 失败回退为 Mock', () => {
  assert.match(html, /function saveApiKey\(\)\s*\{\s*if \(!currentAuthSession\)/);
  assert.match(html, /if \(mode === 'own_api'\)\s*\{[\s\S]*?await runOwnApiAnalyze[\s\S]*?return;\s*\}\s*if \(mode === 'platform_api'\)/);
  assert.match(html, /if \(requestedMode !== 'own_api'\)\s*\{\s*trackEvent\('run_match_analysis'/);
  assert.doesNotMatch(ownModuleSource, /workers\.dev|supabase\.co|\/rpc/i);
  assert.equal(createHarness(async () => response(500, {})).isUsableOwnApiKey('sk-test-secret-never-persisted'), true);
  assert.equal(createHarness(async () => response(500, {})).isUsableOwnApiKey('bad\nkey'), false);
});
