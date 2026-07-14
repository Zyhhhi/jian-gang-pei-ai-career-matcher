// Deprecated Stage 0/legacy entry.
// Do not deploy this file for platform AI.
// Stage 8 platform AI must use worker/index.js so Supabase auth, quota checks,
// requestId de-duplication, rate limiting, and backend-only DeepSeek secrets are
// enforced before any model call.

export default {
  async fetch() {
    return new Response(JSON.stringify({
      success: false,
      errorCode: 'LEGACY_WORKER_DISABLED',
      message: 'Use worker/index.js for the Stage 8 platform AI Worker.'
    }), {
      status: 410,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
};
