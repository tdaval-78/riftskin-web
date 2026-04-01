create extension if not exists pgcrypto;
create table if not exists public.license_keys (
    id uuid primary key default gen_random_uuid(),
    license_key text not null unique,
    license_type text not null check (license_type in ('premium', 'admin')),
    source text not null check (source in ('lemonsqueezy', 'manual')),
    is_active boolean not null default true,
    expires_at timestamptz null,
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create table if not exists public.device_activations (
    id uuid primary key default gen_random_uuid(),
    device_id text not null unique,
    license_key_id uuid null references public.license_keys(id) on delete set null,
    last_seen_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create table if not exists public.daily_injection_usage (
    id uuid primary key default gen_random_uuid(),
    device_id text not null,
    window_start timestamptz not null,
    window_end timestamptz not null,
    used_count integer not null default 0 check (used_count >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (device_id, window_start, window_end)
);
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;
drop trigger if exists trg_license_keys_updated_at on public.license_keys;
create trigger trg_license_keys_updated_at
before update on public.license_keys
for each row execute function public.set_updated_at();
drop trigger if exists trg_device_activations_updated_at on public.device_activations;
create trigger trg_device_activations_updated_at
before update on public.device_activations
for each row execute function public.set_updated_at();
drop trigger if exists trg_daily_injection_usage_updated_at on public.daily_injection_usage;
create trigger trg_daily_injection_usage_updated_at
before update on public.daily_injection_usage
for each row execute function public.set_updated_at();
create or replace function public.get_access_state(p_device_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
    v_now timestamptz := now();
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
        select diu.used_count, diu.window_end
          into v_used, v_window_end
          from public.daily_injection_usage diu
         where diu.device_id = p_device_id
           and diu.window_end > v_now
         order by diu.window_end desc
         limit 1;

        if not found then
            v_used := 0;
            v_window_end := v_now + interval '24 hours';
        end if;

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
create or replace function public.activate_license(p_device_id text, p_license_key text)
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
     where license_key = upper(trim(p_license_key))
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

    return jsonb_build_object('ok', true, 'state', public.get_access_state(p_device_id));
end;
$$;
create or replace function public.consume_injection(p_device_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
    v_now timestamptz := now();
    v_state jsonb;
    v_limit integer;
    v_used integer;
    v_remaining integer;
    v_window_end timestamptz;
    v_window_start timestamptz;
begin
    v_state := public.get_access_state(p_device_id);

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

    select window_start, window_end
      into v_window_start, v_window_end
      from public.daily_injection_usage
     where device_id = p_device_id
       and window_end > v_now
     order by window_end desc
     limit 1;

    if not found then
        v_window_start := v_now;
        v_window_end := v_now + interval '24 hours';
        insert into public.daily_injection_usage(device_id, window_start, window_end, used_count)
        values (p_device_id, v_window_start, v_window_end, 1);
        v_used := 1;
    else
        update public.daily_injection_usage
           set used_count = used_count + 1
         where device_id = p_device_id
           and window_start = v_window_start
           and window_end = v_window_end;
        v_used := v_used + 1;
    end if;

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
