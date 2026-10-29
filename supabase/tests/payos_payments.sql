begin;

create temporary table payos_payment_fixture (
  owner_id uuid not null,
  outsider_id uuid not null,
  partner_id uuid not null,
  course_id uuid not null,
  booking_active_id uuid not null,
  booking_expired_id uuid not null,
  booking_mismatch_id uuid not null,
  active_order_code bigint,
  expired_order_code bigint,
  mismatch_order_code bigint
);
grant select, update on payos_payment_fixture to authenticated, service_role;

do $$
declare
  payment_owner uuid;
  payment_outsider uuid;
  payment_partner uuid;
  payment_course uuid;
  slot_active uuid;
  slot_expired uuid;
  slot_mismatch uuid;
  booking_active uuid;
  booking_expired uuid;
  booking_mismatch uuid;
begin
  select id into payment_owner
  from auth.users
  where deleted_at is null and email_confirmed_at is not null
  order by created_at asc
  limit 1;
  select id into payment_outsider
  from auth.users
  where deleted_at is null
    and email_confirmed_at is not null
    and id <> payment_owner
  order by created_at asc
  limit 1;

  if payment_owner is null or payment_outsider is null then
    raise exception 'Two confirmed users are required to test PayOS payment isolation.';
  end if;

  insert into public.partner_organizations (name, slug, partner_type, verification_status)
  values (
    'PayOS payment test partner',
    'payos-payment-' || left(gen_random_uuid()::text, 8),
    'course',
    'verified'
  )
  returning id into payment_partner;

  insert into public.partner_members (partner_id, user_id, role)
  values (payment_partner, payment_owner, 'owner');

  insert into public.golf_courses (
    partner_id, name, slug, city, province, address,
    verification_status, is_published
  )
  values (
    payment_partner,
    'PayOS payment test course',
    'payos-course-' || left(gen_random_uuid()::text, 8),
    'Test City',
    'Test Province',
    'Temporary fixture',
    'verified',
    true
  )
  returning id into payment_course;

  insert into public.tee_times (
    course_id, starts_at, ends_at, price_per_player_minor, capacity
  )
  values
    (payment_course, now() + interval '10 days', now() + interval '10 days 4 hours', 125000, 4),
    (payment_course, now() + interval '11 days', now() + interval '11 days 4 hours', 125000, 4),
    (payment_course, now() + interval '12 days', now() + interval '12 days 4 hours', 125000, 4);

  select id into slot_active from public.tee_times
  where course_id = payment_course and starts_at::date = (now() + interval '10 days')::date;
  select id into slot_expired from public.tee_times
  where course_id = payment_course and starts_at::date = (now() + interval '11 days')::date;
  select id into slot_mismatch from public.tee_times
  where course_id = payment_course and starts_at::date = (now() + interval '12 days')::date;

  insert into public.bookings (
    tee_time_id, golfer_id, player_count, status, amount_minor, currency,
    idempotency_key, expires_at
  )
  values
    (slot_active, payment_owner, 1, 'pending_payment', 125000, 'VND', gen_random_uuid(), now() + interval '10 minutes'),
    (slot_expired, payment_owner, 1, 'pending_payment', 125000, 'VND', gen_random_uuid(), now() + interval '10 minutes'),
    (slot_mismatch, payment_owner, 1, 'pending_payment', 125000, 'VND', gen_random_uuid(), now() + interval '10 minutes');

  select id into booking_active
  from public.bookings
  where tee_time_id = slot_active and golfer_id = payment_owner;
  select id into booking_expired
  from public.bookings
  where tee_time_id = slot_expired and golfer_id = payment_owner;
  select id into booking_mismatch
  from public.bookings
  where tee_time_id = slot_mismatch and golfer_id = payment_owner;

  insert into pg_temp.payos_payment_fixture (
    owner_id, outsider_id, partner_id, course_id,
    booking_active_id, booking_expired_id, booking_mismatch_id
  )
  values (
    payment_owner, payment_outsider, payment_partner, payment_course,
    booking_active, booking_expired, booking_mismatch
  );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from pg_temp.payos_payment_fixture),
  true
);

do $$
declare
  fixture pg_temp.payos_payment_fixture%rowtype;
  intent record;
  retry_intent record;
  visible_count bigint;
