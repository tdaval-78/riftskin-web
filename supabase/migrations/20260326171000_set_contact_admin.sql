insert into public.app_admins (user_id)
select id
from auth.users
where lower(email) = lower('contact@riftskin.com')
on conflict do nothing;
delete from public.app_admins
where user_id not in (
  select id
  from auth.users
  where lower(email) = lower('contact@riftskin.com')
);
