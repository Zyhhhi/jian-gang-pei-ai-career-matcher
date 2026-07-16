import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ownStart = html.indexOf('/* OWN_API_DIRECT_START */');
const ownEnd = html.indexOf('/* OWN_API_DIRECT_END */');
if (ownStart < 0 || ownEnd < 0 || ownEnd <= ownStart) throw new Error('无法定位自带 Key 直连模块');
const ownModuleSource = html.slice(ownStart, ownEnd);

function createHarness(fetchImpl) {
  const api = new Function('deps', `
    const { fetchImpl } = deps;
    const fetch = fetchImpl;
    const OWN_API_CONFIG = Object.freeze({
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
    ${ownModuleSource}
    return {
      buildOwnApiDirectRequest,
      buildOwnApiReportSchemaExample,
      callOwnApiDirect,
      parseOwnApiModelJson,
      validateOwnApiDirectReport,
      ownApiErrorMessage,
      isUsableOwnApiKey
    };
  `)({ fetchImpl });
  return api;
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

test('DeepSeek 成功内容必须是完整 JSON 并通过本地报告结构校验', () => {
  const harness = createHarness(async () => response(500, {}));
  const report = harness.buildOwnApiReportSchemaExample('own-request-id', 'deepseek-v4-flash');
  const parsed = harness.parseOwnApiModelJson(JSON.stringify(report));
  assert.deepEqual(
    harness.validateOwnApiDirectReport(parsed, { requestId: 'own-request-id', model: 'deepseek-v4-flash' }),
    report
  );
  assert.throws(
    () => harness.validateOwnApiDirectReport({ ...report, requestId: 'other-request' }, { requestId: 'own-request-id', model: 'deepseek-v4-flash' }),
    error => error.code === 'INVALID_MODEL_OUTPUT'
  );
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
