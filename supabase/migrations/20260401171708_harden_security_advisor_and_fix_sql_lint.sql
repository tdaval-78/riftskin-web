alter table if exists public.license_keys enable row level security;
alter table if exists public.device_activations enable row level security;
alter table if exists public.daily_injection_usage enable row level security;
alter table if exists public.stripe_subscriptions enable row level security;
alter table if exists public.paddle_subscriptions enable row level security;

revoke all on table public.license_keys from anon, authenticated;
revoke all on table public.device_activations from anon, authenticated;
revoke all on table public.daily_injection_usage from anon, authenticated;
revoke all on table public.stripe_subscriptions from anon, authenticated;
revoke all on table public.paddle_subscriptions from anon, authenticated;

drop function if exists public.create_activation_key(text, text, integer, integer, integer);

create or replace function public.create_activation_key(
  p_for_email text default null,
  p_note text default null,
  p_max_uses integer default 1,
  p_valid_months integer default 1,
  p_grant_months integer default null,
  p_is_permanent boolean default false
)
returns table(code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_raw text;
  v_code text;
  v_key_exp timestamptz;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_app_admin(v_user) then
    raise exception 'Only admins can create activation keys';
  end if;

  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 500 then
    raise exception 'Invalid max uses (1-500)';
  end if;

  if not coalesce(p_is_permanent, false)
     and (p_valid_months is null or p_valid_months < 1 or p_valid_months > 120) then
    raise exception 'Invalid key validity months (1-120)';
  end if;

  if not coalesce(p_is_permanent, false)
     and p_grant_months is not null
     and (p_grant_months < 1 or p_grant_months > 120) then
    raise exception 'Invalid grant months (1-120)';
  end if;

  loop
    v_raw := upper(md5(random()::text || clock_timestamp()::text || coalesce(v_user::text, '')));
    v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4) || '-' || substr(v_raw, 13, 4);
    exit when not exists (select 1 from public.activation_keys ak where ak.code = v_code);
  end loop;

  if coalesce(p_is_permanent, false) then
    v_key_exp := null;
  else
    v_key_exp := now() + make_interval(months => p_valid_months);
  end if;

  insert into public.activation_keys (
    code,
    created_by,
    created_for_email,
    note,
    max_uses,
    grant_days,
    grant_months,
    valid_months,
    expires_at
  ) values (
    v_code,
    v_user,
    nullif(trim(p_for_email), ''),
    nullif(trim(p_note), ''),
    p_max_uses,
    case
      when coalesce(p_is_permanent, false) then null
      when p_grant_months is null then null
      else p_grant_months * 30
    end,
    case when coalesce(p_is_permanent, false) then null else p_grant_months end,
    case when coalesce(p_is_permanent, false) then null else p_valid_months end,
    v_key_exp
  );

  return query select v_code, v_key_exp;
end;
$$;

create or replace function public.admin_dashboard_summary()
returns table(
  total_accounts bigint,
  confirmed_accounts bigint,
  active_accounts bigint,
  expired_accounts bigint,
  no_access_accounts bigint,
  admin_accounts bigint,
  total_keys bigint,
  active_keys bigint,
  attached_keys bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_confirm_expr text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'email_confirmed_at'
  ) then
    v_confirm_expr := 'u.email_confirmed_at';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'confirmed_at'
  ) then
    v_confirm_expr := 'u.confirmed_at';
  else
    v_confirm_expr := 'null::timestamptz';
  end if;

  if not public.is_app_admin(auth.uid()) then
    raise exception 'not_admin';
  end if;

  return query execute format($sql$
    with account_states as (
      select
        u.id,
        %1$s as confirmed_marker,
        exists(select 1 from public.app_admins aa where aa.user_id = u.id) as is_admin,
        case
          when exists(select 1 from public.app_admins aa where aa.user_id = u.id) then 'admin'
          when ua.user_id is null or ua.is_active = false then 'no_access'
          when ua.expires_at is not null and ua.expires_at <= now() then 'expired'
          else 'active'
        end as access_state
      from auth.users u
      left join public.user_access ua on ua.user_id = u.id
    )
    select
      count(*)::bigint as total_accounts,
      count(*) filter (where confirmed_marker is not null)::bigint as confirmed_accounts,
      count(*) filter (where access_state = 'active')::bigint as active_accounts,
      count(*) filter (where access_state = 'expired')::bigint as expired_accounts,
      count(*) filter (where access_state = 'no_access')::bigint as no_access_accounts,
      count(*) filter (where is_admin = true)::bigint as admin_accounts,
      (select count(*)::bigint from public.activation_keys) as total_keys,
      (
        select count(*)::bigint
        from public.activation_keys ak
        where ak.is_active = true
          and (ak.expires_at is null or ak.expires_at > now())
          and ak.used_count < ak.max_uses
      ) as active_keys,
      (select count(*)::bigint from public.key_redemptions) as attached_keys
    from account_states
  $sql$, v_confirm_expr);
