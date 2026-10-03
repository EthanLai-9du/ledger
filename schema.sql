-- =====================================================================
--  个人提升计划 · Growth Ledger —— Supabase 数据库结构
-- ---------------------------------------------------------------------
--  使用方法：
--    1. 打开 Supabase Dashboard → 选择项目 qgqfbouvhbenjgcrstyz
--    2. 左侧菜单 SQL Editor → New query
--    3. 把本文件全部内容粘贴进去 → 点击右下角 Run
--    4. 看到 "Success. No rows returned" 即完成。本脚本可重复执行（幂等）。
--
--  设计说明：
--    前端 app.js 的数据本来就是「一整份」JSON 文档：
--      { version, motto, areas[], habits[], goals[{tasks[]}], log{ 'YYYY-MM-DD': [habitId…] } }
--    并且整份校验（validate）、整份导入 / 导出。因此这里采用
--    「每个用户一行、data 存整份 jsonb」的设计：
--      · 和前端模型一一对应，离线优先时只需比较 / 覆盖一份文档，不会出现半同步；
--      · 一个学期的数据通常只有几十 KB，远小于单行上限；
--      · rev 版本号由数据库触发器自增，前端用「rev 相等才更新」做乐观锁，
--        防止两台设备互相覆盖；updated_at 记录「用户最后一次修改」的时间（来自客户端），
--        用来在冲突时判断哪份更新。
-- =====================================================================

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  rev        bigint      not null default 1,          -- 服务器版本号，每次 update 自动 +1
  updated_at timestamptz not null default now(),      -- 用户最后修改时间（客户端写入）
  synced_at  timestamptz not null default now(),      -- 服务器最后写入时间（触发器写入）
  device     text,                                    -- 最后写入的设备描述（可选，仅供参考）
  constraint user_state_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint user_state_data_size      check (pg_column_size(data) < 2 * 1024 * 1024)  -- 单份数据 < 2 MB
);

comment on table  public.user_state            is '个人提升计划：每个用户一份完整的计划数据（JSON 文档）';
comment on column public.user_state.data       is '与前端 localStorage 中 growth-plan:v1 结构一致';
comment on column public.user_state.rev        is '乐观锁版本号，由触发器自增';
comment on column public.user_state.updated_at is '用户在客户端最后一次修改的时间';
comment on column public.user_state.synced_at  is '服务器收到写入的时间';

-- 触发器：每次更新自动 rev + 1、刷新 synced_at；且不允许修改 user_id
create or replace function public.user_state_bump()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.rev     := old.rev + 1;
  else
    new.rev     := 1;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists user_state_bump on public.user_state;
create trigger user_state_bump
  before insert or update on public.user_state
  for each row execute function public.user_state_bump();

-- ---------------------------------------------------------------------
--  行级安全（RLS）：每个人只能读写自己的那一行
-- ---------------------------------------------------------------------
alter table public.user_state enable row level security;

drop policy if exists "user_state: 仅本人可读"   on public.user_state;
drop policy if exists "user_state: 仅本人可新建" on public.user_state;
drop policy if exists "user_state: 仅本人可修改" on public.user_state;
drop policy if exists "user_state: 仅本人可删除" on public.user_state;

create policy "user_state: 仅本人可读"
  on public.user_state for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "user_state: 仅本人可新建"
  on public.user_state for insert to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "user_state: 仅本人可修改"
  on public.user_state for update to authenticated
  using      ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "user_state: 仅本人可删除"
  on public.user_state for delete to authenticated
  using ( (select auth.uid()) = user_id );

-- 权限：未登录的 anon 角色完全不能访问；登录用户只有增删改查（再由 RLS 限定到本人）
revoke all on public.user_state from anon;
grant select, insert, update, delete on public.user_state to authenticated;

-- ---------------------------------------------------------------------
--  （可选）自检：在 SQL Editor 里运行下面这句，应返回 rowsecurity = true
--  select relname, relrowsecurity as rowsecurity from pg_class where relname = 'user_state';
-- ---------------------------------------------------------------------
