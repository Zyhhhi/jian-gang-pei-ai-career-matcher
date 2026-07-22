import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
const worker = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);

const limitsStart = html.indexOf('const AI_OUTPUT_LIMITS =');
const limitsEnd = html.indexOf('const OWN_API_CONFIG =', limitsStart);
const ownSchemaStart = html.indexOf('function buildOwnApiReportSchemaExample()');
const ownRequestStart = html.indexOf('function buildOwnApiDirectRequest(', ownSchemaStart);
if ([limitsStart, limitsEnd, ownSchemaStart, ownRequestStart].some(value => value < 0)) {
  throw new Error('无法定位自带 Key 的脱敏配置快照模块');
}

const limitsSource = html.slice(limitsStart, limitsEnd);
const ownPromptSource = html.slice(ownSchemaStart, ownRequestStart);
const ownApi = new Function(`
  const TRUSTED_REPORT_SCHEMA_VERSION = '1.2';
  ${limitsSource}
  const OWN_API_CONFIG = Object.freeze({ SCHEMA_VERSION: TRUSTED_REPORT_SCHEMA_VERSION, MODEL: 'deepseek-v4-flash', MAX_TOKENS: 6144 });
  ${ownPromptSource}
  return { buildOwnApiReportSchemaExample, buildOwnApiSystemPrompt, buildOwnApiPrompt };
`)();

const SAMPLE = Object.freeze({
  profile: Object.freeze({
    targetRole: '虚构岗位', educationSummary: '虚构学历', skillKeywords: ['虚构技能'],
    projectSummary: '虚构项目', experienceSummary: '虚构经历', portfolioLinks: [], resumeText: '虚构简历内容。'
  }),
  draft: Object.freeze({
    jdText: '虚构岗位职责与要求。', companyName: '虚构公司', jobTitle: '虚构岗位', city: '虚构城市',
    salaryRange: '', educationRequirement: '', experienceRequirement: '', travelRequirement: '', workSchedule: '', extraNotes: ''
  })
});

const WORKER_PROMPT_CHAR_LIMIT = 3500;

function shape(value) {
  if (Array.isArray(value)) return [shape(value[0])];
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, shape(value[key])]));
  }
  return typeof value;
}

test('自带 Key 与平台 Worker 的脱敏请求快照明确区分模型和推理配置', () => {
  const workerRequest = worker.buildDeepSeekRequest({
    model: 'deepseek-v4-pro', requestId: 'synthetic-request', resumeProfile: SAMPLE.profile, jobDraft: SAMPLE.draft
  });
  const ownSnapshot = {
    model: 'deepseek-v4-flash', thinking: { type: 'disabled' }, reasoningEffort: null,
    maxTokens: 6144, responseFormat: 'json_object', promptChars: ownApi.buildOwnApiPrompt(SAMPLE.profile, SAMPLE.draft).length
  };
  const workerSnapshot = {
    model: workerRequest.model, thinking: workerRequest.thinking, reasoningEffort: workerRequest.reasoning_effort ?? null,
    maxTokens: workerRequest.max_tokens, responseFormat: workerRequest.response_format?.type ?? null,
    promptChars: worker.buildPrompt(SAMPLE.profile, SAMPLE.draft).length
  };

  assert.deepEqual(ownSnapshot.thinking, { type: 'disabled' });
  assert.deepEqual(workerSnapshot.thinking, { type: 'disabled' });
  assert.equal(ownSnapshot.reasoningEffort, null);
  assert.equal(workerSnapshot.reasoningEffort, null);
  assert.equal(ownSnapshot.responseFormat, 'json_object');
  assert.equal(workerSnapshot.responseFormat, 'json_object');
  assert.equal(ownSnapshot.maxTokens, 6144);
  assert.equal(workerSnapshot.maxTokens, 8192);
  assert.notEqual(ownSnapshot.model, workerSnapshot.model);
  assert.ok(workerSnapshot.promptChars <= WORKER_PROMPT_CHAR_LIMIT);
});

test('平台精简 Prompt 仍完整覆盖 Schema 1.2 业务形状且不携带控制元数据', () => {
  const workerPrompt = worker.buildPrompt(SAMPLE.profile, SAMPLE.draft);
  assert.ok(workerPrompt.length <= WORKER_PROMPT_CHAR_LIMIT, `Worker Prompt 超过 ${WORKER_PROMPT_CHAR_LIMIT} 字符回归上限`);
  assert.deepEqual(shape(worker.PROMPT_OUTPUT_SHAPE), shape(worker.schemaExample()));
  assert.deepEqual(shape(worker.PROMPT_OUTPUT_SHAPE), shape(ownApi.buildOwnApiReportSchemaExample()));
  for (const field of ['jobSummary', 'recommendation', 'scores', 'matches', 'risks', 'keywords', 'resumeSuggestions', 'interviewPrep', 'resumeRewrite', 'outreachScripts', 'selfIntroduction', 'reverseQuestions', 'trust']) {
    assert.match(workerPrompt, new RegExp(`"${field}"`));
  }
  assert.match(workerPrompt, /exactly one concise non-empty item in every array/i);
  assert.match(workerPrompt, /需本人确认/);
  assert.doesNotMatch(workerPrompt, /"schemaVersion"|"requestId"|"generatedAt"/);
});

test('平台熔断仍位于鉴权、额度 RPC 与模型调用之前', () => {
  const gateIndex = workerSource.indexOf('if (!isPlatformAiEnabled(env))');
  assert.ok(gateIndex >= 0);
  for (const symbol of ['verifySupabaseToken', 'reserve_platform_ai_quota_v2', 'callDeepSeek']) {
    const index = workerSource.indexOf(symbol);
    assert.ok(index > gateIndex, `${symbol} 必须位于平台熔断之后`);
  }
});
