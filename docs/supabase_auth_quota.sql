-- 简岗配 AI｜历史阶段 7 Supabase Auth + 平台 AI 额度表
-- user_id 对应 auth.users.id。
-- Stage 8.6C-A: 以下 legacy quota 字段仅为兼容已有 schema 保留，均已 deprecated。
-- 前端不得读取、初始化、展示或依赖 platform_free_total、platform_free_used、platform_paid_credits。
-- 后续免费每日/月度计数必须通过新的非破坏性 schema 与 service-role-only 逻辑实现。

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

-- 不要给普通 authenticated 用户开放 legacy quota 字段更新权限。
-- 历史 paid_credits 增加路径已废弃；不得新增客户端写入或依赖。
-- 后续真实分析次数必须由 Cloudflare Worker 校验登录、每日/月度限制和限流后执行。

-- Stage 8.6B does not grant update access to browser roles. After this base
-- table exists, run docs/migrations/20260714_stage_8_6b_atomic_ai_quota.sql.
-- The migration adds nonnegative constraints and service-role-only transaction
-- RPCs for reserve, finalize and refund. Do not update quota directly in the frontend.
