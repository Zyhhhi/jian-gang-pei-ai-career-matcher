import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

test('v0.9.0 exposes the four-step analysis shell and independent navigation', () => {
  ['workflowStep1', 'workflowStep2', 'workflowStep3', 'workflowStep4', 'historyView', 'productDrawer', 'noticeDrawer', 'accountDrawer']
    .forEach(id => assert.match(source, new RegExp(`id="${id}"`)));
  assert.match(source, /产品说明/);
  assert.match(source, /注意事项/);
  assert.match(source, /今日剩余额度：5 次/);
  assert.match(source, /岗位匹配工具 · RoleFit AI/);
  assert.doesNotMatch(source, /用四步，完成一次更有依据的投递判断。/);
  assert.doesNotMatch(source, /保存简历、确认岗位、选择分析方式，再在同一工作区复用完整结果。/);
});

test('results use four internal tabs without changing the model protocol', () => {
  ['匹配总览', '简历优化', '面试准备', '求职材料'].forEach(label => assert.match(source, new RegExp(label)));
  assert.match(source, /function selectResultTab\(/);
  assert.match(source, /TRUSTED_REPORT_SCHEMA_VERSION = '1\.2'/);
  assert.match(source, /PLATFORM_ANALYZE_PATH: '\/api\/platform-analyze'/);
});

test('interaction shell preserves existing analysis and local-data entry points', () => {
  ['runAnalyze()', 'saveResumeProfile()', 'confirmJobDraft()', 'selectAiMode(', 'renderHistory()', 'localDataStore']
    .forEach(marker => assert.ok(source.includes(marker), `missing ${marker}`));
  assert.match(source, /ENABLE_PLATFORM_AI: true/);
});

test('drawers and menus support Escape-based dismissal', () => {
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /function closeDrawers\(/);
  assert.match(source, /function closeAccountMenu\(/);
  assert.match(source, /id="productDrawer"[^>]*\sinert/);
  assert.match(source, /drawer\.inert = false/);
  assert.match(source, /drawer\.inert = true/);
});
