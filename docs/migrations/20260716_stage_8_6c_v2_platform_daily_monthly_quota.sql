-- Jian Gang Pei AI - Stage 8.6C V2 platform-AI daily/monthly quota.
-- Non-destructive: legacy user_quota, paid credits and V1 RPCs stay intact.
-- Do not run this file from the browser. It is for a Supabase administrator.
-- V2 policy: Asia/Shanghai natural day = 5 successes; natural month = 30
-- successes; accepted requests = 2 per rolling 60 seconds. Reservations older
-- than five minutes are automatically refunded during the same user's next
-- V2 reservation. Five minutes is intentionally greater than Worker's maximum
-- 120-second model timeout.

begin;

alter table public.ai_requests
  add column if not exists quota_policy text null,
  add column if not exists quota_day_start date null,
  add column if not exists quota_month_start date null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_requests_v2_quota_period_check'
      and conrelid = 'public.ai_requests'::regclass
  ) then
    alter table public.ai_requests
      add constraint ai_requests_v2_quota_period_check check (
        quota_policy is null
        or (
          quota_policy = 'daily_monthly_v2'
          and quota_day_start is not null
          and quota_month_start is not null
          and quota_month_start = date_trunc('month', quota_month_start::timestamp)::date
          and quota_day_start >= quota_month_start
          and quota_day_start < (quota_month_start + interval '1 month')::date
        )
      ) not valid;
  end if;
end $$;

create table if not exists public.platform_ai_quota_periods (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_kind text not null check (period_kind in ('day', 'month')),
  period_start date not null,
  reserved_count integer not null default 0,
  success_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_kind, period_start),
  constraint platform_ai_quota_periods_reserved_nonnegative_check check (reserved_count >= 0),
  constraint platform_ai_quota_periods_success_nonnegative_check check (success_count >= 0)
);

alter table public.platform_ai_quota_periods enable row level security;
revoke all on table public.platform_ai_quota_periods from public, anon, authenticated;

create index if not exists platform_ai_quota_periods_user_updated_idx
  on public.platform_ai_quota_periods (user_id, updated_at desc);

create index if not exists ai_requests_v2_rate_window_idx
  on public.ai_requests (user_id, created_at desc)
  where quota_policy = 'daily_monthly_v2';

create index if not exists ai_requests_v2_stale_idx
  on public.ai_requests (user_id, updated_at)
  where quota_policy = 'daily_monthly_v2'
    and status in ('reserved', 'processing');

