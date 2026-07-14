-- 简岗配 AI｜阶段 7 Supabase Auth + 平台 AI 额度表
-- user_id 对应 auth.users.id。
-- 本阶段只做登录、额度查询和初始化；真实扣减必须在阶段 8 Cloudflare Worker 中完成。

create table if not exists public.user_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  platform_free_total integer default 3,
  platform_free_used integer default 0,
  platform_paid_credits integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_quota enable row level security;

drop policy if exists "users can read own quota" on public.user_quota;
drop policy if exists "users can insert own quota" on public.user_quota;

create policy "users can read own quota"
on public.user_quota
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can insert own quota"
on public.user_quota
for insert
to authenticated
with check (
  auth.uid() = user_id
  and platform_free_total = 3
  and platform_free_used = 0
  and platform_paid_credits = 0
);

-- 不要给普通 authenticated 用户开放 paid_credits 更新权限。
-- 后续支付成功后的 paid_credits 增加，应由 Cloudflare Worker 或管理端使用服务端权限完成。
-- 后续真实分析时的 free_used / paid_credits 扣减，也必须由 Cloudflare Worker 校验登录、额度和限流后执行。
