create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_username text;
  v_base_username text;
  v_candidate text;
  v_suffix text := substr(replace(new.id::text, '-', ''), 1, 6);
begin
  v_raw_username := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(coalesce(new.email, ''), '@', 1), 'user');
  v_base_username := regexp_replace(v_raw_username, '[^A-Za-z0-9_.-]+', '', 'g');

  if v_base_username = '' then
    v_base_username := 'user';
  end if;

  v_candidate := left(v_base_username, 24);
  if length(v_candidate) < 3 then
    v_candidate := left('user-' || v_suffix, 24);
  end if;

  begin
    insert into public.profiles (id, username)
    values (new.id, v_candidate);
  exception
    when unique_violation then
      v_candidate := left(v_base_username, 17) || '-' || v_suffix;
      if length(v_candidate) < 3 then
        v_candidate := left('user-' || v_suffix, 24);
      end if;

      insert into public.profiles (id, username)
      values (new.id, v_candidate);
  end;

  return new;
end;
$$;