-- This function is deliberately idempotent. It only adjusts the period rows
-- recorded on the request at reservation time, never the period containing now().
create function public.refund_platform_ai_quota_v2(
  p_request_id text,
  p_user_id uuid,
  p_error_code text,
  p_output_chars integer default 0,
  p_duration_ms integer default 0,
  p_provider_status integer default null
)
returns table (
  outcome text,
  request_status text,
  daily_limit integer,
  daily_success_count integer,
  daily_reserved_count integer,
  daily_remaining integer,
  monthly_limit integer,
  monthly_success_count integer,
  monthly_reserved_count integer,
  monthly_remaining integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.ai_requests%rowtype;
  v_day_success integer := 0;
  v_day_reserved integer := 0;
  v_month_success integer := 0;
  v_month_reserved integer := 0;
begin
  if p_request_id is null or length(p_request_id) < 8 or length(p_request_id) > 128
     or p_user_id is null then
    raise exception 'invalid V2 refund input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-ai-user:' || p_user_id::text, 0));

  select r.* into v_request
  from public.ai_requests as r
  where r.request_id = p_request_id
  for update;

  if not found or v_request.user_id <> p_user_id or v_request.quota_policy <> 'daily_monthly_v2' then
    outcome := 'request_id_conflict';
    request_status := null;
    return next;
    return;
  end if;

  if v_request.status = 'success' then
    outcome := 'already_success';
  elsif v_request.status = 'refunded' then
    outcome := 'already_refunded';
  elsif v_request.status not in ('reserved', 'processing', 'failed') then
    outcome := 'invalid_state';
  else
    select success_count, reserved_count into strict v_day_success, v_day_reserved
    from public.platform_ai_quota_periods
    where user_id = p_user_id and period_kind = 'day' and period_start = v_request.quota_day_start
    for update;

    select success_count, reserved_count into strict v_month_success, v_month_reserved
    from public.platform_ai_quota_periods
    where user_id = p_user_id and period_kind = 'month' and period_start = v_request.quota_month_start
    for update;

    if v_day_reserved < 1 or v_month_reserved < 1 then
      raise exception 'V2 reserved count is inconsistent' using errcode = '23514';
    end if;

    update public.platform_ai_quota_periods
    set reserved_count = reserved_count - 1, updated_at = now()
    where user_id = p_user_id
      and ((period_kind = 'day' and period_start = v_request.quota_day_start)
        or (period_kind = 'month' and period_start = v_request.quota_month_start));

    update public.ai_requests
    set status = 'refunded',
        error_code = left(coalesce(p_error_code, 'UNKNOWN_ERROR'), 80),
        output_chars = greatest(coalesce(p_output_chars, 0), 0),
        duration_ms = greatest(coalesce(p_duration_ms, 0), 0),
        provider_status = p_provider_status,
        failed_at = coalesce(failed_at, now()),
        refunded_at = coalesce(refunded_at, now()),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = v_request.id;
    outcome := 'refunded';
  end if;

  select success_count, reserved_count into strict v_day_success, v_day_reserved
  from public.platform_ai_quota_periods
  where user_id = p_user_id and period_kind = 'day' and period_start = v_request.quota_day_start;
  select success_count, reserved_count into strict v_month_success, v_month_reserved
  from public.platform_ai_quota_periods
  where user_id = p_user_id and period_kind = 'month' and period_start = v_request.quota_month_start;

  request_status := case when outcome = 'refunded' then 'refunded' else v_request.status end;
  daily_limit := 5;
  daily_success_count := v_day_success;
  daily_reserved_count := v_day_reserved;
  daily_remaining := greatest(5 - v_day_success - v_day_reserved, 0);
  monthly_limit := 30;
  monthly_success_count := v_month_success;
  monthly_reserved_count := v_month_reserved;
  monthly_remaining := greatest(30 - v_month_success - v_month_reserved, 0);
  return next;
end;
$$;

