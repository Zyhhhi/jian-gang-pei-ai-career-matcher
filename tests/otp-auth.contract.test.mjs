import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const authStart = html.indexOf('function authConfigured()');
const authEnd = html.indexOf('function authEventMetadata(source)');
if (authStart < 0 || authEnd < 0) throw new Error('无法定位 OTP 登录模块');
const authModuleSource = html.slice(authStart, authEnd);

function createNode() {
  return {
    value: '', textContent: '', className: '', disabled: false, hidden: false,
    focus() {}, scrollIntoView() {}
  };
}

function createHarness(overrides = {}) {
  const nodes = Object.fromEntries([
    'accountPanel', 'loginEmailInput', 'sendMagicLinkButton', 'sendOtpButton', 'otpVerifyPanel',
    'otpEmailHint', 'otpCodeInput', 'verifyOtpButton', 'changeOtpEmailButton',
    'resendOtpButton', 'authStatus', 'platformAiAccessStatus'
  ].map((id) => [id, createNode()]));
  const intervals = new Map();
  let nextIntervalId = 1;
  const events = [];
  const auth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithOtp: async () => ({ data: { user: null, session: null }, error: null }),
    verifyOtp: async () => ({ data: { session: { user: { email: 'tester@example.com' }, access_token: 'mock-access' } }, error: null }),
    signOut: async () => ({ error: null }),
    ...overrides.auth
  };
  const api = new Function('deps', `
    const { nodes, auth, events, intervals, loginMode } = deps;
    const SUPABASE_AUTH_CONFIG = { ENABLE_SUPABASE_AUTH: true, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_mock', LOGIN_MODE: loginMode || 'email_otp' };
    const PLATFORM_AI_CONFIG = { ENABLE_PLATFORM_AI: false, PLATFORM_WORKER_BASE_URL: '', PLATFORM_ANALYZE_PATH: '' };
    const OTP_RESEND_SECONDS = 60;
    const otpLoginState = { email: '', stage: 'email', resendRemaining: 0, timerId: null, isSending: false, isVerifying: false };
    let supabaseAuthClient = { auth };
    let currentAuthSession = null;
    let gateRenderCount = 0;
    const $ = (id) => nodes[id] || null;
    const loginEmailInput = $('loginEmailInput');
    const sendMagicLinkButton = $('sendMagicLinkButton');
    const sendOtpButton = $('sendOtpButton');
    const otpVerifyPanel = $('otpVerifyPanel');
    const otpEmailHint = $('otpEmailHint');
    const otpCodeInput = $('otpCodeInput');
    const verifyOtpButton = $('verifyOtpButton');
    const changeOtpEmailButton = $('changeOtpEmailButton');
    const resendOtpButton = $('resendOtpButton');
    const authStatus = $('authStatus');
    const platformAiAccessStatus = $('platformAiAccessStatus');
    const window = {
      location: { href: 'http://localhost:4178/index.html?preview=1#session' },
      setInterval(callback) { const id = intervals.size + 1; intervals.set(id, callback); return id; },
      clearInterval(id) { intervals.delete(id); },
      addEventListener() {}
    };
    const trackEvent = (event, data) => events.push({ event, data });
    const authEventMetadata = (source) => ({ source });
    const renderAiModeState = () => { gateRenderCount += 1; };
    ${authModuleSource}
    return {
      nodes, intervals, otpLoginState,
      sendEmailOtp, resendEmailOtp, verifyEmailOtp, changeOtpEmail,
      normalizeOtpCodeInput, startOtpResendCountdown, initAuthModule, logoutUser,
      getCurrentSession: () => currentAuthSession,
      getGateRenderCount: () => gateRenderCount
    };
  `)({ nodes, auth, events, intervals, loginMode: overrides.loginMode });
  return { ...api, auth, events };
}

test('合法邮箱只调用一次 signInWithOtp，且不传 redirect 参数', async () => {
  const calls = [];
  const harness = createHarness({ auth: { signInWithOtp: async (params) => { calls.push(params); return { error: null }; } } });
  harness.nodes.loginEmailInput.value = 'tester@example.com';

  await harness.sendEmailOtp();
  await harness.resendEmailOtp();

  assert.deepEqual(calls, [{ email: 'tester@example.com' }]);
  assert.equal(harness.nodes.otpVerifyPanel.hidden, false);
  assert.equal(harness.nodes.resendOtpButton.disabled, true);
  assert.equal(harness.nodes.resendOtpButton.textContent, '重新发送（60秒）');
});

