begin;

create temporary table mvp_integration_fixture (
  user_id uuid primary key,
  other_user_id uuid not null,
  partner_a uuid not null,
  partner_b uuid not null,
  course_a uuid not null,
  course_b uuid not null,
  slot_one uuid not null,
  slot_two uuid not null,
  slot_three uuid not null,
  slot_four uuid not null,
  partner_booking uuid,
  expiring_booking uuid,
  unauthorized_booking uuid,
  application_id uuid,
  approved_partner_id uuid,
  admin_course_id uuid
);
grant select, insert, update on pg_temp.mvp_integration_fixture to authenticated;

do $$
declare
  test_user uuid;
  other_user uuid;
  partner_a uuid;
  partner_b uuid;
  course_a uuid;
  course_b uuid;
  slot_one uuid;
  slot_two uuid;
  slot_three uuid;
  slot_four uuid;
begin
  select id into test_user
  from auth.users
  where deleted_at is null
    and email_confirmed_at is not null
  order by created_at desc
  limit 1;
  if test_user is null then
    raise exception 'Create a confirmed test golfer before running this suite.';
  end if;

  select id into other_user
  from auth.users
  where deleted_at is null
    and email_confirmed_at is not null
    and id <> test_user
  order by created_at desc
  limit 1;
  if other_user is null then
    raise exception 'Create a second confirmed test golfer to run cross-user RLS checks.';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', test_user::text, true);

  insert into public.partner_organizations (name, slug, partner_type, verification_status)
  values (
    'MVP RLS test partner A',
    'mvp-rls-a-' || left(gen_random_uuid()::text, 8),
    'course',
    'verified'
  )
  returning id into partner_a;

  insert into public.partner_organizations (name, slug, partner_type, verification_status)
  values (
    'MVP RLS test partner B',
    'mvp-rls-b-' || left(gen_random_uuid()::text, 8),
    'course',
    'pending'
  )
  returning id into partner_b;

  insert into public.partner_members (partner_id, user_id, role)
  values (partner_a, test_user, 'owner');
  insert into public.partner_members (partner_id, user_id, role)
  values (partner_b, other_user, 'owner');

  insert into public.golf_courses (
    partner_id, name, slug, city, province, address,
    verification_status, is_published
  )
  values (
    partner_a, 'MVP RLS test course A',
    'mvp-course-a-' || left(gen_random_uuid()::text, 8),
    'Test', 'Test', 'Temporary fixture', 'verified', true
  )
  returning id into course_a;

  insert into public.golf_courses (
    partner_id, name, slug, city, province, address,
    verification_status, is_published
  )
  values (
    partner_b, 'MVP RLS test course B',
    'mvp-course-b-' || left(gen_random_uuid()::text, 8),
    'Test', 'Test', 'Temporary fixture', 'pending', false
  )
  returning id into course_b;

  insert into public.tee_times (
    course_id, starts_at, ends_at, price_per_player_minor, capacity
  )
  values
    (course_a, now() + interval '1 day', now() + interval '1 day 4 hours', 100000, 1),
    (course_a, now() + interval '2 days', now() + interval '2 days 4 hours', 100000, 1),
    (course_a, now() + interval '3 days', now() + interval '3 days 4 hours', 100000, 1);

  select id into slot_one
  from public.tee_times
  where course_id = course_a
  order by starts_at
  offset 0 limit 1;
  select id into slot_two
  from public.tee_times
  where course_id = course_a
  order by starts_at
  offset 1 limit 1;
  select id into slot_three
  from public.tee_times
  where course_id = course_a
  order by starts_at
  offset 2 limit 1;

  insert into public.tee_times (
    course_id, starts_at, ends_at, price_per_player_minor, capacity
  )
  values (
    course_b, now() + interval '4 days', now() + interval '4 days 4 hours', 100000, 1
  )
  returning id into slot_four;

  insert into pg_temp.mvp_integration_fixture (
    user_id, other_user_id, partner_a, partner_b, course_a, course_b,
    slot_one, slot_two, slot_three, slot_four
  )
  values (
    test_user, other_user, partner_a, partner_b, course_a, course_b,
    slot_one, slot_two, slot_three, slot_four
  );
end;
$$;

set local role authenticated;

