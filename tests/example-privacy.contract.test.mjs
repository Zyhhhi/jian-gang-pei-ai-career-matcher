import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const casesStart = html.indexOf('const exampleCases = [');
const casesEnd = html.indexOf('\n];', casesStart);
if (casesStart < 0 || casesEnd < 0) throw new Error('无法定位虚构示例数据');
const casesSource = html.slice(casesStart, casesEnd + 3);
const exampleCases = new Function(`${casesSource}; return exampleCases;`)();

const privacyStart = html.indexOf('/* EXAMPLE_PRIVACY_START */');
const privacyEnd = html.indexOf('/* EXAMPLE_PRIVACY_END */');
if (privacyStart < 0 || privacyEnd < 0 || privacyEnd <= privacyStart) throw new Error('无法定位示例隐私模块');
const privacySource = html.slice(privacyStart, privacyEnd);

const validateStart = html.indexOf('function validateInput()');
const validateEnd = html.indexOf('function validateAiModeForAnalysis()', validateStart);
if (validateStart < 0 || validateEnd < 0) throw new Error('无法定位分析门禁');
const validateSource = html.slice(validateStart, validateEnd);

const ownStart = html.indexOf('/* OWN_API_DIRECT_START */');
const ownEnd = html.indexOf('/* OWN_API_DIRECT_END */');
if (ownStart < 0 || ownEnd < 0) throw new Error('无法定位自带 Key 请求模块');
const ownSource = html.slice(ownStart, ownEnd);

const draftStart = html.indexOf('function createEmptyJobDraft()');
const draftEnd = html.indexOf('function hydrateJobDraft()', draftStart);
if (draftStart < 0 || draftEnd < 0) throw new Error('无法定位岗位草稿替换模块');
const draftSource = html.slice(draftStart, draftEnd);

const JOB_MANUAL_FIELDS = [
  ['companyName', 'jobCompanyName'],
  ['jobTitle', 'jobTitle'],
  ['city', 'jobCity'],
  ['salaryRange', 'jobSalaryRange'],
  ['educationRequirement', 'jobEducationRequirement'],
  ['experienceRequirement', 'jobExperienceRequirement'],
  ['travelRequirement', 'jobTravelRequirement'],
  ['workSchedule', 'jobWorkSchedule'],
  ['extraNotes', 'jobExtraNotes']
];

const PRIVACY_SENTINELS = Object.freeze([
  'PRIVATE_RESUME_SENTINEL',
  'PRIVATE_JOB_SENTINEL',
  'PRIVATE_HISTORY_SENTINEL',
  'PRIVATE_QUARANTINE_SENTINEL',
  'PRIVATE_RESULT_SENTINEL',
  'PRIVATE_SCREENSHOT_SENTINEL'
]);

function element(initial = '') {
  const classes = new Set(['visible', 'active']);
  return {
    value: initial,
    textContent: initial,
    innerHTML: initial,
    checked: true,
    disabled: false,
    attributes: {},
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value)
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    focus() {},
    scrollIntoView() {}
  };
}