begin
  select * into fixture from pg_temp.payos_payment_fixture;

  select * into intent
  from public.create_my_payos_payment_intent(fixture.booking_active_id);
  if not intent.should_create_link
     or intent.payment_status <> 'creating'
     or intent.amount_minor <> 125000 then
    raise exception 'Payment intent did not preserve booking amount and state';
  end if;

  select * into retry_intent
  from public.create_my_payos_payment_intent(fixture.booking_active_id);
  if retry_intent.should_create_link
     or retry_intent.order_code <> intent.order_code then
    raise exception 'Payment intent retry was not idempotent';
  end if;

  update pg_temp.payos_payment_fixture
  set active_order_code = intent.order_code;

  select * into intent
  from public.create_my_payos_payment_intent(fixture.booking_expired_id);
  update pg_temp.payos_payment_fixture
  set expired_order_code = intent.order_code;

  select * into intent
  from public.create_my_payos_payment_intent(fixture.booking_mismatch_id);
  update pg_temp.payos_payment_fixture
  set mismatch_order_code = intent.order_code;

  perform set_config('request.jwt.claim.sub', fixture.outsider_id::text, true);
  select pg_catalog.count(*) into visible_count
  from public.payment_transactions;
  if visible_count <> 0 then raise exception 'Other golfer can read payment transactions'; end if;

  begin
    perform * from public.create_my_payos_payment_intent(fixture.booking_active_id);
    raise exception 'Other golfer created a payment intent';
  exception when no_data_found then
    null;
  end;
end;
$$;

reset role;
update public.bookings as booking
set expires_at = now() - interval '1 minute'
where booking.id = (
  select booking_expired_id from pg_temp.payos_payment_fixture
);

set local role service_role;

do $$
declare
  fixture pg_temp.payos_payment_fixture%rowtype;
  result text;
  payment_state text;
  booking_state text;
begin
  select * into fixture from pg_temp.payos_payment_fixture;

  perform public.record_payos_payment_link(
    fixture.active_order_code,
    'payos-active-link',
    'https://pay.payos.vn/web/test-active'
  );
  perform public.record_payos_payment_link(
    fixture.expired_order_code,
    'payos-expired-link',
    'https://pay.payos.vn/web/test-expired'
  );
  perform public.record_payos_payment_link(
    fixture.mismatch_order_code,
    'payos-mismatch-link',
    'https://pay.payos.vn/web/test-mismatch'
  );

  result := public.complete_payos_payment(
    fixture.active_order_code,
    125000,
    'VND',
    'payos-active-link',
    'reference-active',
    null
  );
  if result <> 'paid' then raise exception 'Valid payment was not accepted'; end if;

  result := public.complete_payos_payment(
    fixture.active_order_code,
    125000,
    'VND',
    'payos-active-link',
    'reference-active',
    null
  );
  if result <> 'duplicate' then raise exception 'Repeated webhook was not idempotent'; end if;

  begin
    perform public.complete_payos_payment(
      fixture.active_order_code,
      125000,
      'USD',
      'payos-active-link',
      'reference-active',
      null
    );
    raise exception 'Webhook replay with a different currency was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'PAYOS_REFERENCE_ALREADY_USED' then
        raise;
      end if;
  end;

  select status into payment_state
  from public.payment_transactions
  where order_code = fixture.active_order_code;
  select status into booking_state
  from public.bookings
  where id = fixture.booking_active_id;
  if payment_state <> 'paid' or booking_state <> 'confirmed' then
    raise exception 'Valid PayOS payment did not confirm the booking';
  end if;

  result := public.complete_payos_payment(
    fixture.active_order_code,
    125000,
    'VND',
    'payos-active-link',
    'reference-active-second',
    null
  );
  select status into payment_state
  from public.payment_transactions
  where order_code = fixture.active_order_code;
  select status into booking_state
  from public.bookings
  where id = fixture.booking_active_id;
  if result <> 'review_required'
     or payment_state <> 'review_required'
     or booking_state <> 'confirmed' then
    raise exception 'Additional transfer was not held for manual reconciliation';
  end if;

  result := public.complete_payos_payment(
    fixture.expired_order_code,
    125000,
    'VND',
    'payos-expired-link',
    'reference-expired',
    null
  );
  select status into payment_state
  from public.payment_transactions
  where order_code = fixture.expired_order_code;
  select status into booking_state
  from public.bookings
  where id = fixture.booking_expired_id;
  if result <> 'late_paid' or payment_state <> 'late_paid' or booking_state <> 'expired' then
    raise exception 'Late payment incorrectly confirmed an expired booking';
  end if;

  result := public.complete_payos_payment(
    fixture.mismatch_order_code,
    125001,
    'VND',
    'payos-mismatch-link',
    'reference-mismatch',
    null
  );
  select status into payment_state
  from public.payment_transactions
  where order_code = fixture.mismatch_order_code;
  select status into booking_state
  from public.bookings
  where id = fixture.booking_mismatch_id;
  if result <> 'review_required'
     or payment_state <> 'review_required'
     or booking_state <> 'pending_payment' then
    raise exception 'Mismatched payment was not held for manual review';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from pg_temp.payos_payment_fixture),
  true
);

do $$
declare
  fixture pg_temp.payos_payment_fixture%rowtype;
begin
  select * into fixture from pg_temp.payos_payment_fixture;

  begin
    perform public.complete_payos_payment(
      fixture.active_order_code,
      125000,
      'VND',
      'payos-active-link',
      'forged-reference',
      null
    );
    raise exception 'Authenticated golfer invoked the privileged payment webhook RPC';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