do $$
declare
  fixture pg_temp.mvp_integration_fixture%rowtype;
  first_booking uuid;
  booking_to_expire uuid;
  actual_status text;
  visible_count integer;
begin
  select * into strict fixture from pg_temp.mvp_integration_fixture;

  select count(*) into visible_count from public.profiles where user_id = auth.uid();
  if visible_count <> 1 then raise exception 'Golfer cannot read their own profile'; end if;
  select count(*) into visible_count from public.profiles where user_id <> auth.uid();
  if visible_count <> 0 then raise exception 'Golfer can read another profile'; end if;
  select count(*) into visible_count from public.user_roles where user_id = auth.uid();
  if visible_count <> 1 then raise exception 'Golfer cannot read their own role'; end if;

  select count(*) into visible_count from public.partner_organizations where id = fixture.partner_a;
  if visible_count <> 1 then raise exception 'Partner cannot read their own organization'; end if;
  select count(*) into visible_count from public.partner_organizations where id = fixture.partner_b;
  if visible_count <> 0 then raise exception 'Partner can read another organization'; end if;
  select count(*) into visible_count from public.golf_courses where id = fixture.course_a;
  if visible_count <> 1 then raise exception 'Partner cannot read their own course'; end if;
  update public.golf_courses
  set address = 'Updated temporary fixture'
  where id = fixture.course_a;
  select count(*) into visible_count
  from public.golf_courses
  where id = fixture.course_a and address = 'Updated temporary fixture';
  if visible_count <> 1 then raise exception 'Partner could not update course details'; end if;

  begin
    update public.golf_courses
    set verification_status = 'verified'
    where id = fixture.course_a;
    raise exception 'Partner directly changed course verification status';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.golf_courses
    set is_published = false
    where id = fixture.course_a;
    raise exception 'Partner directly changed course publication status';
  exception when insufficient_privilege then
    null;
  end;

  select count(*) into visible_count
  from public.golf_courses
  where id = fixture.course_a
    and verification_status = 'verified'
    and is_published;
  if visible_count <> 1 then raise exception 'Partner changed course verification or publication'; end if;

  select count(*) into visible_count from public.golf_courses where id = fixture.course_b;
  if visible_count <> 0 then raise exception 'Partner can read another course'; end if;
  select count(*) into visible_count from public.tee_times where id = fixture.slot_one;
  if visible_count <> 1 then raise exception 'Partner cannot read their own tee time'; end if;
  begin
    update public.tee_times
    set price_per_player_minor = price_per_player_minor
    where id = fixture.slot_one;
    raise exception 'Partner directly updated tee-time inventory';
  exception when insufficient_privilege then
    null;
  end;

  begin
    delete from public.tee_times where id = fixture.slot_three;
    raise exception 'Partner directly deleted tee-time inventory';
  exception when insufficient_privilege then
    null;
  end;

  select count(*) into visible_count from public.partner_members where partner_id = fixture.partner_a;
  if visible_count <> 1 then raise exception 'Partner cannot read their own membership'; end if;
  select count(*) into visible_count from public.partner_members where partner_id = fixture.partner_b;
  if visible_count <> 0 then raise exception 'Partner can read another partner membership'; end if;
  select count(*) into visible_count from public.tee_times where id = fixture.slot_four;
  if visible_count <> 0 then raise exception 'Partner can read another partner tee time'; end if;

  first_booking := public.create_booking(
    fixture.slot_one, 1, 'f3800000-0000-4000-8000-000000000001'
  );
  if public.create_booking(
    fixture.slot_one, 1, 'f3800000-0000-4000-8000-000000000001'
  ) <> first_booking then
    raise exception 'Idempotent retry did not return the original booking';
  end if;

  begin
    perform public.create_booking(
      fixture.slot_two, 1, 'f3800000-0000-4000-8000-000000000001'
    );
    raise exception 'Changed details were accepted with a reused idempotency key';
  exception when sqlstate '22023' then
    if sqlerrm <> 'IDEMPOTENCY_KEY_REUSED' then raise; end if;
  end;

  begin
    perform public.create_booking(
      fixture.slot_one, 1, 'f3800000-0000-4000-8000-000000000002'
    );
    raise exception 'Booking exceeded slot capacity';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'TEE_TIME_FULL' then raise; end if;
  end;

  begin
    perform public.deactivate_partner_tee_time(fixture.slot_one);
    raise exception 'Partner closed a tee time with an active hold';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'TEE_TIME_HAS_ACTIVE_BOOKINGS' then raise; end if;
  end;

  begin
    perform public.deactivate_partner_tee_time(fixture.slot_four);
    raise exception 'Partner closed another organization tee time';
  exception when insufficient_privilege then
    if sqlerrm <> 'PARTNER_TEE_TIME_ACCESS_REQUIRED' then raise; end if;
  end;

  booking_to_expire := public.create_booking(
    fixture.slot_three, 1, 'f3800000-0000-4000-8000-000000000003'
  );

  update pg_temp.mvp_integration_fixture
  set partner_booking = first_booking,
      expiring_booking = booking_to_expire;
