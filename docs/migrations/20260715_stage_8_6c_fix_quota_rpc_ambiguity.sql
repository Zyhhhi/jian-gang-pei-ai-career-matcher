-- Jian Gang Pei AI - Stage 8.6C quota RPC ambiguity repair.
-- Safe to run after 20260714_stage_8_6b_atomic_ai_quota.sql.
-- Replaces functions only; it does not change quota values or request rows.

begin;

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

  perform pg_advisory_xact_lock(hashtextextended(p_request_id, 0));

  select r.* into v_request
  from public.ai_requests as r
  where r.request_id = p_request_id;

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

    select q.* into v_quota
    from public.user_quota as q
    where q.user_id = p_user_id;
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

  select q.* into strict v_quota
  from public.user_quota as q
  where q.user_id = p_user_id
  for update;

  if v_quota.platform_free_used < v_quota.platform_free_total then
    v_quota_type := 'free';
    update public.user_quota as q
    set platform_free_used = q.platform_free_used + 1,
        updated_at = now()
    where q.user_id = p_user_id
    returning q.* into v_quota;
  elsif v_quota.platform_paid_credits > 0 then
    v_quota_type := 'paid';
    update public.user_quota as q
    set platform_paid_credits = q.platform_paid_credits - 1,
        updated_at = now()
    where q.user_id = p_user_id
    returning q.* into v_quota;
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
  select r.* into v_request
  from public.ai_requests as r
  where r.request_id = p_request_id
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
    update public.ai_requests as r
    set status = 'failed', error_code = left(coalesce(p_error_code, 'UNKNOWN_ERROR'), 80),
        output_chars = greatest(coalesce(p_output_chars, 0), 0),
        duration_ms = greatest(coalesce(p_duration_ms, 0), 0),
        provider_status = p_provider_status,
        failed_at = coalesce(r.failed_at, now()), updated_at = now()
    where r.id = v_request.id;

    select q.* into strict v_quota
    from public.user_quota as q
    where q.user_id = p_user_id
    for update;

    if v_request.quota_type = 'free' then
      update public.user_quota as q
      set platform_free_used = greatest(q.platform_free_used - 1, 0), updated_at = now()
      where q.user_id = p_user_id
      returning q.* into v_quota;
    elsif v_request.quota_type = 'paid' then
      update public.user_quota as q
      set platform_paid_credits = q.platform_paid_credits + 1, updated_at = now()
      where q.user_id = p_user_id
      returning q.* into v_quota;
    else
      raise exception 'request has no refundable quota type' using errcode = '22023';
    end if;

    update public.ai_requests as r
    set status = 'refunded', refunded_at = now(), completed_at = now(), updated_at = now()
    where r.id = v_request.id;

    outcome := 'refunded'; request_status := 'refunded'; refunded_quota_type := v_request.quota_type;
  end if;

  select q.* into v_quota
  from public.user_quota as q
  where q.user_id = p_user_id;
  platform_free_total := coalesce(v_quota.platform_free_total, 3);
  platform_free_used := coalesce(v_quota.platform_free_used, 0);
  platform_free_remaining := greatest(platform_free_total - platform_free_used, 0);
  platform_paid_credits := coalesce(v_quota.platform_paid_credits, 0);
  return next;
end;
$$;

revoke all on function public.reserve_ai_quota(text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.refund_ai_quota(text, uuid, text, integer, integer, integer) from public, anon, authenticated;

grant execute on function public.reserve_ai_quota(text, uuid, text, integer) to service_role;
grant execute on function public.refund_ai_quota(text, uuid, text, integer, integer, integer) to service_role;

commit;
