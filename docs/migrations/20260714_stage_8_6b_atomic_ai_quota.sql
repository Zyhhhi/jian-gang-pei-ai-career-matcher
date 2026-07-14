-- Jian Gang Pei AI - Stage 8.6B atomic platform-AI quota migration.
-- Non-destructive: existing tables and rows are retained.
-- Run after docs/supabase_auth_quota.sql and docs/supabase_ai_requests.sql.

begin;

alter table public.ai_requests
  add column if not exists reserved_at timestamptz null,
  add column if not exists processing_at timestamptz null,
  add column if not exists failed_at timestamptz null,
  add column if not exists refunded_at timestamptz null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists schema_version text null,
  add column if not exists duration_ms integer null,
  add column if not exists provider_status integer null;

update public.ai_requests
set reserved_at = coalesce(reserved_at, created_at),
    processing_at = case
      when status in ('processing', 'success', 'failed') then coalesce(processing_at, created_at)
      else processing_at
    end,
    failed_at = case
      when status = 'failed' then coalesce(failed_at, completed_at, created_at)
      else failed_at
    end,
    updated_at = coalesce(updated_at, completed_at, created_at, now())
where reserved_at is null
   or updated_at is null
   or (status in ('processing', 'success', 'failed') and processing_at is null)
   or (status = 'failed' and failed_at is null);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_quota_nonnegative_check'
      and conrelid = 'public.user_quota'::regclass
  ) then
    alter table public.user_quota
      add constraint user_quota_nonnegative_check check (
        platform_free_total >= 0
        and platform_free_used >= 0
        and platform_free_used <= platform_free_total
        and platform_paid_credits >= 0
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_requests_status_check'
      and conrelid = 'public.ai_requests'::regclass
  ) then
    alter table public.ai_requests
      add constraint ai_requests_status_check check (
        status in ('reserved', 'processing', 'success', 'failed', 'refunded')
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_requests_quota_type_check'
      and conrelid = 'public.ai_requests'::regclass
  ) then
    alter table public.ai_requests
      add constraint ai_requests_quota_type_check check (
        quota_type is null or quota_type in ('free', 'paid', 'none')
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_requests_metrics_nonnegative_check'
      and conrelid = 'public.ai_requests'::regclass
  ) then
    alter table public.ai_requests
      add constraint ai_requests_metrics_nonnegative_check check (
        coalesce(input_chars, 0) >= 0
        and coalesce(output_chars, 0) >= 0
        and coalesce(duration_ms, 0) >= 0
      ) not valid;
  end if;
end $$;

alter table public.user_quota validate constraint user_quota_nonnegative_check;
alter table public.ai_requests validate constraint ai_requests_status_check;
alter table public.ai_requests validate constraint ai_requests_quota_type_check;
alter table public.ai_requests validate constraint ai_requests_metrics_nonnegative_check;

create index if not exists ai_requests_stale_state_idx
  on public.ai_requests (status, updated_at)
  where status in ('reserved', 'processing', 'failed');

create or replace function public.reserve_ai_quota(
  p_request_id text,
  p_user_id uuid,
  p_model text,
  p_input_chars integer
)
returns table (
  outcome text,
  request_status text,
  reserved_quota_type text,
  platform_free_total integer,
  platform_free_used integer,
  platform_free_remaining integer,
  platform_paid_credits integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.ai_requests%rowtype;
  v_quota public.user_quota%rowtype;
  v_quota_type text;
begin
  if p_request_id is null or length(p_request_id) < 8 or length(p_request_id) > 128 then
    raise exception 'invalid request id' using errcode = '22023';
  end if;
  if p_user_id is null or p_input_chars is null or p_input_chars < 1 then
    raise exception 'invalid reservation input' using errcode = '22023';
  end if;

  -- Serializes the same requestId, including attempts made by another user.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id, 0));

  select * into v_request
  from public.ai_requests
  where request_id = p_request_id;

  if found then
    if v_request.user_id <> p_user_id then
      outcome := 'request_id_conflict';
    elsif v_request.status = 'success' then
      outcome := 'already_completed';
    elsif v_request.status in ('reserved', 'processing') then
      outcome := 'in_progress';
    else
      outcome := 'retry_with_new_request_id';
    end if;
    request_status := v_request.status;
    reserved_quota_type := v_request.quota_type;

    select * into v_quota from public.user_quota where user_id = p_user_id;
    platform_free_total := coalesce(v_quota.platform_free_total, 3);
    platform_free_used := coalesce(v_quota.platform_free_used, 0);
    platform_free_remaining := greatest(platform_free_total - platform_free_used, 0);
    platform_paid_credits := coalesce(v_quota.platform_paid_credits, 0);
    return next;
    return;
  end if;

  insert into public.user_quota (
    user_id, platform_free_total, platform_free_used, platform_paid_credits
  ) values (p_user_id, 3, 0, 0)
  on conflict (user_id) do nothing;

  -- Serializes all quota reservations for this user.
  select * into strict v_quota
  from public.user_quota
  where user_id = p_user_id
  for update;

  if v_quota.platform_free_used < v_quota.platform_free_total then
    v_quota_type := 'free';
    update public.user_quota
    set platform_free_used = platform_free_used + 1,
        updated_at = now()
    where user_id = p_user_id
    returning * into v_quota;
  elsif v_quota.platform_paid_credits > 0 then
    v_quota_type := 'paid';
    update public.user_quota
    set platform_paid_credits = platform_paid_credits - 1,
        updated_at = now()
    where user_id = p_user_id
    returning * into v_quota;
  else
    outcome := 'no_quota';
    request_status := null;
    reserved_quota_type := 'none';
    platform_free_total := v_quota.platform_free_total;
    platform_free_used := v_quota.platform_free_used;
    platform_free_remaining := greatest(v_quota.platform_free_total - v_quota.platform_free_used, 0);
    platform_paid_credits := v_quota.platform_paid_credits;
    return next;
    return;
  end if;

  insert into public.ai_requests (
    request_id, user_id, status, quota_type, model, input_chars,
    reserved_at, updated_at
  ) values (
    p_request_id, p_user_id, 'reserved', v_quota_type, p_model, p_input_chars,
    now(), now()
  );

  outcome := 'reserved';
  request_status := 'reserved';
  reserved_quota_type := v_quota_type;
  platform_free_total := v_quota.platform_free_total;
  platform_free_used := v_quota.platform_free_used;
  platform_free_remaining := greatest(v_quota.platform_free_total - v_quota.platform_free_used, 0);
  platform_paid_credits := v_quota.platform_paid_credits;
  return next;
