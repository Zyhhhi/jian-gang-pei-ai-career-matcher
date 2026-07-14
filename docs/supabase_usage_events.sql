-- 简岗配 AI｜阶段 5 匿名行为埋点表
-- 只保存匿名行为数据，不保存简历原文、完整 JD、API Key、手机号、邮箱、姓名、身份证或截图内容。

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_user_id text,
  user_id text null,
  event_type text not null,
  api_mode text null,
  job_category text null,
  success boolean default true,
  duration_ms integer null,
  metadata jsonb null,
  created_at timestamptz default now()
);

alter table public.usage_events enable row level security;

drop policy if exists "anon can insert usage events" on public.usage_events;

create policy "anon can insert usage events"
on public.usage_events
for insert
to anon
with check (true);

-- 不要给 anon role 添加 select 全表策略。
-- 后续查看正式数据时，使用 Supabase 后台、管理端或服务端权限。

-- Stage 8 platform AI event types:
-- platform_api_request
-- platform_api_success
-- platform_api_failed
-- quota_used
-- quota_exhausted
-- rate_limited
-- text_too_long
-- deepseek_parse_failed
-- duplicate_request
--
-- metadata may contain only non-sensitive fields such as aiMode, errorCode,
-- matchScoreRange, applyRecommendation, quotaType, durationMs,
-- hasResumeProfile, and hasConfirmedJD.
-- Do not store resume text, full JD text, API Key, phone, email, real name,
-- screenshot base64, image files, or the raw DeepSeek request.