create function public.reserve_platform_ai_quota_v2(
  p_request_id text,
  p_user_id uuid,
  p_model text,
  p_input_chars integer
)
returns table (
  outcome text,
  request_status text,
  daily_limit integer,
  daily_success_count integer,
  daily_reserved_count integer,
  daily_remaining integer,
  monthly_limit integer,
  monthly_success_count integer,
  monthly_reserved_count integer,
  monthly_remaining integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.ai_requests%rowtype;
  v_stale_request record;
  v_now timestamptz := now();
  v_shanghai_now timestamp := now() at time zone 'Asia/Shanghai';
  v_day_start date;
  v_month_start date;
  v_day_success integer := 0;
  v_day_reserved integer := 0;
  v_month_success integer := 0;
  v_month_reserved integer := 0;
  v_recent_count integer := 0;
begin
  if p_request_id is null or length(p_request_id) < 8 or length(p_request_id) > 128 then
    raise exception 'invalid request id' using errcode = '22023';
  end if;
  if p_user_id is null or p_input_chars is null or p_input_chars < 1 then
    raise exception 'invalid V2 reservation input' using errcode = '22023';
  end if;

  -- This lock makes a cross-user duplicate requestId resolve to the generic
  -- conflict outcome instead of racing the unique constraint. The user lock
  -- below remains the authority for stale recovery, rate and period counters.
  perform pg_advisory_xact_lock(hashtextextended('platform-ai-request:' || p_request_id, 0));

  -- One user lock is the authority for stale recovery, rolling rate and both period counters.
  perform pg_advisory_xact_lock(hashtextextended('platform-ai-user:' || p_user_id::text, 0));

  -- An accepted request can take at most 120 seconds in Worker. A five-minute TTL
  -- avoids reclaiming a live request while making recovery automatic on next reserve.
  for v_stale_request in
    select r.request_id
    from public.ai_requests as r
    where r.user_id = p_user_id
      and r.quota_policy = 'daily_monthly_v2'
      and r.status in ('reserved', 'processing')
      and r.updated_at < v_now - interval '5 minutes'
    order by r.updated_at
    for update
  loop
    perform public.refund_platform_ai_quota_v2(
      v_stale_request.request_id, p_user_id, 'STALE_RESERVATION_TIMEOUT', 0, 0, null
    );
  end loop;

  select r.* into v_request
  from public.ai_requests as r
  where r.request_id = p_request_id
  for update;

  if found then
    if v_request.user_id <> p_user_id or v_request.quota_policy <> 'daily_monthly_v2' then
      outcome := 'request_id_conflict';
      request_status := null;
      return next;
      return;
    elsif v_request.status = 'success' then
      outcome := 'already_completed';
    elsif v_request.status in ('reserved', 'processing') then
      outcome := 'in_progress';
    else
      outcome := 'retry_with_new_request_id';
    end if;

    select success_count, reserved_count into strict v_day_success, v_day_reserved
    from public.platform_ai_quota_periods
    where user_id = p_user_id and period_kind = 'day' and period_start = v_request.quota_day_start;
    select success_count, reserved_count into strict v_month_success, v_month_reserved
    from public.platform_ai_quota_periods
    where user_id = p_user_id and period_kind = 'month' and period_start = v_request.quota_month_start;
    request_status := v_request.status;
    daily_limit := 5;
    daily_success_count := v_day_success;
    daily_reserved_count := v_day_reserved;
    daily_remaining := greatest(5 - v_day_success - v_day_reserved, 0);
    monthly_limit := 30;
    monthly_success_count := v_month_success;
    monthly_reserved_count := v_month_reserved;
    monthly_remaining := greatest(30 - v_month_success - v_month_reserved, 0);
    return next;
    return;
  end if;

  select count(*) into v_recent_count
  from public.ai_requests as r
  where r.user_id = p_user_id
    and r.quota_policy = 'daily_monthly_v2'
    and r.created_at >= v_now - interval '60 seconds';
  if v_recent_count >= 2 then
    outcome := 'rate_limited';
    return next;
    return;
  end if;

  v_day_start := v_shanghai_now::date;
  v_month_start := date_trunc('month', v_shanghai_now)::date;
  insert into public.platform_ai_quota_periods (user_id, period_kind, period_start)
  values
    (p_user_id, 'day', v_day_start),
    (p_user_id, 'month', v_month_start)
  on conflict (user_id, period_kind, period_start) do nothing;

  select success_count, reserved_count into strict v_day_success, v_day_reserved
  from public.platform_ai_quota_periods
  where user_id = p_user_id and period_kind = 'day' and period_start = v_day_start
  for update;
  select success_count, reserved_count into strict v_month_success, v_month_reserved
  from public.platform_ai_quota_periods
  where user_id = p_user_id and period_kind = 'month' and period_start = v_month_start
  for update;

  if v_day_success + v_day_reserved >= 5 then
    outcome := 'daily_limit_exhausted';
  elsif v_month_success + v_month_reserved >= 30 then
    outcome := 'monthly_limit_exhausted';
  else
    update public.platform_ai_quota_periods
    set reserved_count = reserved_count + 1, updated_at = now()
    where user_id = p_user_id
      and ((period_kind = 'day' and period_start = v_day_start)
        or (period_kind = 'month' and period_start = v_month_start));

    insert into public.ai_requests (
      request_id, user_id, status, quota_type, quota_policy,
      quota_day_start, quota_month_start, model, input_chars, reserved_at, updated_at
    ) values (
      p_request_id, p_user_id, 'reserved', 'free', 'daily_monthly_v2',
      v_day_start, v_month_start, p_model, p_input_chars, v_now, v_now
    );
    outcome := 'reserved';
    request_status := 'reserved';
  end if;

  select success_count, reserved_count into strict v_day_success, v_day_reserved
  from public.platform_ai_quota_periods
  where user_id = p_user_id and period_kind = 'day' and period_start = v_day_start;
  select success_count, reserved_count into strict v_month_success, v_month_reserved
  from public.platform_ai_quota_periods
  where user_id = p_user_id and period_kind = 'month' and period_start = v_month_start;
  daily_limit := 5;
  daily_success_count := v_day_success;
  daily_reserved_count := v_day_reserved;
  daily_remaining := greatest(5 - v_day_success - v_day_reserved, 0);
  monthly_limit := 30;
  monthly_success_count := v_month_success;
  monthly_reserved_count := v_month_reserved;
  monthly_remaining := greatest(30 - v_month_success - v_month_reserved, 0);
  return next;
end;
$$;

create function public.mark_platform_ai_request_processing_v2(
  p_request_id text,
  p_user_id uuid
)
returns table (outcome text, request_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.ai_requests%rowtype;
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'invalid V2 processing input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-ai-user:' || p_user_id::text, 0));
  select r.* into v_request from public.ai_requests as r where r.request_id = p_request_id for update;
  if not found or v_request.user_id <> p_user_id or v_request.quota_policy <> 'daily_monthly_v2' then
    outcome := 'request_id_conflict'; request_status := null;
  elsif v_request.status = 'reserved' then
    update public.ai_requests
    set status = 'processing', processing_at = now(), updated_at = now()
    where id = v_request.id;
    outcome := 'processing'; request_status := 'processing';
  elsif v_request.status = 'processing' then
    outcome := 'already_processing'; request_status := 'processing';
  else
    outcome := 'invalid_state'; request_status := v_request.status;
  end if;
  return next;
