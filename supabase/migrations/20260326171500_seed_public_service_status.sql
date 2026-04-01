insert into public.app_service_status (channel, injection_state, service_message)
values (
  'stable',
  'maintenance',
  'Nos developpeurs travaillent actuellement sur une mise a jour afin de contourner le nouveau patch Riot.'
)
on conflict (channel) do nothing;
