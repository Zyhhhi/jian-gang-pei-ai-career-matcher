import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workerSource = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const worker = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);

const NOW_MS = Date.parse('2026-07-23T06:50:00.000Z');
const TTL_MS = 5 * 60 * 1000;
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const ENV = {
  DEEPSEEK_API_KEY: 'test-only-placeholder',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-placeholder',
  PLATFORM_AI_ENABLED: 'false',
  MODEL_TIMEOUT_MS: '120000'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function staleRequest({ requestId, userId = USER_A, status = 'processing', ageMs = TTL_MS + 1 } = {}) {
  return {
    request_id: requestId,
    user_id: userId,
    status,
    updated_at: new Date(NOW_MS - ageMs).toISOString(),
    day_reserved: 1,
    month_reserved: 1,
    day_success: 0,
    month_success: 0
  };
}

class RecoveryBackend {
  constructor(rows = [], { failRequestIds = [] } = {}) {
    this.rows = new Map(rows.map((row) => [row.request_id, { ...row }]));
    this.failRequestIds = new Set(failRequestIds);
    this.listUrls = [];
    this.recoveryCalls = [];
    this.providerCalls = 0;
  }

  async fetch(url, options = {}) {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/rest/v1/ai_requests')) {
      this.listUrls.push(parsed);
      const cutoff = Date.parse(parsed.searchParams.get('updated_at')?.replace(/^lt\./, '') || '');
      const rows = [...this.rows.values()]
        .filter((row) => ['reserved', 'processing'].includes(row.status))
        .filter((row) => Date.parse(row.updated_at) < cutoff)
        .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
        .slice(0, Number(parsed.searchParams.get('limit')))
        .map(({ request_id, user_id, status, updated_at }) => ({ request_id, user_id, status, updated_at }));
      return json(rows);
    }
    if (parsed.pathname.endsWith('/rpc/recover_stale_platform_ai_request_v2')) {
      const payload = JSON.parse(options.body);
      this.recoveryCalls.push(payload);
      if (this.failRequestIds.has(payload.p_request_id)) return json({ code: 'TEST_FAILURE' }, 500);
      const row = this.rows.get(payload.p_request_id);
      if (!row || row.user_id !== payload.p_user_id) return json([{ outcome: 'request_id_conflict', request_status: null }]);
      if (row.status === 'success') return json([{ outcome: 'already_success', request_status: 'success' }]);
      if (row.status === 'refunded') return json([{ outcome: 'already_refunded', request_status: 'refunded' }]);
      if (!['reserved', 'processing'].includes(row.status) || Date.parse(row.updated_at) >= NOW_MS - TTL_MS) {
        return json([{ outcome: 'not_stale', request_status: row.status }]);
      }
      row.status = 'refunded';
      row.error_code = 'STALE_RESERVATION_TIMEOUT';
      row.day_reserved -= 1;
      row.month_reserved -= 1;
      return json([{ outcome: 'refunded', request_status: 'refunded' }]);
    }
    if (parsed.hostname === 'api.deepseek.com') {
      this.providerCalls += 1;
      throw new Error('DeepSeek must not be called by stale recovery.');
    }
    throw new Error(`Unexpected path: ${parsed.pathname}`);
  }
}

async function recover(backend, env = ENV) {
  return worker.recoverStalePlatformRequests(env, {}, { fetchImpl: backend.fetch.bind(backend), nowMs: NOW_MS });
}

test('reserved and processing requests beyond the TTL are refunded without changing success counts', async () => {
  const backend = new RecoveryBackend([
    staleRequest({ requestId: 'reserved-12345678', status: 'reserved' }),
    staleRequest({ requestId: 'processing-12345678', status: 'processing' })
  ]);

  const summary = await recover(backend);

  assert.deepEqual(summary, { scanned: 2, recovered: 2, skipped: 0, failed: 0 });
  for (const row of backend.rows.values()) {
    assert.equal(row.status, 'refunded');
    assert.equal(row.day_reserved, 0);
    assert.equal(row.month_reserved, 0);
    assert.equal(row.day_success, 0);
    assert.equal(row.month_success, 0);
  }
  assert.equal(backend.providerCalls, 0);
});

test('fresh, success, and refunded requests are not released', async () => {
  const backend = new RecoveryBackend([
    staleRequest({ requestId: 'fresh-12345678', ageMs: TTL_MS - 1 }),
    staleRequest({ requestId: 'success-12345678', status: 'success' }),
    staleRequest({ requestId: 'refunded-12345678', status: 'refunded' })
  ]);

  const summary = await recover(backend);

  assert.deepEqual(summary, { scanned: 0, recovered: 0, skipped: 0, failed: 0 });
  assert.equal(backend.rows.get('fresh-12345678').status, 'processing');
  assert.equal(backend.rows.get('success-12345678').status, 'success');
  assert.equal(backend.rows.get('refunded-12345678').status, 'refunded');
});