end;
$$;

create function public.finalize_platform_ai_request_success_v2(
  p_request_id text,
  p_user_id uuid,
  p_schema_version text,
  p_output_chars integer,
  p_duration_ms integer,
  p_provider_status integer
)
returns table (
  outcome text,
  request_status text,
  daily_limit integer,
  daily_success_count integer,
  daily_reserved_count integer,
  daily_remaining integer,
  monthly_limit integer,
  monthly_success_count integer,
  monthly_reserved_count integer,
  monthly_remaining integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.ai_requests%rowtype;
  v_day_success integer := 0;
  v_day_reserved integer := 0;
  v_month_success integer := 0;
  v_month_reserved integer := 0;
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'invalid V2 finalization input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-ai-user:' || p_user_id::text, 0));
  select r.* into v_request from public.ai_requests as r where r.request_id = p_request_id for update;
  if not found or v_request.user_id <> p_user_id or v_request.quota_policy <> 'daily_monthly_v2' then
    outcome := 'request_id_conflict'; request_status := null;
    return next; return;
  elsif v_request.status = 'success' then
    outcome := 'already_success';
  elsif v_request.status <> 'processing' then
    outcome := 'invalid_state';
  else
    select success_count, reserved_count into strict v_day_success, v_day_reserved
    from public.platform_ai_quota_periods
    where user_id = p_user_id and period_kind = 'day' and period_start = v_request.quota_day_start
    for update;
    select success_count, reserved_count into strict v_month_success, v_month_reserved
    from public.platform_ai_quota_periods
    where user_id = p_user_id and period_kind = 'month' and period_start = v_request.quota_month_start
    for update;
    if v_day_reserved < 1 or v_month_reserved < 1 then
      raise exception 'V2 reserved count is inconsistent' using errcode = '23514';
    end if;
    update public.platform_ai_quota_periods
    set reserved_count = reserved_count - 1,
        success_count = success_count + 1,
        updated_at = now()
    where user_id = p_user_id
      and ((period_kind = 'day' and period_start = v_request.quota_day_start)
        or (period_kind = 'month' and period_start = v_request.quota_month_start));
    update public.ai_requests
    set status = 'success', schema_version = p_schema_version,
        output_chars = greatest(coalesce(p_output_chars, 0), 0),
        duration_ms = greatest(coalesce(p_duration_ms, 0), 0),
        provider_status = p_provider_status, error_code = null,
        completed_at = now(), updated_at = now()
    where id = v_request.id;
    outcome := 'success';
  end if;

  select success_count, reserved_count into strict v_day_success, v_day_reserved
  from public.platform_ai_quota_periods
  where user_id = p_user_id and period_kind = 'day' and period_start = v_request.quota_day_start;
  select success_count, reserved_count into strict v_month_success, v_month_reserved
  from public.platform_ai_quota_periods
  where user_id = p_user_id and period_kind = 'month' and period_start = v_request.quota_month_start;
  request_status := case when outcome in ('success', 'already_success') then 'success' else v_request.status end;
  daily_limit := 5;
  daily_success_count := v_day_success;
  daily_reserved_count := v_day_reserved;
  daily_remaining := greatest(5 - v_day_success - v_day_reserved, 0);
  monthly_limit := 30;
  monthly_success_count := v_month_success;
  monthly_reserved_count := v_month_reserved;
  monthly_remaining := greatest(30 - v_month_success - v_month_reserved, 0);
  return next;
