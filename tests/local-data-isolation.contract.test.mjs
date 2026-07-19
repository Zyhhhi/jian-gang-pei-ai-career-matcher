import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const accessStart = html.indexOf("const STORAGE_SCHEMA_VERSION = '2';");
const accessEnd = html.indexOf('const ANALYTICS_CONFIG =');
if (accessStart < 0 || accessEnd < 0 || accessEnd <= accessStart) throw new Error('无法定位本地存储访问层');
const accessLayerSource = html.slice(accessStart, accessEnd);

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    dump: () => Object.fromEntries(values)
  };
}

function createStore(initial = {}) {
  const storage = createMemoryStorage(initial);
  const api = new Function('storage', `
    const window = { localStorage: storage };
    ${accessLayerSource}
    return { localDataStore, STORAGE, STORAGE_SCHEMA_VERSION, LEGACY_QUARANTINE_PREFIX, LEGACY_QUARANTINE_MARKER, STORAGE_SCHEMA_KEY };
  `)(storage);
  return { ...api, storage };
}

function session(userId) {
  return { user: { id: userId, email: 'masked@example.com' }, access_token: 'not-used-in-storage-tests' };
}

test('auth 未恢复时默认拒绝读取或写入敏感数据', () => {
  const { localDataStore, STORAGE } = createStore();
  localDataStore.beginAuthRestore();
  assert.equal(localDataStore.isAuthScopeReady(), false);
  assert.equal(localDataStore.readJson(STORAGE.resumeProfile, null), null);
  assert.equal(localDataStore.writeJson(STORAGE.resumeProfile, { resumeText: 'should-not-persist' }), false);
  assert.equal(localDataStore.readText(STORAGE.apiKey, ''), '');
});

test('guest、A、B 三个 scope 完全隔离，清空 A 不影响 B', () => {
  const { localDataStore, STORAGE } = createStore();
  localDataStore.beginAuthRestore();
  localDataStore.activateFromVerifiedSession(null);
  localDataStore.writeJson(STORAGE.resumeProfile, { owner: 'guest' });

  localDataStore.activateFromVerifiedSession(session(USER_A));
  localDataStore.writeJson(STORAGE.resumeProfile, { owner: 'A' });
  localDataStore.writeJson(STORAGE.jobDraft, { owner: 'A' });
  localDataStore.writeJson(STORAGE.history, [{ owner: 'A' }]);
  localDataStore.writeJson(STORAGE.feedback, [{ owner: 'A' }]);
  localDataStore.writeJson(STORAGE.feedbackRecords, [{ owner: 'A' }]);
  localDataStore.writeJson(STORAGE.jobRecords, [{ owner: 'A' }]);
  localDataStore.writeText(STORAGE.aiMode, 'own_api');
  localDataStore.writeText(STORAGE.apiKey, 'sk-a-only');

  localDataStore.activateFromVerifiedSession(session(USER_B));
  assert.equal(localDataStore.readJson(STORAGE.resumeProfile, null), null);
  assert.deepEqual(localDataStore.readJson(STORAGE.history, []), []);
  assert.equal(localDataStore.readText(STORAGE.apiKey, ''), '');
  localDataStore.writeJson(STORAGE.resumeProfile, { owner: 'B' });
  localDataStore.writeJson(STORAGE.jobRecords, [{ owner: 'B' }]);

  localDataStore.activateFromVerifiedSession(session(USER_A));
  assert.equal(localDataStore.readJson(STORAGE.resumeProfile, null).owner, 'A');
  assert.equal(localDataStore.readJson(STORAGE.jobDraft, null).owner, 'A');
  assert.equal(localDataStore.readJson(STORAGE.history, [])[0].owner, 'A');
  assert.equal(localDataStore.readJson(STORAGE.feedback, [])[0].owner, 'A');
  assert.equal(localDataStore.readJson(STORAGE.feedbackRecords, [])[0].owner, 'A');
  assert.equal(localDataStore.readJson(STORAGE.jobRecords, [])[0].owner, 'A');
  assert.equal(localDataStore.readText(STORAGE.aiMode, ''), 'own_api');
  assert.equal(localDataStore.readText(STORAGE.apiKey, ''), 'sk-a-only');
  localDataStore.clearActiveScope();

  localDataStore.activateFromVerifiedSession(session(USER_B));
  assert.equal(localDataStore.readJson(STORAGE.resumeProfile, null).owner, 'B');
  assert.equal(localDataStore.readJson(STORAGE.jobRecords, [])[0].owner, 'B');
});

test('API Key 可在同一账号刷新恢复，但退出或切换时可定向删除', () => {
  const { localDataStore, STORAGE } = createStore();
  localDataStore.beginAuthRestore();
  localDataStore.activateFromVerifiedSession(session(USER_A));
  localDataStore.writeText(STORAGE.apiKey, 'sk-a-refresh');
  localDataStore.activateFromVerifiedSession(session(USER_A));
  assert.equal(localDataStore.readText(STORAGE.apiKey, ''), 'sk-a-refresh');

  localDataStore.clearActiveUserApiKey();
  localDataStore.activateFromVerifiedSession(null);
  localDataStore.activateFromVerifiedSession(session(USER_B));
  assert.equal(localDataStore.readText(STORAGE.apiKey, ''), '');
  localDataStore.activateFromVerifiedSession(session(USER_A));
  assert.equal(localDataStore.readText(STORAGE.apiKey, ''), '');
});

