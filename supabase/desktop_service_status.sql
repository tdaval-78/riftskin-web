-- RiftSkin desktop service status
-- Run in Supabase SQL editor (project: bvajoufrxxntivxghdgs)

create table if not exists public.app_service_status (
  channel text primary key,
  injection_state text not null check (injection_state in ('ok', 'maintenance')),
  service_message text,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_service_status enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_service_status'
      and policyname = 'app_service_status_admin_all'
  ) then
    drop policy app_service_status_admin_all on public.app_service_status;
  end if;

  create policy app_service_status_admin_all on public.app_service_status
    for all using (public.is_app_admin(auth.uid()))
    with check (public.is_app_admin(auth.uid()));
end $$;

create or replace function public.get_public_service_status(p_channel text default 'stable')
returns table(
  channel text,
  injection_state text,
  service_message text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.channel,
    s.injection_state,
    s.service_message,
    s.published_at,
    s.updated_at
  from public.app_service_status s
  where s.channel = coalesce(nullif(trim(p_channel), ''), 'stable')
  limit 1;
$$;

create or replace function public.set_public_service_status(
  p_channel text default 'stable',
  p_injection_state text default 'maintenance',
  p_service_message text default null
)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin uuid := auth.uid();
  v_channel text := coalesce(nullif(trim(p_channel), ''), 'stable');
  v_state text := lower(coalesce(nullif(trim(p_injection_state), ''), 'maintenance'));
  v_message text := nullif(trim(coalesce(p_service_message, '')), '');
begin
  if v_admin is null then
    return query select false, 'not_authenticated';
    return;
  end if;

  if not public.is_app_admin(v_admin) then
    return query select false, 'not_admin';
    return;
  end if;

  if v_state not in ('ok', 'maintenance') then
    v_state := 'maintenance';
  end if;

  insert into public.app_service_status (
    channel,
    injection_state,
    service_message,
    published_at,
    updated_at,
    updated_by
  ) values (
    v_channel,
    v_state,
    v_message,
    now(),
    now(),
    v_admin
  )
  on conflict (channel)
  do update set
    injection_state = excluded.injection_state,
    service_message = excluded.service_message,
    published_at = now(),
    updated_at = now(),
    updated_by = v_admin;

  return query select true, 'published';
end;
$$;

grant execute on function public.get_public_service_status(text) to authenticated, anon;
grant execute on function public.set_public_service_status(text, text, text) to authenticated;

insert into public.app_service_status (channel, injection_state, service_message)
values (
  'stable',
  'maintenance',
  'Nos developpeurs travaillent actuellement sur une mise a jour afin de contourner le nouveau patch Riot.'
)
on conflict (channel)
do nothing;