end;
$$;

create or replace function public.admin_list_accounts(
  p_search text default null,
  p_filter text default 'all'
)
returns table(
  user_id uuid,
  email text,
  username text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  is_admin boolean,
  access_state text,
  access_source text,
  access_granted_at timestamptz,
  access_expires_at timestamptz,
  latest_key_code text,
  latest_key_redeemed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_confirm_expr text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'email_confirmed_at'
  ) then
    v_confirm_expr := 'u.email_confirmed_at';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'confirmed_at'
  ) then
    v_confirm_expr := 'u.confirmed_at';
  else
    v_confirm_expr := 'null::timestamptz';
  end if;

  if not public.is_app_admin(auth.uid()) then
    raise exception 'not_admin';
  end if;

  return query execute format($sql$
    with rows as (
      select
        u.id as user_id,
        u.email::text as email,
        p.username::text as username,
        u.created_at,
        %1$s as email_confirmed_at,
        u.last_sign_in_at,
        exists(select 1 from public.app_admins aa where aa.user_id = u.id) as is_admin,
        case
          when exists(select 1 from public.app_admins aa where aa.user_id = u.id) then 'admin'
          when ua.user_id is null or ua.is_active = false then 'no_access'
          when ua.expires_at is not null and ua.expires_at <= now() then 'expired'
          else 'active'
        end as access_state,
        ua.source::text as access_source,
        ua.granted_at as access_granted_at,
        ua.expires_at as access_expires_at,
        lk.code::text as latest_key_code,
        lk.redeemed_at as latest_key_redeemed_at
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.user_access ua on ua.user_id = u.id
      left join lateral (
        select
          ak.code,
          kr.redeemed_at
        from public.key_redemptions kr
        join public.activation_keys ak on ak.id = kr.key_id
        where kr.user_id = u.id
        order by kr.redeemed_at desc
        limit 1
      ) lk on true
      where (
        coalesce(nullif(trim($1), ''), '') = ''
        or lower(coalesce(u.email, '')) like '%%' || lower(trim($1)) || '%%'
        or lower(coalesce(p.username, '')) like '%%' || lower(trim($1)) || '%%'
      )
    )
    select r.*
    from rows r
    where case lower(coalesce($2, 'all'))
      when 'active' then r.access_state = 'active'
      when 'expired' then r.access_state = 'expired'
      when 'no_access' then r.access_state = 'no_access'
      when 'admin' then r.access_state = 'admin'
      else true
    end
    order by
      case r.access_state
        when 'admin' then 0
        when 'active' then 1
        when 'expired' then 2
        else 3
      end,
      r.created_at desc
  $sql$, v_confirm_expr)
  using p_search, p_filter;
end;
$$;