test('repeat and concurrent scheduled recoveries remain idempotent', async () => {
  const backend = new RecoveryBackend([staleRequest({ requestId: 'repeat-12345678' })]);

  const [first, second] = await Promise.all([recover(backend), recover(backend)]);
  const third = await recover(backend);

  assert.equal(first.recovered + second.recovered, 1);
  assert.equal(third.recovered, 0);
  assert.equal(backend.rows.get('repeat-12345678').day_reserved, 0);
  assert.equal(backend.rows.get('repeat-12345678').month_reserved, 0);
});

test('a conflicting user cannot release another user request', async () => {
  const backend = new RecoveryBackend([staleRequest({ requestId: 'conflict-12345678', userId: USER_B })]);
  const originalFetch = backend.fetch.bind(backend);
  backend.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/rest/v1/ai_requests')) {
      return json([{ ...staleRequest({ requestId: 'conflict-12345678', userId: USER_A }) }]);
    }
    return originalFetch(url, options);
  };

  const summary = await recover(backend);

  assert.deepEqual(summary, { scanned: 1, recovered: 0, skipped: 1, failed: 0 });
  assert.equal(backend.rows.get('conflict-12345678').status, 'processing');
  assert.equal(backend.rows.get('conflict-12345678').day_reserved, 1);
});

test('a failed RPC does not stop later stale recovery items', async () => {
  const backend = new RecoveryBackend([
    staleRequest({ requestId: 'failure-12345678' }),
    staleRequest({ requestId: 'later-12345678' })
  ], { failRequestIds: ['failure-12345678'] });

  const summary = await recover(backend);

  assert.deepEqual(summary, { scanned: 2, recovered: 1, skipped: 0, failed: 1 });
  assert.equal(backend.rows.get('failure-12345678').status, 'processing');
  assert.equal(backend.rows.get('later-12345678').status, 'refunded');
});

test('a failed recovery RPC emits no per-request diagnostic or sensitive value', async () => {
  const backend = new RecoveryBackend([staleRequest({ requestId: 'quiet-failure-12345678' })], {
    failRequestIds: ['quiet-failure-12345678']
  });
  const info = [];
  const errors = [];
  const previousInfo = console.info;
  const previousError = console.error;
  console.info = (...args) => info.push(args);
  console.error = (...args) => errors.push(args);
  try {
    await recover(backend);
  } finally {
    console.info = previousInfo;
    console.error = previousError;
  }

  assert.equal(errors.length, 0);
  const serialized = JSON.stringify(info);
  assert.match(serialized, /scanned|failed|duration_ms/);
  assert.doesNotMatch(serialized, /quiet-failure-12345678|11111111-1111-4111-8111-111111111111|resume|token|secret/i);
});

test('one run reads only approved metadata, orders by updated_at, and caps work at 50 items', async () => {
  const rows = Array.from({ length: 51 }, (_, index) => staleRequest({
    requestId: `batch-${String(index).padStart(8, '0')}`,
    ageMs: TTL_MS + 1 + index
  }));
  const backend = new RecoveryBackend(rows);

  const summary = await recover(backend);
  const url = backend.listUrls[0];

  assert.equal(summary.scanned, 50);
  assert.equal(backend.recoveryCalls.length, 50);
  assert.equal(url.searchParams.get('select'), 'request_id,user_id,status,updated_at');
  assert.equal(url.searchParams.get('order'), 'updated_at.asc');
  assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.get('status'), 'in.(reserved,processing)');
  assert.equal(backend.providerCalls, 0);
});

test('scheduled recovery runs while the public platform switch is false and its logs contain aggregate values only', async () => {
  const backend = new RecoveryBackend([staleRequest({ requestId: 'scheduled-12345678' })]);
  const logged = [];
  const previousInfo = console.info;
  const previousFetch = globalThis.fetch;
  console.info = (...args) => logged.push(args);
  globalThis.fetch = backend.fetch.bind(backend);
  try {
    const waited = [];
    await worker.default.scheduled({}, ENV, {
      waitUntil(promise) { waited.push(promise); }
    });
    await Promise.all(waited);
  } finally {
    console.info = previousInfo;
    globalThis.fetch = previousFetch;
  }

  assert.equal(backend.rows.get('scheduled-12345678').status, 'refunded');
  const serialized = JSON.stringify(logged);
  assert.match(serialized, /scanned/);
  assert.doesNotMatch(serialized, /scheduled-12345678|11111111-1111-4111-8111-111111111111|resume|token|secret/i);
  assert.equal(backend.providerCalls, 0);
});

test('unsafe timing configuration refuses recovery before any database or model request', async () => {
  const backend = new RecoveryBackend([staleRequest({ requestId: 'unsafe-12345678' })]);
  const summary = await recover(backend, { ...ENV, MODEL_TIMEOUT_MS: '300000' });

  assert.deepEqual(summary, {
    scanned: 0,
    recovered: 0,
    skipped: 0,
    failed: 1,
    errorCode: 'STALE_RECOVERY_TIMING_UNSAFE'
  });
  assert.equal(backend.listUrls.length, 0);
  assert.equal(backend.recoveryCalls.length, 0);
  assert.equal(backend.providerCalls, 0);
  assert.equal(worker.isStaleRecoveryTimingSafe(120000), true);
  assert.equal(worker.isStaleRecoveryTimingSafe(300000), false);
});