end;
$$;

create function public.recover_stale_platform_ai_request_v2(
  p_request_id text,
  p_user_id uuid
)
returns table (outcome text, request_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.ai_requests%rowtype;
  v_refund record;
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'invalid V2 recovery input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-ai-user:' || p_user_id::text, 0));
  select r.* into v_request from public.ai_requests as r where r.request_id = p_request_id for update;
  if not found or v_request.user_id <> p_user_id or v_request.quota_policy <> 'daily_monthly_v2' then
    outcome := 'request_id_conflict'; request_status := null;
  elsif v_request.status = 'refunded' then
    outcome := 'already_refunded'; request_status := 'refunded';
  elsif v_request.status = 'success' then
    outcome := 'already_success'; request_status := 'success';
  elsif v_request.status in ('reserved', 'processing')
        and v_request.updated_at < now() - interval '5 minutes' then
    select * into v_refund
    from public.refund_platform_ai_quota_v2(
      p_request_id, p_user_id, 'STALE_RESERVATION_TIMEOUT', 0, 0, null
    );
    outcome := v_refund.outcome; request_status := v_refund.request_status;
  else
    outcome := 'not_stale'; request_status := v_request.status;
  end if;
  return next;
end;
$$;

-- V2 RPCs are Worker-only. Browser roles and public have no execute privilege.
revoke all on function public.reserve_platform_ai_quota_v2(text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.mark_platform_ai_request_processing_v2(text, uuid) from public, anon, authenticated;
revoke all on function public.finalize_platform_ai_request_success_v2(text, uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.refund_platform_ai_quota_v2(text, uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.recover_stale_platform_ai_request_v2(text, uuid) from public, anon, authenticated;

grant execute on function public.reserve_platform_ai_quota_v2(text, uuid, text, integer) to service_role;
grant execute on function public.mark_platform_ai_request_processing_v2(text, uuid) to service_role;
grant execute on function public.finalize_platform_ai_request_success_v2(text, uuid, text, integer, integer, integer) to service_role;
grant execute on function public.refund_platform_ai_quota_v2(text, uuid, text, integer, integer, integer) to service_role;
grant execute on function public.recover_stale_platform_ai_request_v2(text, uuid) to service_role;

commit;
