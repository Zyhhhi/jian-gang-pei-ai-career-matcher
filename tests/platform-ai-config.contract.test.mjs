import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const productionWorkerBaseUrl = 'https://jian-gang-pei-platform-ai.sozowali642.workers.dev';
const analyzePath = '/api/platform-analyze';
const productionEndpoint = `${productionWorkerBaseUrl}${analyzePath}`;
const retiredTestWorkerBaseUrl = [
  'https://jian-gang-pei-86c-test-',
  '20260714.sozowali642.workers.dev'
].join('');

const configMatch = html.match(/const PLATFORM_AI_CONFIG\s*=\s*\{([\s\S]*?)\n\};/);
if (!configMatch) throw new Error('无法定位平台 AI 前端配置');
const platformConfig = new Function(`return ({${configMatch[1]}});`)();

const endpointStart = html.indexOf('function getPlatformWorkerEndpoint()');
const endpointEnd = html.indexOf('function createPlatformRequestId()', endpointStart);
const analyzeStart = html.indexOf('async function runPlatformAnalyze(');
const analyzeEnd = html.indexOf('function handlePlatformApiFailure(', analyzeStart);
if (endpointStart < 0 || endpointEnd < 0 || analyzeStart < 0 || analyzeEnd < 0) {
  throw new Error('无法定位平台 AI 前端调用模块');
}
const endpointSource = html.slice(endpointStart, endpointEnd);
const analyzeSource = html.slice(analyzeStart, analyzeEnd);

function createHarness(config = platformConfig) {
  const fetchCalls = [];
  const api = new Function('deps', `
    const { config, fetchCalls } = deps;
    const PLATFORM_AI_CONFIG = config;
    const fetch = (...args) => {
      fetchCalls.push(args);
      throw new Error('关闭状态不应调用 fetch');
    };
    ${endpointSource}
    ${analyzeSource}
    return { getPlatformWorkerEndpoint, runPlatformAnalyze };
  `)({ config, fetchCalls });
  return { ...api, fetchCalls };
}

test('平台 AI 前端固定接线正式 Worker，且默认保持关闭', () => {
  assert.equal(platformConfig.PLATFORM_WORKER_BASE_URL, productionWorkerBaseUrl);
  assert.equal(platformConfig.PLATFORM_ANALYZE_PATH, analyzePath);
  assert.equal(platformConfig.ENABLE_PLATFORM_AI, false);
  assert.doesNotMatch(html, new RegExp(retiredTestWorkerBaseUrl.replaceAll('.', '\\.')));

  const harness = createHarness();
  assert.equal(harness.getPlatformWorkerEndpoint(), productionEndpoint);
});

test('平台 AI 关闭门禁位于 fetch 之前，关闭状态不会请求 Worker', async () => {
  const guardIndex = analyzeSource.indexOf('if (!PLATFORM_AI_CONFIG.ENABLE_PLATFORM_AI)');
  const fetchIndex = analyzeSource.indexOf('fetch(endpoint');
  assert.ok(guardIndex >= 0, '缺少平台 AI 关闭门禁');
  assert.ok(fetchIndex >= 0, '缺少平台 Worker fetch');
  assert.ok(guardIndex < fetchIndex, '平台 AI 关闭门禁必须先于 fetch');

  const harness = createHarness();
  await assert.rejects(
    harness.runPlatformAnalyze({}, {}, 0),
    /当前暂未开放/
  );
  assert.equal(harness.fetchCalls.length, 0);
});