test('旧全局敏感数据只进入 quarantine，旧 Key 删除且迁移幂等', () => {
  const { localDataStore, STORAGE, STORAGE_SCHEMA_VERSION, LEGACY_QUARANTINE_PREFIX, LEGACY_QUARANTINE_MARKER, STORAGE_SCHEMA_KEY, storage } = createStore({
    resumeProfile: JSON.stringify({ resumeText: 'legacy resume' }),
    jobDraft: JSON.stringify({ jdText: 'legacy jd' }),
    jian_gang_pei_history: JSON.stringify([{ id: 'legacy-history' }]),
    aiMode: 'own_api',
    userApiKey: 'sk-legacy-must-delete',
    jian_gang_pei_api_key: 'sk-legacy-older-must-delete'
  });
  localDataStore.migrateLegacySensitiveData();
  const once = storage.dump();
  assert.equal(once.resumeProfile, undefined);
  assert.equal(once.jobDraft, undefined);
  assert.equal(once.jian_gang_pei_history, undefined);
  assert.equal(once.userApiKey, undefined);
  assert.equal(once.jian_gang_pei_api_key, undefined);
  assert.equal(once[`${LEGACY_QUARANTINE_PREFIX}:resumeProfile`], JSON.stringify({ resumeText: 'legacy resume' }));
  assert.equal(once[`${LEGACY_QUARANTINE_PREFIX}:jobDraft`], JSON.stringify({ jdText: 'legacy jd' }));
  assert.equal(once[`${LEGACY_QUARANTINE_PREFIX}:jian_gang_pei_history`], JSON.stringify([{ id: 'legacy-history' }]));
  assert.equal(once[`${LEGACY_QUARANTINE_PREFIX}:userApiKey`], undefined);
  assert.equal(once[LEGACY_QUARANTINE_MARKER], STORAGE_SCHEMA_VERSION);
  assert.equal(once[STORAGE_SCHEMA_KEY], STORAGE_SCHEMA_VERSION);

  localDataStore.migrateLegacySensitiveData();
  assert.deepEqual(storage.dump(), once);
  localDataStore.beginAuthRestore();
  localDataStore.activateFromVerifiedSession(session(USER_A));
  assert.equal(localDataStore.readJson(STORAGE.resumeProfile, null), null, 'quarantine must never auto-claim legacy data');
});

test('损坏 JSON 安全降级，不阻塞其余 scope 数据读取', () => {
  const { localDataStore, STORAGE, storage } = createStore();
  localDataStore.beginAuthRestore();
  localDataStore.activateFromVerifiedSession(session(USER_A));
  storage.setItem(`jian_gang_pei:v2:user:${USER_A}:${STORAGE.resumeProfile}`, '{not-json');
  localDataStore.writeJson(STORAGE.jobDraft, { jdText: 'valid' });
  assert.equal(localDataStore.readJson(STORAGE.resumeProfile, null), null);
  assert.equal(localDataStore.readJson(STORAGE.jobDraft, null).jdText, 'valid');
});

test('业务代码的敏感存储读写只存在于唯一访问层，认证切换顺序固定', () => {
  const outsideAccessLayer = html.slice(0, accessStart) + html.slice(accessEnd);
  assert.doesNotMatch(outsideAccessLayer, /localStorage\.(?:getItem|setItem|removeItem|clear)\(/);
  const syncStart = html.indexOf('function syncAuthSession(session)');
  const syncEnd = html.indexOf('function renderPlatformAiAccessState()', syncStart);
  const syncSource = html.slice(syncStart, syncEnd);
  assert.ok(syncSource.indexOf('clearSensitivePageState()') < syncSource.indexOf('clearActiveUserApiKey()'));
  assert.ok(syncSource.indexOf('clearActiveUserApiKey()') < syncSource.indexOf('activateFromVerifiedSession'));
  assert.ok(syncSource.indexOf('activateFromVerifiedSession') < syncSource.indexOf('loadActiveScopeData()'));
  assert.match(html, /ENABLE_PLATFORM_AI:\s*false/);
  assert.match(html, /user_id', 'userId', 'uid'/);
  assert.match(html, /'report', 'fullReport', 'result', 'resumeProfile', 'jobDraft', 'history', 'feedback'/);
});

test('A→B、退出切换先清空页面，再清除旧 Key、激活并加载新 scope', () => {
  const syncStart = html.indexOf('function syncAuthSession(session)');
  const syncEnd = html.indexOf('function renderPlatformAiAccessState()', syncStart);
  const syncSource = html.slice(syncStart, syncEnd);
  const order = [];
  const harness = new Function('deps', `
    const { order } = deps;
    let currentAuthSession = null;
    let activeUserId = '';
    let scopeReady = false;
    const localDataStore = {
      getActiveUserId: () => activeUserId,
      isAuthScopeReady: () => scopeReady,
      clearActiveUserApiKey: () => order.push('clear-key:' + activeUserId),
      activateFromVerifiedSession: (session) => {
        activeUserId = session?.user?.id || '';
        scopeReady = true;
        order.push('activate:' + (activeUserId || 'guest'));
      }
    };
    const getVerifiedSupabaseSessionUserId = (session) => session?.user?.id || '';
    const clearSensitivePageState = () => order.push('clear-page');
    const loadActiveScopeData = () => order.push('load');
    const renderAuthState = () => {};
    const renderAiModeState = () => {};
    const renderPlatformAiAccessState = () => {};
    ${syncSource}
    return { syncAuthSession };
  `)({ order });

  harness.syncAuthSession(session(USER_A));
  assert.deepEqual(order.splice(0), ['clear-page', `activate:${USER_A}`, 'load']);
  harness.syncAuthSession(session(USER_B));
  assert.deepEqual(order.splice(0), ['clear-page', `clear-key:${USER_A}`, `activate:${USER_B}`, 'load']);
  harness.syncAuthSession(null);
  assert.deepEqual(order.splice(0), ['clear-page', `clear-key:${USER_B}`, 'activate:guest', 'load']);
});
