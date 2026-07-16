import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const authStart = html.indexOf('function authConfigured()');
const magicEnd = html.indexOf('async function sendEmailOtp');
if (authStart < 0 || magicEnd < 0) throw new Error('无法定位双模式登录模块');
const magicModuleSource = html.slice(authStart, magicEnd);

function createNode() {
  return { value: '', textContent: '', className: '', disabled: false, hidden: false, focus() {}, scrollIntoView() {} };
}

function createMagicHarness() {
  const nodes = Object.fromEntries([
    'accountPanel', 'loginEmailInput', 'sendMagicLinkButton', 'sendOtpButton', 'otpVerifyPanel',
    'otpEmailHint', 'otpCodeInput', 'verifyOtpButton', 'changeOtpEmailButton', 'resendOtpButton',
    'authStatus', 'platformAiAccessStatus'
  ].map((id) => [id, createNode()]));
  const calls = [];
  const api = new Function('deps', `
    const { nodes, calls } = deps;
    const SUPABASE_AUTH_CONFIG = { ENABLE_SUPABASE_AUTH: true, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_mock', LOGIN_MODE: 'magic_link' };
    const PLATFORM_AI_CONFIG = { ENABLE_PLATFORM_AI: false, PLATFORM_WORKER_BASE_URL: '', PLATFORM_ANALYZE_PATH: '' };
    const OTP_RESEND_SECONDS = 60;
    const otpLoginState = { email: '', stage: 'email', resendRemaining: 0, timerId: null, isSending: false, isVerifying: false };
    let supabaseAuthClient = { auth: { signInWithOtp: async (params) => { calls.push(params); return { error: null }; } } };
    let currentAuthSession = null;
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
    const window = { location: { href: 'https://zyhhhi.github.io/jian-gang-pei-ai-career-matcher/index.html?release=test#session' }, clearInterval() {}, setInterval() { return 1; }, addEventListener() {} };
    const trackEvent = () => {};
    const authEventMetadata = () => ({});
    const renderAiModeState = () => {};
    const maskEmail = (email) => email.replace(/^[^@]+/, 'te****');
    const setAuthMessage = (text, type = '') => { authStatus.textContent = text; authStatus.className = type; };
    ${magicModuleSource}
    return { nodes, sendMagicLink, updateOtpLoginUi, getMagicLinkRedirectTo };
  `)({ nodes, calls });
  return { ...api, calls };
}

test('LOGIN_MODE 默认固定为 magic_link，OTP 控件不会对普通用户显示', () => {
  assert.match(html, /LOGIN_MODE:\s*'magic_link'/);
  assert.match(html, /id="sendOtpButton"[^>]*hidden/);
  assert.match(html, /sendOtpButton\.hidden = !otpEnabled/);
  assert.match(html, /if \(!isOtpLoginMode\(\)\)/);
});

test('Magic Link 使用当前 HTTP(S) 页面路径生成 redirect，不硬编码本地地址', async () => {
  const harness = createMagicHarness();
  harness.nodes.loginEmailInput.value = 'tester@example.com';
  harness.updateOtpLoginUi();
  assert.equal(harness.nodes.sendMagicLinkButton.hidden, false);
  assert.equal(harness.nodes.sendOtpButton.hidden, true);
  assert.equal(harness.nodes.otpVerifyPanel.hidden, true);

  await harness.sendMagicLink();

  assert.deepEqual(harness.calls, [{
    email: 'tester@example.com',
    options: { emailRedirectTo: 'https://zyhhhi.github.io/jian-gang-pei-ai-career-matcher/index.html' }
  }]);
  assert.equal(harness.getMagicLinkRedirectTo(), 'https://zyhhhi.github.io/jian-gang-pei-ai-career-matcher/index.html');
});