function createFillHarness({ scopeReady = true, random = 0, scope = 'guest' } = {}) {
  const storage = {
    scope,
    resumeProfile: PRIVACY_SENTINELS[0],
    jobDraft: PRIVACY_SENTINELS[1],
    history: PRIVACY_SENTINELS[2],
    quarantine: PRIVACY_SENTINELS[3]
  };
  const storageBefore = structuredClone(storage);
  const storageCalls = [];
  const elements = Object.fromEntries([
    ...JOB_MANUAL_FIELDS.map(([, id]) => [id, element(PRIVACY_SENTINELS[1])]),
    ['analyzer', element()],
    ['profileView', element(PRIVACY_SENTINELS[0])]
  ]);
  const deps = {
    storage,
    storageBefore,
    storageCalls,
    elements,
    statusMessages: [],
    screenshotRows: [PRIVACY_SENTINELS[5]],
    resumeInput: element(PRIVACY_SENTINELS[0]),
    jdInput: element(PRIVACY_SENTINELS[1]),
    jobScreenshotInput: element(PRIVACY_SENTINELS[5]),
    resumeFileInput: element(PRIVACY_SENTINELS[0]),
    resumeFileMeta: element(PRIVACY_SENTINELS[0]),
    resumeFileStatus: element(PRIVACY_SENTINELS[0]),
    ownApiDirectConsent: element(),
    resultPanel: element(),
    resultContent: element(PRIVACY_SENTINELS[4]),
    progressBox: element(),
    screenshotStatus: element(PRIVACY_SENTINELS[5]),
    profileEditor: element(),
    jdConfirmBadge: element(),
    analyzeHint: element(),
    exampleCases,
    scopeReady,
    random
  };

  const api = new Function('deps', `
    const {
      storage, storageCalls, elements, statusMessages, screenshotRows, resumeInput, jdInput,
      jobScreenshotInput, resumeFileInput, resumeFileMeta, resumeFileStatus, ownApiDirectConsent,
      resultPanel, resultContent, progressBox, screenshotStatus, profileEditor, jdConfirmBadge,
      analyzeHint, exampleCases, scopeReady, random
    } = deps;
    const JOB_MANUAL_FIELDS = ${JSON.stringify(JOB_MANUAL_FIELDS)};
    const $ = id => elements[id];
    const profileView = elements.profileView;
    const Math = { floor: globalThis.Math.floor, random: () => random };
    const localDataStore = {
      isAuthScopeReady() { storageCalls.push('isAuthScopeReady'); return scopeReady; },
      readJson() { storageCalls.push('readJson'); throw new Error('示例不得读取 scoped storage'); },
      readText() { storageCalls.push('readText'); throw new Error('示例不得读取 scoped storage'); },
      writeJson() { storageCalls.push('writeJson'); throw new Error('示例不得写入 scoped storage'); },
      writeText() { storageCalls.push('writeText'); throw new Error('示例不得写入 scoped storage'); },
      removeScoped() { storageCalls.push('removeScoped'); throw new Error('示例不得修改 scoped storage'); }
    };
    let currentResult = '${PRIVACY_SENTINELS[4]}';
    let currentRecordId = '${PRIVACY_SENTINELS[4]}';
    let exampleResumePendingSave = false;
    let exampleJdPendingConfirm = false;
    const renderScreenshotList = rows => { screenshotRows.splice(0, screenshotRows.length, ...rows); };
    const updateCounts = () => {};
    const setStatus = (message, type = '') => statusMessages.push({ message, type });
    ${privacySource}
    return {
      fillExample,
      state: () => ({
        currentResult,
        currentRecordId,
        exampleResumePendingSave,
        exampleJdPendingConfirm,
        resume: resumeInput.value,
        jd: jdInput.value,
        manualValues: Object.fromEntries(JOB_MANUAL_FIELDS.map(([key, id]) => [key, elements[id].value])),
        resultHtml: resultContent.innerHTML,
        profileHtml: elements.profileView.innerHTML,
        screenshotRows: [...screenshotRows],
        consent: ownApiDirectConsent.checked,
        statusMessages: [...statusMessages]
      })
    };
  `)(deps);
  return { ...api, storage, storageBefore, storageCalls };
}

function createOwnRequestHarness() {
  return new Function(`
    const TRUSTED_REPORT_SCHEMA_VERSION = '1.1';
    const OWN_API_CONFIG = Object.freeze({
      SCHEMA_VERSION: TRUSTED_REPORT_SCHEMA_VERSION,
      ENDPOINT: 'https://api.deepseek.com/chat/completions',
      MODEL: 'deepseek-v4-flash',
      MAX_TOKENS: 6144,
      TIMEOUT_MS: 45000
    });
    const window = { crypto: { randomUUID: () => 'privacy-request-id' }, setTimeout, clearTimeout };
    ${ownSource}
    return { buildOwnApiDirectRequest };
  `)();
}

test('全部示例只使用批准的明显虚构身份和项目数据', () => {
  assert.equal(exampleCases.length, 8);
  const approvedCandidates = exampleCases.map((_, index) => `示例候选人 ${String.fromCharCode(65 + index)}`);
  exampleCases.forEach((item, index) => {
    assert.match(item.resume, new RegExp(`^${approvedCandidates[index]}｜虚构大学`));
    assert.match(item.jd, /^公司名称：示例科技有限公司/m);
    assert.match(item.resume, /以上身份、课程、项目、技能和成果均为完全虚构/);
    const projectRows = item.resume.split('\n').filter(row => /^\d+\./.test(row));
    assert.equal(projectRows.length, 3);
    projectRows.forEach(row => assert.match(row, /示例项目/));
    assert.doesNotMatch(`${item.resume}\n${item.jd}`, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|1[3-9]\d{9}/i);
  });
});

