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

    return jsonb_build_object('ok', true, 'state', public.get_access_state(p_device_id));
end;
$$;