end;
$$;

create or replace function public.mark_ai_request_processing(
  p_request_id text,
  p_user_id uuid
)
returns table (outcome text, request_status text, reserved_quota_type text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.ai_requests%rowtype;
begin
  select * into v_request
  from public.ai_requests
  where request_id = p_request_id
  for update;

  if not found or v_request.user_id <> p_user_id then
    outcome := 'not_found'; request_status := null; reserved_quota_type := null;
  elsif v_request.status = 'reserved' then
    update public.ai_requests
    set status = 'processing', processing_at = now(), updated_at = now()
    where id = v_request.id;
    outcome := 'processing'; request_status := 'processing'; reserved_quota_type := v_request.quota_type;
  elsif v_request.status = 'processing' then
    outcome := 'already_processing'; request_status := 'processing'; reserved_quota_type := v_request.quota_type;
  else
    outcome := 'invalid_state'; request_status := v_request.status; reserved_quota_type := v_request.quota_type;
  end if;
  return next;
end;
$$;

create or replace function public.finalize_ai_request_success(
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
  consumed_quota_type text,
  platform_free_total integer,
  platform_free_used integer,
  platform_free_remaining integer,
  platform_paid_credits integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.ai_requests%rowtype;
  v_quota public.user_quota%rowtype;
begin
  select * into v_request
  from public.ai_requests
  where request_id = p_request_id
  for update;

  if not found or v_request.user_id <> p_user_id then
    outcome := 'not_found'; request_status := null; consumed_quota_type := null;
  elsif v_request.status = 'success' then
    outcome := 'already_success'; request_status := 'success'; consumed_quota_type := v_request.quota_type;
  elsif v_request.status <> 'processing' then
    outcome := 'invalid_state'; request_status := v_request.status; consumed_quota_type := v_request.quota_type;
  else
    update public.ai_requests
    set status = 'success', schema_version = p_schema_version,
        output_chars = greatest(coalesce(p_output_chars, 0), 0),
        duration_ms = greatest(coalesce(p_duration_ms, 0), 0),
        provider_status = p_provider_status,
        completed_at = now(), updated_at = now(), error_code = null
    where id = v_request.id;
    outcome := 'success'; request_status := 'success'; consumed_quota_type := v_request.quota_type;
  end if;

  select * into v_quota from public.user_quota where user_id = p_user_id;
  platform_free_total := coalesce(v_quota.platform_free_total, 3);
  platform_free_used := coalesce(v_quota.platform_free_used, 0);
  platform_free_remaining := greatest(platform_free_total - platform_free_used, 0);
  platform_paid_credits := coalesce(v_quota.platform_paid_credits, 0);
  return next;
end;
$$;

create or replace function public.refund_ai_quota(
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
  refunded_quota_type text,
  platform_free_total integer,
  platform_free_used integer,
  platform_free_remaining integer,
  platform_paid_credits integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.ai_requests%rowtype;
  v_quota public.user_quota%rowtype;
begin
  select * into v_request
  from public.ai_requests
  where request_id = p_request_id
  for update;

  if not found or v_request.user_id <> p_user_id then
    outcome := 'not_found'; request_status := null; refunded_quota_type := null;
    return next; return;
  elsif v_request.status = 'refunded' then
    outcome := 'already_refunded'; request_status := 'refunded'; refunded_quota_type := v_request.quota_type;
  elsif v_request.status = 'success' then
    outcome := 'already_success'; request_status := 'success'; refunded_quota_type := v_request.quota_type;
  elsif v_request.status not in ('reserved', 'processing', 'failed') then
    outcome := 'invalid_state'; request_status := v_request.status; refunded_quota_type := v_request.quota_type;
  else
    update public.ai_requests
    set status = 'failed', error_code = left(coalesce(p_error_code, 'UNKNOWN_ERROR'), 80),
        output_chars = greatest(coalesce(p_output_chars, 0), 0),
        duration_ms = greatest(coalesce(p_duration_ms, 0), 0),
        provider_status = p_provider_status,
        failed_at = coalesce(failed_at, now()), updated_at = now()
    where id = v_request.id;

    select * into strict v_quota
    from public.user_quota
    where user_id = p_user_id
    for update;

    if v_request.quota_type = 'free' then
      update public.user_quota
      set platform_free_used = greatest(platform_free_used - 1, 0), updated_at = now()
      where user_id = p_user_id
      returning * into v_quota;
    elsif v_request.quota_type = 'paid' then
      update public.user_quota
      set platform_paid_credits = platform_paid_credits + 1, updated_at = now()
      where user_id = p_user_id
      returning * into v_quota;
    else
      raise exception 'request has no refundable quota type' using errcode = '22023';
    end if;

    update public.ai_requests
    set status = 'refunded', refunded_at = now(), completed_at = now(), updated_at = now()
    where id = v_request.id;

    outcome := 'refunded'; request_status := 'refunded'; refunded_quota_type := v_request.quota_type;
  end if;

  select * into v_quota from public.user_quota where user_id = p_user_id;
  platform_free_total := coalesce(v_quota.platform_free_total, 3);
  platform_free_used := coalesce(v_quota.platform_free_used, 0);
  platform_free_remaining := greatest(platform_free_total - platform_free_used, 0);
  platform_paid_credits := coalesce(v_quota.platform_paid_credits, 0);
  return next;
end;
$$;

create or replace function public.recover_stale_ai_request(
  p_request_id text,
  p_user_id uuid,
  p_stale_before timestamptz
)
returns table (outcome text, request_status text, refunded_quota_type text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.ai_requests%rowtype;
  v_refund record;
begin
  select * into v_request
  from public.ai_requests
  where request_id = p_request_id
  for update;

  if not found or v_request.user_id <> p_user_id then
    outcome := 'not_found'; request_status := null; refunded_quota_type := null;
  elsif v_request.status not in ('reserved', 'processing', 'failed') then
    outcome := 'not_stale_state'; request_status := v_request.status; refunded_quota_type := v_request.quota_type;
  elsif v_request.updated_at >= p_stale_before then
    outcome := 'not_stale'; request_status := v_request.status; refunded_quota_type := v_request.quota_type;
  else
    select * into v_refund
    from public.refund_ai_quota(
      p_request_id, p_user_id, 'STALE_REQUEST_RECOVERED',
      coalesce(v_request.output_chars, 0), coalesce(v_request.duration_ms, 0), v_request.provider_status
    );
    outcome := v_refund.outcome;
    request_status := v_refund.request_status;
    refunded_quota_type := v_refund.refunded_quota_type;
  end if;
  return next;
end;
$$;

revoke all on function public.reserve_ai_quota(text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.mark_ai_request_processing(text, uuid) from public, anon, authenticated;
revoke all on function public.finalize_ai_request_success(text, uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.refund_ai_quota(text, uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.recover_stale_ai_request(text, uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.reserve_ai_quota(text, uuid, text, integer) to service_role;
grant execute on function public.mark_ai_request_processing(text, uuid) to service_role;
grant execute on function public.finalize_ai_request_success(text, uuid, text, integer, integer, integer) to service_role;
grant execute on function public.refund_ai_quota(text, uuid, text, integer, integer, integer) to service_role;
grant execute on function public.recover_stale_ai_request(text, uuid, timestamptz) to service_role;

commit;

-- Rollback guidance (run only after the Worker has been rolled back):
-- drop function if exists public.recover_stale_ai_request(text, uuid, timestamptz);
-- drop function if exists public.refund_ai_quota(text, uuid, text, integer, integer, integer);
-- drop function if exists public.finalize_ai_request_success(text, uuid, text, integer, integer, integer);
-- drop function if exists public.mark_ai_request_processing(text, uuid);
-- drop function if exists public.reserve_ai_quota(text, uuid, text, integer);
-- alter table public.ai_requests drop constraint if exists ai_requests_metrics_nonnegative_check;
-- alter table public.ai_requests drop constraint if exists ai_requests_quota_type_check;
-- alter table public.ai_requests drop constraint if exists ai_requests_status_check;
-- alter table public.user_quota drop constraint if exists user_quota_nonnegative_check;
-- The added nullable audit columns may be retained safely; dropping them would discard audit data.