test('Guest、账号 A、账号 B 点击示例只覆盖临时 DOM，不读取或写入 scoped storage', () => {
  ['guest', 'user-a', 'user-b'].forEach((scope, index) => {
    const harness = createFillHarness({ scope, random: (index + 0.1) / exampleCases.length });
    harness.fillExample();
    const state = harness.state();
    const domText = JSON.stringify(state);
    PRIVACY_SENTINELS.forEach(sentinel => assert.equal(domText.includes(sentinel), false));
    assert.deepEqual(harness.storage, harness.storageBefore);
    assert.deepEqual(harness.storageCalls, ['isAuthScopeReady']);
    assert.equal(state.exampleResumePendingSave, true);
    assert.equal(state.exampleJdPendingConfirm, true);
    assert.equal(state.currentResult, null);
    assert.equal(state.currentRecordId, null);
    assert.equal(state.consent, false);
    assert.deepEqual(state.screenshotRows, []);
    Object.values(state.manualValues).forEach(value => assert.equal(value, ''));
  });
});

test('auth hydrate 未完成时函数拒绝填充，两个示例按钮默认禁用', () => {
  assert.equal((html.match(/data-example-button[^>]*disabled/g) || []).length, 2);
  assert.match(html, /function loadActiveScopeData\(\)[\s\S]*?setExampleButtonsDisabled\(false\)/);
  assert.match(html, /function clearSensitivePageState\(\)[\s\S]*?setExampleButtonsDisabled\(true\)/);
  const harness = createFillHarness({ scopeReady: false });
  harness.fillExample();
  const state = harness.state();
  assert.equal(state.exampleResumePendingSave, false);
  assert.equal(state.exampleJdPendingConfirm, false);
  assert.match(state.statusMessages.at(-1).message, /安全恢复/);
  assert.deepEqual(harness.storageCalls, ['isAuthScopeReady']);
});

test('示例填充模块不引用正式保存、历史、quarantine 或 scoped 数据读写', () => {
  assert.doesNotMatch(privacySource, /saveResumeProfile|saveJobDraft|getResumeProfile|getJobDraft|getHistory|loadHistory|quarantine/i);
  assert.doesNotMatch(privacySource, /localDataStore\.(?:readJson|readText|writeJson|writeText|removeScoped|clearActiveScope)/);
  assert.match(privacySource, /clearTransientStateForExample\(\)/);
  assert.match(privacySource, /exampleResumePendingSave = true/);
  assert.match(privacySource, /exampleJdPendingConfirm = true/);
});

test('示例 JD 主动确认时完整替换旧草稿，不合并旧字段或截图元数据', () => {
  const reads = [];
  const writes = [];
  const replaceJobDraft = new Function('deps', `
    const { reads, writes } = deps;
    const STORAGE = { jobDraft: 'jobDraft' };
    const localDataStore = {
      readJson() { reads.push('readJson'); return { companyName: '${PRIVACY_SENTINELS[1]}' }; },
      writeJson(_key, value) { writes.push(structuredClone(value)); return true; }
    };
    const renderJobDraftState = () => {};
    const renderLocalDataStatus = () => {};
    ${draftSource}
    return replaceJobDraft;
  `)({ reads, writes });

  const draft = replaceJobDraft({
    jdText: exampleCases[0].jd,
    jdConfirmed: true,
    sourceType: 'paste'
  }, false);
  assert.deepEqual(reads, []);
  assert.equal(writes.length, 1);
  assert.equal(JSON.stringify(draft).includes(PRIVACY_SENTINELS[1]), false);
  assert.equal(draft.companyName, '');
  assert.equal(draft.extraNotes, '');
  assert.deepEqual(draft.screenshotFiles, []);
});

test('未主动保存和确认时分析被阻止；明确确认后的请求体只包含当前虚构输入', () => {
  const gate = new Function(`
    let exampleResumePendingSave = true;
    let exampleJdPendingConfirm = true;
    const isExampleDraftPending = () => exampleResumePendingSave || exampleJdPendingConfirm;
    const getResumeProfile = () => { throw new Error('pending gate must run before storage read'); };
    const getJobDraft = () => { throw new Error('pending gate must run before storage read'); };
    ${validateSource}
    return validateInput;
  `)();
  assert.match(gate(), /尚未保存或确认/);

  const selected = exampleCases[0];
  const request = createOwnRequestHarness().buildOwnApiDirectRequest('privacy-request-id', {
    targetRole: selected.title,
    educationSummary: '虚构大学示例教育背景',
    skillKeywords: ['示例技能'],
    projectSummary: '智能任务助手示例项目',
    experienceSummary: '完全虚构的示例经历',
    portfolioLinks: [],
    resumeText: selected.resume
  }, {
    jdText: selected.jd,
    jdConfirmed: true,
    companyName: '示例科技有限公司',
    jobTitle: selected.title
  });
  const serialized = JSON.stringify(request);
  PRIVACY_SENTINELS.forEach(sentinel => assert.equal(serialized.includes(sentinel), false));
  assert.match(serialized, /示例候选人 A/);
  assert.match(serialized, /示例科技有限公司/);
});
