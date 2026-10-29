create function public.get_my_partner_booking_report(
  requested_from timestamptz,
  requested_to timestamptz
)
returns table (
  partner_id uuid,
  partner_name text,
  booking_count bigint,
  player_count bigint,
  pending_payment_count bigint,
  confirmed_count bigint,
  cancelled_count bigint,
  expired_count bigint,
  completed_count bigint,
  payment_failed_count bigint,
  active_booking_value_minor numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if requested_from is null
     or requested_to is null
     or requested_from >= requested_to
     or requested_to > pg_catalog.now() + interval '1 minute'
     or requested_to - requested_from > interval '90 days' then
    raise exception using errcode = '22023', message = 'INVALID_REPORT_PERIOD';
  end if;

  return query
  select
    organization.id,
    organization.name,
    pg_catalog.count(booking.id)::bigint,
    coalesce(pg_catalog.sum(booking.player_count), 0)::bigint,
    (pg_catalog.count(booking.id) filter (where booking.status = 'pending_payment'))::bigint,
    (pg_catalog.count(booking.id) filter (where booking.status = 'confirmed'))::bigint,
    (pg_catalog.count(booking.id) filter (where booking.status = 'cancelled'))::bigint,
    (pg_catalog.count(booking.id) filter (where booking.status = 'expired'))::bigint,
    (pg_catalog.count(booking.id) filter (where booking.status = 'completed'))::bigint,
    (pg_catalog.count(booking.id) filter (where booking.status = 'payment_failed'))::bigint,
    coalesce(
      pg_catalog.sum(booking.amount_minor) filter (
        where booking.status in ('pending_payment', 'confirmed', 'completed')
      ),
      0
    )::numeric
  from public.partner_members as membership
  join public.partner_organizations as organization
    on organization.id = membership.partner_id
  left join public.golf_courses as course
    on course.partner_id = organization.id
  left join public.tee_times as tee_time
    on tee_time.course_id = course.id
  left join public.bookings as booking
    on booking.tee_time_id = tee_time.id
    and booking.created_at >= requested_from
    and booking.created_at < requested_to
  where membership.user_id = actor_id
  group by organization.id, organization.name
  order by organization.name;
end;
$$;

revoke all on function public.get_my_partner_booking_report(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.get_my_partner_booking_report(timestamptz, timestamptz)
  to authenticated;
