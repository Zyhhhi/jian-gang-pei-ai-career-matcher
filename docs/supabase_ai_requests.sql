-- 简岗配 AI｜阶段 8 平台 AI 请求记录表
-- 用于 requestId 去重、防重复扣费、限流统计和错误审计。
-- 不保存简历原文、完整 JD、API Key 或 DeepSeek 原始请求全文。

create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  quota_type text null,
  model text null,
  input_chars integer null,
  output_chars integer null,
  error_code text null,
  created_at timestamptz default now(),
  completed_at timestamptz null
);

alter table public.ai_requests enable row level security;

drop policy if exists "users can read own ai requests" on public.ai_requests;

create policy "users can read own ai requests"
on public.ai_requests
for select
to authenticated
using (auth.uid() = user_id);

-- 不给前端 authenticated / anon role 写入或更新 ai_requests 的权限。
-- ai_requests 的 insert / update 应由 Cloudflare Worker 使用 service role 执行。
-- request_id unique 可防止同一请求重复扣费。

-- Stage 8 parse failure policy:
-- If DeepSeek returns non-JSON or JSON extraction fails, Worker returns
-- DEEPSEEK_PARSE_FAILED to the frontend, records ai_requests.status = failed,
-- records ai_requests.error_code = PARSE_FAILED, and does not deduct quota.
-- Do not store the full raw model response in usage_events or ai_requests.

-- Stage 8.6B upgrade:
-- After creating this base table, run:
-- docs/migrations/20260714_stage_8_6b_atomic_ai_quota.sql
-- That migration retains existing rows and adds the reserved/processing/success/
-- failed/refunded state machine plus service-role-only atomic quota RPCs.
