create function public.deactivate_partner_tee_time(requested_tee_time_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  slot public.tee_times%rowtype;
  partner_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select * into slot
  from public.tee_times
  where id = requested_tee_time_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'TEE_TIME_NOT_FOUND';
  end if;

  select course.partner_id into partner_id
  from public.golf_courses as course
  where course.id = slot.course_id;

  if not private.is_partner_member(partner_id, array['owner', 'manager'])
     and not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'PARTNER_TEE_TIME_ACCESS_REQUIRED';
  end if;

  if slot.starts_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'TEE_TIME_ALREADY_STARTED';
  end if;

  if not slot.is_active then
    return 'already_inactive';
  end if;

  if exists (
    select 1
    from public.bookings as booking
    where booking.tee_time_id = slot.id
      and (
        booking.status = 'confirmed'
        or (
          booking.status = 'pending_payment'
          and booking.expires_at > pg_catalog.now()
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'TEE_TIME_HAS_ACTIVE_BOOKINGS';
  end if;

  update public.tee_times
  set is_active = false
  where id = slot.id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'tee_time_deactivated',
    'tee_time',
    slot.id,
    pg_catalog.jsonb_build_object('course_id', slot.course_id)
  );

  return 'deactivated';
end;
$$;

revoke all on function public.deactivate_partner_tee_time(uuid) from public, anon;
grant execute on function public.deactivate_partner_tee_time(uuid) to authenticated;
