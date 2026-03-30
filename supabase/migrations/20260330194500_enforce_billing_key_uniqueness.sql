create temporary table tmp_billing_key_dedupe_map (
  keep_id bigint not null,
  drop_id bigint not null primary key
) on commit drop;

insert into tmp_billing_key_dedupe_map (keep_id, drop_id)
with ranked as (
  select
    ak.id,
    ak.note,
    row_number() over (
      partition by ak.note
      order by
        case
          when exists (
            select 1
            from public.stripe_subscriptions ss
            where ss.activation_key_id = ak.id
          ) or exists (
            select 1
            from public.paddle_subscriptions ps
            where ps.activation_key_id = ak.id
          ) then 0
          else 1
        end,
        ak.is_active desc,
        ak.expires_at desc nulls last,
        ak.id desc
    ) as row_num,
    first_value(ak.id) over (
      partition by ak.note
      order by
        case
          when exists (
            select 1
            from public.stripe_subscriptions ss
            where ss.activation_key_id = ak.id
          ) or exists (
            select 1
            from public.paddle_subscriptions ps
            where ps.activation_key_id = ak.id
          ) then 0
          else 1
        end,
        ak.is_active desc,
        ak.expires_at desc nulls last,
        ak.id desc
    ) as keep_id
  from public.activation_keys ak
  where ak.note like '[paddle-subscription:%'
)
select keep_id, id
from ranked
where row_num > 1;

update public.activation_keys winner
set
  created_for_email = coalesce(winner.created_for_email, loser_summary.created_for_email),
  expires_at = coalesce(
    greatest(winner.expires_at, loser_summary.max_expires_at),
    winner.expires_at,
    loser_summary.max_expires_at
  ),
  is_active = winner.is_active or loser_summary.any_active
from (
  select
    map.keep_id,
    max(ak.expires_at) as max_expires_at,
    bool_or(ak.is_active) as any_active,
    max(ak.created_for_email) filter (where ak.created_for_email is not null and trim(ak.created_for_email) <> '') as created_for_email
  from tmp_billing_key_dedupe_map map
  join public.activation_keys ak on ak.id = map.drop_id
  group by map.keep_id
) as loser_summary
where winner.id = loser_summary.keep_id;

update public.stripe_subscriptions ss
set activation_key_id = map.keep_id
from tmp_billing_key_dedupe_map map
where ss.activation_key_id = map.drop_id;

update public.paddle_subscriptions ps
set activation_key_id = map.keep_id
from tmp_billing_key_dedupe_map map
where ps.activation_key_id = map.drop_id;

update public.user_access ua
set granted_by_key_id = map.keep_id
from tmp_billing_key_dedupe_map map
where ua.granted_by_key_id = map.drop_id;

insert into public.key_redemptions (key_id, user_id, redeemed_at)
select
  map.keep_id,
  kr.user_id,
  min(kr.redeemed_at) as redeemed_at
from tmp_billing_key_dedupe_map map
join public.key_redemptions kr on kr.key_id = map.drop_id
left join public.key_redemptions existing
  on existing.key_id = map.keep_id
 and existing.user_id = kr.user_id
where existing.id is null
group by map.keep_id, kr.user_id;

delete from public.key_redemptions kr
using tmp_billing_key_dedupe_map map
where kr.key_id = map.drop_id;

delete from public.activation_keys ak
using tmp_billing_key_dedupe_map map
where ak.id = map.drop_id;

create unique index if not exists activation_keys_billing_note_uidx
  on public.activation_keys (note)
  where note like '[paddle-subscription:%';
