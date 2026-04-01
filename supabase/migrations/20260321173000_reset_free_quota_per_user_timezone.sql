create or replace function public.resolve_timezone_name(p_timezone text)
returns text
language plpgsql
stable
as $$
declare
    v_timezone text := nullif(trim(p_timezone), '');
begin
    if v_timezone is null then
        return 'Europe/Paris';
    end if;

    if exists (
        select 1
        from pg_timezone_names
        where name = v_timezone
    ) then
        return v_timezone;
    end if;

    return 'Europe/Paris';
end;
$$;
create or replace function public.local_midnight_after(p_day date, p_timezone text)
returns timestamptz
language sql
stable
as $$
    select make_timestamptz(
        extract(year from p_day + 1)::int,
        extract(month from p_day + 1)::int,
        extract(day from p_day + 1)::int,
        0, 0, 0,
        public.resolve_timezone_name(p_timezone)
    );
$$;
create or replace function public.get_access_state(p_device_id text, p_timezone text default 'Europe/Paris')
returns jsonb
language plpgsql
security definer
as $$
declare
    v_now timestamptz := now();
    v_timezone text := public.resolve_timezone_name(p_timezone);
    v_today date := (v_now at time zone v_timezone)::date;
    v_license public.license_keys%rowtype;
    v_access_mode text := 'free';
    v_subscription_active boolean := false;
    v_expires_at timestamptz := null;
    v_limit integer := 10;
    v_used integer := 0;
    v_remaining integer := 10;
    v_window_end timestamptz := null;
begin
    insert into public.device_activations (device_id, last_seen_at)
    values (p_device_id, v_now)
    on conflict (device_id)
    do update set last_seen_at = excluded.last_seen_at;

    select lk.*
      into v_license
      from public.device_activations da
      join public.license_keys lk on lk.id = da.license_key_id
     where da.device_id = p_device_id
       and lk.is_active = true
     order by case when lk.license_type = 'admin' then 0 else 1 end, lk.created_at desc
     limit 1;

    if found then
        if v_license.license_type = 'admin' then
            v_access_mode := 'admin';
            v_limit := null;
            v_used := null;
            v_remaining := null;
        elsif v_license.license_type = 'premium'
          and v_license.expires_at is not null
          and v_license.expires_at > v_now then
            v_access_mode := 'premium';
            v_subscription_active := true;
            v_expires_at := v_license.expires_at;
            v_limit := null;
            v_used := null;
            v_remaining := null;
        end if;
    end if;

    if v_access_mode = 'free' then
        select diu.used_count
          into v_used
          from public.daily_injection_usage diu
         where diu.device_id = p_device_id
           and diu.usage_date = v_today
         limit 1;

        if not found then
            v_used := 0;
        end if;

        v_window_end := public.local_midnight_after(v_today, v_timezone);
        v_remaining := greatest(v_limit - v_used, 0);
    end if;

    return jsonb_build_object(
        'access_mode', v_access_mode,
        'subscription_active', v_subscription_active,
        'expires_at', v_expires_at,
        'daily_injection_limit', v_limit,
        'daily_injection_used', v_used,
        'daily_injection_remaining', v_remaining,
        'daily_injection_resets_at', v_window_end,
        'ads_enabled', (v_access_mode = 'free')
    );
end;
$$;
create or replace function public.activate_license(p_device_id text, p_license_key text, p_timezone text default 'Europe/Paris')
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
create or replace function public.consume_injection(p_device_id text, p_timezone text default 'Europe/Paris')
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