end;
$$;

reset role;

update public.bookings
set expires_at = now() - interval '1 second'
where id = (select expiring_booking from pg_temp.mvp_integration_fixture);

set local role authenticated;

do $$
declare
  fixture pg_temp.mvp_integration_fixture%rowtype;
  actual_status text;
  visible_count integer;
  new_unauthorized_booking uuid;
begin
  select * into strict fixture from pg_temp.mvp_integration_fixture;

  perform public.expire_my_pending_bookings();
  select status into actual_status from public.bookings where id = fixture.expiring_booking;
  if actual_status <> 'expired' then raise exception 'Expired hold did not transition'; end if;

  perform public.cancel_booking(fixture.partner_booking);
  select status into actual_status from public.bookings where id = fixture.partner_booking;
  if actual_status <> 'cancelled' then raise exception 'Pending hold did not cancel'; end if;

  if public.deactivate_partner_tee_time(fixture.slot_three) <> 'deactivated' then
    raise exception 'Partner could not close a tee time with no active bookings';
  end if;
  if public.deactivate_partner_tee_time(fixture.slot_three) <> 'already_inactive' then
    raise exception 'Repeated tee-time closure was not idempotent';
  end if;

  select count(*) into visible_count
  from public.tee_times
  where id = fixture.slot_three and not is_active;
  if visible_count <> 1 then raise exception 'Closed tee time remains active'; end if;

  begin
    perform public.create_booking(
      fixture.slot_three, 1, 'f3800000-0000-4000-8000-000000000005'
    );
    raise exception 'New booking was accepted for a closed tee time';
  exception when sqlstate 'P0002' then
    if sqlerrm <> 'TEE_TIME_UNAVAILABLE' then raise; end if;
  end;

  select count(*) into visible_count
  from public.booking_status_history
  where booking_id in (fixture.partner_booking, fixture.expiring_booking);
  if visible_count <> 4 then raise exception 'Unexpected booking history row count: %', visible_count; end if;

  select count(*) into visible_count
  from public.notifications
  where recipient_id = auth.uid()
    and related_booking_id in (fixture.partner_booking, fixture.expiring_booking);
  if visible_count <> 8 then raise exception 'Unexpected golfer/partner notification count: %', visible_count; end if;

  select count(*) into visible_count
  from public.list_course_availability(fixture.course_a)
  where id = fixture.slot_one and available_seats = 1;
  if visible_count <> 1 then raise exception 'Cancelled hold did not release its seat'; end if;

  new_unauthorized_booking := public.create_booking(
    fixture.slot_two, 1, 'f3800000-0000-4000-8000-000000000004'
  );
  update pg_temp.mvp_integration_fixture
  set unauthorized_booking = new_unauthorized_booking;

  perform pg_catalog.set_config('request.jwt.claim.sub', fixture.other_user_id::text, true);

  update public.golf_courses
  set address = 'Updated pending temporary fixture'
  where id = fixture.course_b;
  select count(*) into visible_count
  from public.golf_courses
  where id = fixture.course_b
    and address = 'Updated pending temporary fixture'
    and verification_status = 'pending'
    and not is_published;
  if visible_count <> 1 then raise exception 'Course owner could not update pending details safely'; end if;

  select count(*) into visible_count from public.profiles where user_id = auth.uid();
  if visible_count <> 1 then raise exception 'Second golfer cannot read their own profile'; end if;
  select count(*) into visible_count from public.user_roles where user_id = auth.uid();
  if visible_count <> 1 then raise exception 'Second golfer cannot read their own role'; end if;
  select count(*) into visible_count from public.profiles where user_id = fixture.user_id;
  if visible_count <> 0 then raise exception 'Second golfer can read the first golfer profile'; end if;
  select count(*) into visible_count from public.user_roles where user_id = fixture.user_id;
  if visible_count <> 0 then raise exception 'Second golfer can read the first golfer role'; end if;
  select count(*) into visible_count
  from public.partner_organizations
  where id = fixture.partner_b;
  if visible_count <> 1 then raise exception 'Second partner cannot read their own organization'; end if;
  select count(*) into visible_count
  from public.golf_courses
  where id = fixture.course_b;
  if visible_count <> 1 then raise exception 'Second partner cannot read their own course'; end if;
  select count(*) into visible_count
  from public.tee_times
  where id = fixture.slot_four;
  if visible_count <> 1 then raise exception 'Second partner cannot read their own tee time'; end if;
  select count(*) into visible_count
  from public.bookings
  where id in (
    fixture.partner_booking, fixture.expiring_booking, fixture.unauthorized_booking
  );
  if visible_count <> 0 then raise exception 'Second golfer can read the first golfer bookings'; end if;
  select count(*) into visible_count
  from public.partner_members
  where partner_id = fixture.partner_a;
  if visible_count <> 0 then raise exception 'Second golfer can read another partner membership'; end if;
  select count(*) into visible_count
  from public.partner_members
  where partner_id = fixture.partner_b;
  if visible_count <> 1 then raise exception 'Second partner cannot read their own membership'; end if;
  begin
    perform public.cancel_booking(fixture.unauthorized_booking);
    raise exception 'Second golfer cancelled another golfer booking';
  exception when sqlstate 'P0002' then
    if sqlerrm <> 'BOOKING_NOT_FOUND' then raise; end if;
  end;