test('空邮箱、格式错误和发送频繁均显示普通中文提示', async () => {
  const calls = [];
  const invalid = createHarness({ auth: { signInWithOtp: async (params) => { calls.push(params); return { error: null }; } } });
  await invalid.sendEmailOtp();
  assert.equal(invalid.nodes.authStatus.textContent, '请填写有效邮箱，再发送验证码。');
  invalid.nodes.loginEmailInput.value = 'not-an-email';
  await invalid.sendEmailOtp();
  assert.equal(calls.length, 0);

  const rateLimited = createHarness({ auth: { signInWithOtp: async () => ({ error: { code: 'over_email_send_rate_limit', message: 'internal detail' } }) } });
  rateLimited.nodes.loginEmailInput.value = 'tester@example.com';
  await rateLimited.sendEmailOtp();
  assert.equal(rateLimited.nodes.authStatus.textContent, '请求过于频繁，请稍后再试。');
});

test('倒计时阻止重发，更换邮箱会清空验证码和倒计时', async () => {
  const harness = createHarness();
  harness.nodes.loginEmailInput.value = 'tester@example.com';
  await harness.sendEmailOtp();
  const tick = [...harness.intervals.values()][0];
  tick();
  assert.equal(harness.nodes.resendOtpButton.textContent, '重新发送（59秒）');

  harness.nodes.otpCodeInput.value = '123456';
  harness.changeOtpEmail();
  assert.equal(harness.nodes.otpCodeInput.value, '');
  assert.equal(harness.nodes.loginEmailInput.value, '');
  assert.equal(harness.otpLoginState.resendRemaining, 0);
  assert.equal(harness.nodes.otpVerifyPanel.hidden, true);
});

test('验证码验证传入 email、token、type=email，并立即更新 session', async () => {
  const calls = [];
  const session = { user: { email: 'tester@example.com' }, access_token: 'mock-access' };
  const harness = createHarness({ auth: { verifyOtp: async (params) => { calls.push(params); return { data: { session }, error: null }; } } });
  harness.nodes.loginEmailInput.value = 'tester@example.com';
  await harness.sendEmailOtp();
  harness.nodes.otpCodeInput.value = '12a3456';

  await harness.verifyEmailOtp();

  assert.deepEqual(calls, [{ email: 'tester@example.com', token: '123456', type: 'email' }]);
  assert.equal(harness.getCurrentSession(), session);
  assert.match(harness.nodes.authStatus.textContent, /登录成功/);
});

test('错误和过期验证码使用中文提示，且不泄露服务端消息', async () => {
  const expired = createHarness({ auth: { verifyOtp: async () => ({ data: {}, error: { message: 'Token has expired' } }) } });
  expired.nodes.loginEmailInput.value = 'tester@example.com';
  await expired.sendEmailOtp();
  expired.nodes.otpCodeInput.value = '123456';
  await expired.verifyEmailOtp();
  assert.equal(expired.nodes.authStatus.textContent, '验证码已过期，请重新发送。');

  const invalid = createHarness({ auth: { verifyOtp: async () => ({ data: {}, error: { message: 'Invalid OTP supplied' } }) } });
  invalid.nodes.loginEmailInput.value = 'tester@example.com';
  await invalid.sendEmailOtp();
  invalid.nodes.otpCodeInput.value = '123456';
  await invalid.verifyEmailOtp();
  assert.equal(invalid.nodes.authStatus.textContent, '验证码错误，请检查后重试。');
});

test('session 恢复与退出会更新页面登录门禁状态', async () => {
  const restored = { user: { email: 'restore@example.com' }, access_token: 'mock-access' };
  const harness = createHarness({ auth: { getSession: async () => ({ data: { session: restored }, error: null }) } });
  await harness.initAuthModule();
  assert.equal(harness.getCurrentSession(), restored);
  const beforeLogoutGateRenderCount = harness.getGateRenderCount();
  await harness.logoutUser();
  assert.equal(harness.getCurrentSession(), null);
  assert.ok(harness.getGateRenderCount() > beforeLogoutGateRenderCount);
  assert.match(harness.nodes.authStatus.textContent, /已退出登录/);
});

test('OTP 模式静态规则保持可用、免费门禁和平台 AI 关闭', () => {
  assert.match(html, /ENABLE_PLATFORM_AI:\s*false/);
  assert.match(html, /mode !== 'mock' && !currentAuthSession/);
  assert.match(html, /LOGIN_MODE:\s*'magic_link'/);
  assert.match(html, /autocomplete="one-time-code"/);
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, /verifyOtp\(\{ email, token, type: 'email' \}\)/);
  assert.match(html, /if \(!isOtpLoginMode\(\)\)/);
  assert.doesNotMatch(html, /loginEmailInput"[^>]*type="password"/);
});
