create or replace function public.admin_subscription_license_audit()
returns table(
  customer_email text,
  subscription_active boolean,
  subscription_status text,
  subscription_current_period_ends_at timestamptz,
  activation_key_code text,
  activation_key_active boolean,
  license_key_active boolean,
  machine_license_active boolean,
  machine_activation_count bigint,
  anomaly boolean,
  anomaly_reason text
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
    with license_activity as (
      select
        lk.id as license_key_id,
        lk.license_key,
        lk.is_active as license_key_active,
        lk.expires_at as license_key_expires_at,
        count(da.id)::bigint as machine_activation_count
      from public.license_keys lk
      left join public.device_activations da on da.license_key_id = lk.id
      where lk.license_type = 'premium'
      group by lk.id, lk.license_key, lk.is_active, lk.expires_at
    ),
    ranked_subscriptions as (
      select
        ss.*,
        row_number() over (
          partition by lower(trim(ss.customer_email))
          order by
            case
              when lower(trim(ss.status)) in ('active', 'trialing') then 0
              when lower(trim(ss.status)) in ('canceled', 'cancelled', 'past_due', 'paused', 'unpaid')
                and ss.current_period_ends_at is not null
                and ss.current_period_ends_at > now() then 1
              else 2
            end,
            coalesce(ss.updated_at, ss.created_at) desc,
            ss.id desc
        ) as email_rank
      from public.stripe_subscriptions ss
    ),
    latest_subscriptions as (
      select *
      from ranked_subscriptions
      where email_rank = 1
    ),
    subscription_rows as (
      select
        coalesce(nullif(trim(ls.customer_email), ''), nullif(trim(ak.created_for_email), ''), '-')::text as customer_email,
        case
          when lower(trim(coalesce(ls.status, ''))) in ('active', 'trialing') then true
          when lower(trim(coalesce(ls.status, ''))) in ('canceled', 'cancelled', 'past_due', 'paused', 'unpaid')
            and ls.current_period_ends_at is not null
            and ls.current_period_ends_at > now() then true
          else false
        end as subscription_active,
        lower(trim(coalesce(ls.status, '')))::text as subscription_status,
        ls.current_period_ends_at as subscription_current_period_ends_at,
        ak.code::text as activation_key_code,
        coalesce(ak.is_active, false) as activation_key_active,
        coalesce(la.license_key_active, false) as license_key_active,
        (
          coalesce(la.license_key_active, false)
          and coalesce(la.machine_activation_count, 0) > 0
          and (la.license_key_expires_at is null or la.license_key_expires_at > now())
        ) as machine_license_active,
        coalesce(la.machine_activation_count, 0)::bigint as machine_activation_count,
        (
          coalesce(la.license_key_active, false)
          and coalesce(la.machine_activation_count, 0) > 0
          and (la.license_key_expires_at is null or la.license_key_expires_at > now())
          and not (
            case
              when lower(trim(coalesce(ls.status, ''))) in ('active', 'trialing') then true
              when lower(trim(coalesce(ls.status, ''))) in ('canceled', 'cancelled', 'past_due', 'paused', 'unpaid')
                and ls.current_period_ends_at is not null
                and ls.current_period_ends_at > now() then true
              else false
            end
          )
        ) as anomaly,
        case
          when
            coalesce(la.license_key_active, false)
            and coalesce(la.machine_activation_count, 0) > 0
            and (la.license_key_expires_at is null or la.license_key_expires_at > now())
            and not (
              case
                when lower(trim(coalesce(ls.status, ''))) in ('active', 'trialing') then true
                when lower(trim(coalesce(ls.status, ''))) in ('canceled', 'cancelled', 'past_due', 'paused', 'unpaid')
                  and ls.current_period_ends_at is not null
                  and ls.current_period_ends_at > now() then true
                else false
              end
            )
          then 'machine_active_without_subscription'
          else 'none'
        end::text as anomaly_reason
      from latest_subscriptions ls
      left join public.activation_keys ak on ak.id = ls.activation_key_id
      left join license_activity la on la.license_key = ak.code
    ),
    machine_only_rows as (
      select
        coalesce(nullif(trim(ak.created_for_email), ''), '-')::text as customer_email,
        false as subscription_active,
        'missing'::text as subscription_status,
        null::timestamptz as subscription_current_period_ends_at,
        coalesce(ak.code, la.license_key)::text as activation_key_code,
        coalesce(ak.is_active, false) as activation_key_active,
        coalesce(la.license_key_active, false) as license_key_active,
        (
          coalesce(la.license_key_active, false)
          and coalesce(la.machine_activation_count, 0) > 0
          and (la.license_key_expires_at is null or la.license_key_expires_at > now())
        ) as machine_license_active,
        coalesce(la.machine_activation_count, 0)::bigint as machine_activation_count,
        (
          coalesce(la.license_key_active, false)
          and coalesce(la.machine_activation_count, 0) > 0
          and (la.license_key_expires_at is null or la.license_key_expires_at > now())
        ) as anomaly,
        case
          when
            coalesce(la.license_key_active, false)
            and coalesce(la.machine_activation_count, 0) > 0
            and (la.license_key_expires_at is null or la.license_key_expires_at > now())
          then 'machine_active_without_subscription'
          else 'none'
        end::text as anomaly_reason
      from license_activity la
      left join public.activation_keys ak on ak.code = la.license_key
      left join latest_subscriptions ls on ls.activation_key_id = ak.id
      where coalesce(la.machine_activation_count, 0) > 0
        and ls.activation_key_id is null
    )
    select
      rows.customer_email,
      rows.subscription_active,
      rows.subscription_status,
      rows.subscription_current_period_ends_at,
      rows.activation_key_code,
      rows.activation_key_active,
      rows.license_key_active,
      rows.machine_license_active,
      rows.machine_activation_count,
      rows.anomaly,
      rows.anomaly_reason
    from (
      select * from subscription_rows
      union all
      select * from machine_only_rows
    ) rows
    order by rows.anomaly desc, rows.machine_license_active desc, lower(rows.customer_email), rows.activation_key_code nulls last;
end;
$$;

grant execute on function public.admin_subscription_license_audit() to authenticated;
