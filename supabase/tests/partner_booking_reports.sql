begin;

create temporary table partner_report_fixture (
  owner_id uuid not null,
  outsider_id uuid not null,
  partner_id uuid not null,
  course_id uuid not null
);
grant select on partner_report_fixture to authenticated;

do $$
declare
  report_owner uuid;
  report_outsider uuid;
  report_partner uuid;
  report_course uuid;
  report_tee_time uuid;
begin
  select id into report_owner
  from auth.users
  where deleted_at is null and email_confirmed_at is not null
  order by created_at asc
  limit 1;
  select id into report_outsider
  from auth.users
  where deleted_at is null
    and email_confirmed_at is not null
    and id <> report_owner
  order by created_at asc
  limit 1;

  if report_owner is null or report_outsider is null then
    raise exception 'Two confirmed users are required to test partner report isolation.';
  end if;

  insert into public.partner_organizations (name, slug, partner_type, verification_status)
  values (
    'Partner report test',
    'partner-report-' || left(gen_random_uuid()::text, 8),
    'course',
    'verified'
  )
  returning id into report_partner;

  insert into public.partner_members (partner_id, user_id, role)
  values (report_partner, report_owner, 'owner');

  insert into public.golf_courses (
    partner_id, name, slug, city, province, address,
    verification_status, is_published
  )
  values (
    report_partner,
    'Partner report test course',
    'partner-report-course-' || left(gen_random_uuid()::text, 8),
    'Test City',
    'Test Province',
    'Temporary fixture',
    'verified',
    true
  )
  returning id into report_course;

  insert into public.tee_times (
    course_id, starts_at, ends_at, price_per_player_minor, capacity
  )
  values (
    report_course,
    now() + interval '10 days',
    now() + interval '10 days 4 hours',
    250000,
    4
  )
  returning id into report_tee_time;

  insert into public.bookings (
    tee_time_id, golfer_id, player_count, status, amount_minor, currency,
    idempotency_key, expires_at, created_at
  )
  values
    (
      report_tee_time, report_owner, 2, 'pending_payment', 250000, 'VND',
      gen_random_uuid(), now() + interval '10 minutes', now() - interval '2 days'
    ),
    (
      report_tee_time, report_outsider, 1, 'cancelled', 300000, 'VND',
      gen_random_uuid(), null, now() - interval '3 days'
    ),
    (
      report_tee_time, report_outsider, 1, 'expired', 400000, 'VND',
      gen_random_uuid(), null, now() - interval '4 days'
    ),
    (
      report_tee_time, report_outsider, 2, 'confirmed', 200000, 'VND',
      gen_random_uuid(), null, now() - interval '10 days'
    ),
    (
      report_tee_time, report_outsider, 1, 'pending_payment', 100000, 'VND',
      gen_random_uuid(), now() + interval '10 minutes', now() - interval '40 days'
    );

  insert into pg_temp.partner_report_fixture
    (owner_id, outsider_id, partner_id, course_id)
  values (report_owner, report_outsider, report_partner, report_course);
end;
$$;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from pg_temp.partner_report_fixture),
  true
);

do $$
declare
  fixture pg_temp.partner_report_fixture%rowtype;
  report_row record;
  report_rows bigint;
begin
  select * into fixture from pg_temp.partner_report_fixture;

  select * into report_row
  from public.get_my_partner_booking_report(
    pg_catalog.now() - interval '30 days',
    pg_catalog.now()
  )
  where partner_id = fixture.partner_id;

  if not found then raise exception 'Partner report did not include the owner organization'; end if;
  if report_row.booking_count <> 4 then
    raise exception 'Expected four bookings in range, got %', report_row.booking_count;
  end if;
  if report_row.player_count <> 6 then
    raise exception 'Expected six players, got %', report_row.player_count;
  end if;
  if report_row.pending_payment_count <> 1
     or report_row.confirmed_count <> 1
     or report_row.cancelled_count <> 1
     or report_row.expired_count <> 1 then
    raise exception 'Booking status counts were not aggregated correctly';
  end if;
  if report_row.active_booking_value_minor <> 450000 then
    raise exception 'Cancelled/expired booking value was incorrectly included';
  end if;

  select booking_count into report_rows
  from public.get_my_partner_booking_report(
    pg_catalog.now() - interval '7 days',
    pg_catalog.now()
  )
  where partner_id = fixture.partner_id;
  if report_rows <> 3 then
    raise exception 'Expected three bookings in the seven-day window, got %', report_rows;
  end if;

  begin
    perform *
    from public.get_my_partner_booking_report(
      pg_catalog.now() - interval '91 days',
      pg_catalog.now()
    );
    raise exception 'Report accepted a period longer than 90 days';
  exception when invalid_parameter_value then
    if sqlerrm <> 'INVALID_REPORT_PERIOD' then raise; end if;
  end;

  perform pg_catalog.set_config('request.jwt.claim.sub', fixture.outsider_id::text, true);
  select pg_catalog.count(*) into report_rows
  from public.get_my_partner_booking_report(
    pg_catalog.now() - interval '30 days',
    pg_catalog.now()
  )
  where partner_id = fixture.partner_id;
  if report_rows <> 0 then
    raise exception 'Unrelated user received another partner organization report';
  end if;
end;
$$;

rollback;
