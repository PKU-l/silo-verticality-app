-- ═══════════════════════════════════════════════════════════════
-- 001_silo_sync.sql — 筒仓垂直度观测：同步表与同步函数
-- 在 Supabase → SQL Editor 里执行一次即可；可重复执行（幂等）。
--
-- 设计：
--   · 所有观测数据以“键 + 版本号 + JSON 内容”存放在 silo_sync_items；
--   · 网页不直接读写表（RLS 全部拒绝 anon），只能调用两个函数；
--   · 两个函数都要求“同步口令”，口令只保存在 silo_sync_secret（anon 不可读）；
--   · 版本号不一致时返回冲突与服务器副本，由网页提示人工核对，不静默覆盖。
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- 1. 数据表
create table if not exists public.silo_sync_items (
  key         text primary key,                 -- 如 plumbObs:abc123
  version     integer not null default 0,
  data        jsonb,                            -- null 表示已删除（墓碑）
  updated_at  timestamptz not null default now()
);

-- 2. 口令表（只存哈希）
create table if not exists public.silo_sync_secret (
  id          integer primary key default 1 check (id = 1),
  token_hash  text not null
);

-- 3. RLS：禁止 anon / authenticated 直接访问两张表
alter table public.silo_sync_items  enable row level security;
alter table public.silo_sync_secret enable row level security;
revoke all on public.silo_sync_items  from anon, authenticated;
revoke all on public.silo_sync_secret from anon, authenticated;

-- 4. 口令校验
create or replace function public.silo_sync_check(p_token text)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.silo_sync_secret
    where token_hash = crypt(coalesce(p_token, ''), token_hash)
  );
$$;
revoke all on function public.silo_sync_check(text) from public, anon, authenticated;

-- 5. 拉取：返回全部条目
create or replace function public.silo_sync_pull(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if not public.silo_sync_check(p_token) then
    raise exception '同步口令不正确' using errcode = '28000';
  end if;
  return jsonb_build_object('items', coalesce(
    (select jsonb_agg(jsonb_build_object('key', key, 'version', version, 'data', data)) from public.silo_sync_items), '[]'::jsonb));
end;
$$;

-- 6. 上传：逐条按版本号比对，一致则写入并版本 +1，否则返回冲突
create or replace function public.silo_sync_push(p_token text, p_changes jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  ch       jsonb;
  cur      public.silo_sync_items%rowtype;
  cur_v    integer;
  results  jsonb := '[]'::jsonb;
begin
  if not public.silo_sync_check(p_token) then
    raise exception '同步口令不正确' using errcode = '28000';
  end if;
  if jsonb_array_length(coalesce(p_changes, '[]'::jsonb)) > 2000 then
    raise exception '单次上传条数过多';
  end if;
  for ch in select * from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    select * into cur from public.silo_sync_items where key = ch->>'key' for update;
    cur_v := coalesce(cur.version, 0);
    if (ch->>'baseVersion')::integer is distinct from cur_v then
      results := results || jsonb_build_object('key', ch->>'key', 'conflict', true,
        'server', jsonb_build_object('version', cur_v, 'data', cur.data));
    else
      insert into public.silo_sync_items(key, version, data, updated_at)
        values (ch->>'key', cur_v + 1, ch->'data', now())
      on conflict (key) do update set version = excluded.version, data = excluded.data, updated_at = now();
      results := results || jsonb_build_object('key', ch->>'key', 'ok', true, 'version', cur_v + 1);
    end if;
  end loop;
  return jsonb_build_object('results', results);
end;
$$;

grant execute on function public.silo_sync_pull(text)        to anon, authenticated;
grant execute on function public.silo_sync_push(text, jsonb) to anon, authenticated;

-- 7. 设置同步口令（执行前把下面的“请改成你的口令”替换掉；以后改口令再执行这一句即可）
insert into public.silo_sync_secret (id, token_hash)
values (1, crypt('请改成你的口令', gen_salt('bf')))
on conflict (id) do update set token_hash = excluded.token_hash;