end;
$$;

reset role;

do $$
declare
  closed_slot_id uuid;
  audit_count integer;
begin
  select slot_three into strict closed_slot_id from pg_temp.mvp_integration_fixture;
  select count(*) into audit_count
  from public.audit_logs
  where entity_type = 'tee_time'
    and entity_id = closed_slot_id
    and actor_id = (select user_id from pg_temp.mvp_integration_fixture)
    and action = 'tee_time_deactivated';
  if audit_count <> 1 then raise exception 'Tee-time deactivation audit entry is missing'; end if;
end;
$$;

insert into public.user_roles (user_id, role)
select other_user_id, 'ADMIN'
from pg_temp.mvp_integration_fixture;

set local role authenticated;

do $$
declare
  fixture pg_temp.mvp_integration_fixture%rowtype;
  new_application_id uuid;
  self_application_id uuid;
  new_approved_partner_id uuid;
  new_admin_course_id uuid;
  visible_count integer;
begin
  select * into strict fixture from pg_temp.mvp_integration_fixture;

  perform pg_catalog.set_config('request.jwt.claim.sub', fixture.user_id::text, true);

  new_application_id := public.submit_partner_application(
    'MVP RLS test application',
    'course',
    'Test Applicant',
    'test-applicant@example.invalid',
    '+84000000000',
    'Test City'
  );

  select count(*) into visible_count
  from public.partner_applications
  where applicant_id = auth.uid() and id = new_application_id and status = 'pending';
  if visible_count <> 1 then raise exception 'Applicant cannot read their pending application'; end if;

  begin
    perform public.submit_partner_application(
      'MVP Duplicate test application',
      'course',
      'Test Applicant',
      'test-applicant@example.invalid',
      '+84000000000',
      'Test City'
    );
    raise exception 'Duplicate pending partner application was accepted';
  exception when unique_violation then
    null;
  end;

  begin
    perform public.review_partner_application(new_application_id, 'approve', 'mvp-test-unauthorized');
    raise exception 'Non-admin reviewed a partner application';
  exception when insufficient_privilege then
    if sqlerrm <> 'ADMIN_ACCESS_REQUIRED' then raise; end if;
  end;

  select count(*) into visible_count
  from public.partner_applications
  where applicant_id = fixture.other_user_id;
  if visible_count <> 0 then raise exception 'Applicant can read another user application'; end if;

  update pg_temp.mvp_integration_fixture
  set application_id = new_application_id;

  perform pg_catalog.set_config('request.jwt.claim.sub', fixture.other_user_id::text, true);

  select count(*) into visible_count
  from public.partner_applications
  where id = new_application_id and status = 'pending';
  if visible_count <> 1 then raise exception 'Admin cannot read pending application'; end if;

  self_application_id := public.submit_partner_application(
    'MVP self-review test application',
    'course',
    'Test Administrator',
    'test-administrator@example.invalid',
    '+84000000001',
    'Test City'
  );

  begin
    perform public.review_partner_application(
      self_application_id,
      'approve',
      'mvp-self-review-' || left(gen_random_uuid()::text, 8)
    );
    raise exception 'Administrator approved their own partner application';
  exception when insufficient_privilege then
    if sqlerrm <> 'PARTNER_APPLICATION_SELF_REVIEW_NOT_ALLOWED' then raise; end if;
  end;

  begin
    perform public.review_partner_application(self_application_id, 'reject', '');
    raise exception 'Administrator rejected their own partner application';
  exception when insufficient_privilege then
    if sqlerrm <> 'PARTNER_APPLICATION_SELF_REVIEW_NOT_ALLOWED' then raise; end if;
  end;

  select count(*) into visible_count
  from public.partner_applications
  where id = self_application_id and status = 'pending' and reviewed_by is null;
  if visible_count <> 1 then raise exception 'Self-reviewed application was modified'; end if;

  new_approved_partner_id := public.review_partner_application(
    new_application_id,
    'approve',
    'mvp-approved-partner-' || left(gen_random_uuid()::text, 8)
  );

  if new_approved_partner_id is null then raise exception 'Partner approval did not return organization id'; end if;

  select count(*) into visible_count
  from public.partner_applications
  where id = new_application_id and status = 'approved'
    and reviewed_by = auth.uid() and reviewed_at is not null;
  if visible_count <> 1 then raise exception 'Partner application approval state was not recorded'; end if;

  select count(*) into visible_count
  from public.partner_members
  where partner_id = new_approved_partner_id
    and user_id = fixture.user_id
    and role = 'owner';
  if visible_count <> 1 then raise exception 'Approved applicant was not made organization owner'; end if;

  select count(*) into visible_count
  from public.audit_logs
  where entity_type = 'partner_application'
    and entity_id = new_application_id
    and actor_id = auth.uid()
    and action = 'partner_application_approve';
  if visible_count <> 1 then raise exception 'Partner approval audit entry is missing'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', fixture.user_id::text, true);
  insert into public.golf_courses (
    partner_id, name, slug, city, province, address,
    verification_status, is_published
  )
  values (
    new_approved_partner_id,
    'MVP RLS course awaiting review',
    'mvp-review-course-' || left(gen_random_uuid()::text, 8),
    'Test City',
    'Test Province',
    'Temporary fixture',
    'pending',
    false
  )
  returning id into new_admin_course_id;

  update pg_temp.mvp_integration_fixture
  set approved_partner_id = new_approved_partner_id,
      admin_course_id = new_admin_course_id;

  begin
    perform public.review_golf_course(new_admin_course_id, 'approve');
    raise exception 'Non-admin reviewed a course';
  exception when insufficient_privilege then
    if sqlerrm <> 'ADMIN_ACCESS_REQUIRED' then raise; end if;
  end;

  perform pg_catalog.set_config('request.jwt.claim.sub', fixture.other_user_id::text, true);
  perform public.review_golf_course(new_admin_course_id, 'approve');

  select count(*) into visible_count
  from public.golf_courses
  where id = new_admin_course_id
    and verification_status = 'verified'
    and is_published;
  if visible_count <> 1 then raise exception 'Course approval did not publish the course'; end if;

  select count(*) into visible_count
  from public.audit_logs
  where entity_type = 'golf_course'
    and entity_id = new_admin_course_id
    and actor_id = auth.uid()
    and action = 'course_approve';
  if visible_count <> 1 then raise exception 'Course approval audit entry is missing'; end if;
end;
$$;

rollback;
