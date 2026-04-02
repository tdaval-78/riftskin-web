alter table public.user_access
  drop constraint if exists user_access_source_check;

alter table public.user_access
  add constraint user_access_source_check
  check (source in ('activation_key', 'admin_grant', 'subscription_canceled'));

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
    v_access_source text := 'free';
    v_subscription_active boolean := false;
    v_expires_at timestamptz := null;
    v_limit integer := 10;
    v_used integer := 0;
    v_remaining integer := 10;
    v_window_end timestamptz := null;
    v_subscription_id text := null;
    v_stripe_subscription record;
    v_paddle_subscription record;
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
            v_access_source := 'admin';
            v_limit := null;
            v_used := null;
            v_remaining := null;
        elsif v_license.license_type = 'premium'
          and v_license.expires_at is not null
          and v_license.expires_at > v_now then
            v_access_mode := 'premium';
            v_access_source := 'subscription';
            v_subscription_active := true;
            v_expires_at := v_license.expires_at;
            v_limit := null;
            v_used := null;
            v_remaining := null;

            if v_license.notes like '[stripe-subscription:%]' then
                v_subscription_id := substring(v_license.notes from '\[stripe-subscription:([^\]]+)\]');
                if v_subscription_id is not null then
                    select ss.status,
                           ss.current_period_ends_at,
                           ss.canceled_at,
                           ss.raw
                      into v_stripe_subscription
                      from public.stripe_subscriptions ss
                     where ss.stripe_subscription_id = v_subscription_id
                     limit 1;

                    if found and (
                        coalesce((v_stripe_subscription.raw->>'cancel_at_period_end')::boolean, false)
                        or (v_stripe_subscription.raw ? 'cancel_at' and nullif(v_stripe_subscription.raw->>'cancel_at', '') is not null)
                        or v_stripe_subscription.canceled_at is not null
                        or lower(coalesce(v_stripe_subscription.status, '')) in ('canceled', 'cancelled')
                    ) and (
                        v_stripe_subscription.current_period_ends_at is null
                        or v_stripe_subscription.current_period_ends_at > v_now
                    ) then
                        v_access_source := 'subscription_canceled';
                    end if;
                end if;
            elsif v_license.notes like '[paddle-subscription:%]' then
                v_subscription_id := substring(v_license.notes from '\[paddle-subscription:([^\]]+)\]');
                if v_subscription_id is not null then
                    select ps.status,
                           ps.current_period_ends_at,
                           ps.canceled_at
                      into v_paddle_subscription
                      from public.paddle_subscriptions ps
                     where ps.paddle_subscription_id = v_subscription_id
                     limit 1;

                    if found and (
                        v_paddle_subscription.canceled_at is not null
                        or lower(coalesce(v_paddle_subscription.status, '')) in ('canceled', 'cancelled')
                    ) and (
                        v_paddle_subscription.current_period_ends_at is null
                        or v_paddle_subscription.current_period_ends_at > v_now
                    ) then
                        v_access_source := 'subscription_canceled';
                    end if;
                end if;
            end if;
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
        'access_source', v_access_source,
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