create or replace function public.admin_list_activation_keys(
  p_search text default null,
  p_filter text default 'all'
)
returns table(
  code text,
  created_for_email text,
  note text,
  max_uses integer,
  used_count integer,
  created_at timestamptz,
  expires_at timestamptz,
  valid_months integer,
  grant_months integer,
  is_active boolean,
  availability_state text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'not_admin';
  end if;

  return query
    with rows as (
      select
        ak.code,
        ak.created_for_email,
        ak.note,
        ak.max_uses,
        ak.used_count,
        ak.created_at,
        ak.expires_at,
        ak.valid_months,
        ak.grant_months,
        ak.is_active,
        case
          when ak.is_active = false then 'inactive'
          when ak.expires_at is not null and ak.expires_at <= now() then 'expired'
          when ak.used_count >= ak.max_uses then 'consumed'
          else 'available'
        end as availability_state
      from public.activation_keys ak
      where (
        coalesce(nullif(trim(p_search), ''), '') = ''
        or lower(coalesce(ak.code, '')) like '%' || lower(trim(p_search)) || '%'
        or lower(coalesce(ak.created_for_email, '')) like '%' || lower(trim(p_search)) || '%'
        or lower(coalesce(ak.note, '')) like '%' || lower(trim(p_search)) || '%'
      )
    )
    select r.*
    from rows r
    where case lower(coalesce(p_filter, 'all'))
      when 'available' then r.availability_state = 'available'
      when 'consumed' then r.availability_state = 'consumed'
      when 'expired' then r.availability_state = 'expired'
      when 'inactive' then r.availability_state = 'inactive'
      else true
    end
    order by r.created_at desc
    limit 80;
end;
$$;

drop function if exists public.activate_license(text, text);
drop function if exists public.consume_injection(text);
drop function if exists public.get_access_state(text);

create or replace function public.activate_license(
  p_device_id text,
  p_license_key text,
  p_timezone text default 'Europe/Paris'
)
returns jsonb
language plpgsql
security definer
as $$
declare
    v_now timestamptz := now();
    v_license public.license_keys%rowtype;
begin
    select *
      into v_license
      from public.license_keys
     where upper(trim(license_key)) = upper(trim(p_license_key))
       and is_active = true
       and (
            license_type = 'admin'
            or (license_type = 'premium' and expires_at is not null and expires_at > v_now)
       )
     limit 1;

    if not found then
        return jsonb_build_object('ok', false, 'message', 'Invalid or expired license key');
    end if;

    insert into public.device_activations (device_id, license_key_id, last_seen_at)
    values (p_device_id, v_license.id, v_now)
    on conflict (device_id)
    do update set license_key_id = excluded.license_key_id,
                  last_seen_at = excluded.last_seen_at;

    return jsonb_build_object('ok', true, 'state', public.get_access_state(p_device_id, p_timezone));
end;
$$;

create or replace function public.consume_injection(
  p_device_id text,
  p_timezone text default 'Europe/Paris'
)
returns jsonb
language plpgsql
security definer
as $$
declare
    v_now timestamptz := now();
    v_timezone text := public.resolve_timezone_name(p_timezone);
    v_today date := (v_now at time zone v_timezone)::date;
    v_state jsonb;
    v_limit integer;
    v_used integer;
    v_remaining integer;
    v_window_end timestamptz;
begin
    v_state := public.get_access_state(p_device_id, v_timezone);

    if (v_state->>'access_mode') in ('premium', 'admin') then
        return jsonb_build_object('allowed', true, 'access_mode', v_state->>'access_mode');
    end if;

    v_limit := coalesce((v_state->>'daily_injection_limit')::integer, 10);
    v_used := coalesce((v_state->>'daily_injection_used')::integer, 0);
    v_remaining := coalesce((v_state->>'daily_injection_remaining')::integer, 10);
    v_window_end := (v_state->>'daily_injection_resets_at')::timestamptz;

    if v_remaining <= 0 then
        return jsonb_build_object(
            'allowed', false,
            'access_mode', 'free',
            'daily_injection_limit', v_limit,
            'daily_injection_used', v_used,
            'daily_injection_remaining', 0,
            'daily_injection_resets_at', v_window_end,
            'message', 'Daily injection limit reached'
        );
    end if;

    insert into public.daily_injection_usage(device_id, usage_date, used_count)
    values (p_device_id, v_today, 1)
    on conflict (device_id, usage_date)
    do update set used_count = public.daily_injection_usage.used_count + 1,
                  updated_at = now();

    select used_count
      into v_used
      from public.daily_injection_usage
     where device_id = p_device_id
       and usage_date = v_today
     limit 1;

    v_window_end := public.local_midnight_after(v_today, v_timezone);

    return jsonb_build_object(
        'allowed', true,
        'access_mode', 'free',
        'daily_injection_limit', v_limit,
        'daily_injection_used', v_used,
        'daily_injection_remaining', greatest(v_limit - v_used, 0),
        'daily_injection_resets_at', v_window_end
    );
end;
$$;
