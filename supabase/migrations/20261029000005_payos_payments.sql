create sequence public.payos_order_code_seq
  as bigint
  start with 1000000000
  increment by 1
  no cycle;

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  provider text not null check (provider = 'payos'),
  order_code bigint not null unique,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = 'VND'),
  status text not null check (
    status in (
      'creating', 'pending', 'uncertain', 'paid', 'late_paid',
      'review_required', 'creation_failed', 'cancelled'
    )
  ),
  checkout_url text,
  payment_link_id text,
  provider_reference text unique,
  failure_code text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index payment_transactions_one_active_per_booking_idx
  on public.payment_transactions (booking_id)
  where status in ('creating', 'pending', 'uncertain');
create index payment_transactions_booking_created_idx
  on public.payment_transactions (booking_id, created_at desc);

create trigger payment_transactions_set_updated_at
  before update on public.payment_transactions
  for each row execute function public.set_updated_at();

create table public.payment_webhook_events (
  id bigint generated always as identity primary key,
  payment_transaction_id uuid not null references public.payment_transactions (id) on delete restrict,
  provider_reference text not null unique,
  payment_link_id text not null,
  amount_minor bigint not null check (amount_minor > 0),
  transaction_at timestamptz,
  received_at timestamptz not null default now()
);

alter table public.payment_transactions enable row level security;
alter table public.payment_webhook_events enable row level security;

create policy "Golfer reads own payment transactions"
  on public.payment_transactions for select to authenticated
  using (
    exists (
      select 1 from public.bookings as booking
      where booking.id = booking_id
        and booking.golfer_id = auth.uid()
    )
  );

revoke all on public.payment_transactions, public.payment_webhook_events
  from public, anon, authenticated;
grant select on public.payment_transactions to authenticated;

create function public.create_my_payos_payment_intent(requested_booking_id uuid)
returns table (
  payment_transaction_id uuid,
  order_code bigint,
  amount_minor bigint,
  currency text,
  booking_expires_at timestamptz,
  payment_status text,
  checkout_url text,
  payment_link_id text,
  should_create_link boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  booking public.bookings%rowtype;
  transaction public.payment_transactions%rowtype;
  should_create_link boolean := false;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select * into booking
  from public.bookings
  where id = requested_booking_id
    and golfer_id = actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'BOOKING_NOT_FOUND';
  end if;

  if booking.status <> 'pending_payment'
     or booking.expires_at is null
     or booking.expires_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'BOOKING_NOT_PAYABLE';
  end if;

  select * into transaction
  from public.payment_transactions as payment
  where payment.booking_id = booking.id
    and payment.status in ('creating', 'pending')
  order by payment.created_at desc
  limit 1
  for update;

  if not found then
    insert into public.payment_transactions (
      booking_id, provider, order_code, amount_minor, currency, status
    )
    values (
      booking.id,
      'payos',
      nextval('public.payos_order_code_seq'),
      booking.amount_minor,
      booking.currency,
      'creating'
    )
    returning * into transaction;
    should_create_link := true;
  end if;

  return query select
    transaction.id,
    transaction.order_code,
    transaction.amount_minor,
    transaction.currency,
    booking.expires_at,
    transaction.status,
    transaction.checkout_url,
    transaction.payment_link_id,
    should_create_link;
end;
$$;

create function public.record_payos_payment_link(
  requested_order_code bigint,
  requested_payment_link_id text,
  requested_checkout_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_payment_link_id is null
     or length(requested_payment_link_id) not between 1 and 128
     or requested_checkout_url !~ '^https://pay\.payos\.vn/' then
    raise exception using errcode = '22023', message = 'INVALID_PAYOS_PAYMENT_LINK';
  end if;

  update public.payment_transactions
  set payment_link_id = requested_payment_link_id,
      checkout_url = requested_checkout_url,
      status = 'pending',
      failure_code = null,
      updated_at = pg_catalog.now()
  where order_code = requested_order_code
    and status = 'creating';

  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_INTENT_NOT_CREATING';
  end if;
end;
$$;

create function public.fail_payos_payment_link(
  requested_order_code bigint,
  requested_failure_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_transactions
  set status = case
        when requested_failure_code in (
          'REQUEST_TIMEOUT',
          'NETWORK_ERROR',
          'INVALID_PROVIDER_RESPONSE'
        ) or requested_failure_code like 'HTTP_5%' then 'uncertain'
        else 'creation_failed'
      end,
      failure_code = pg_catalog.left(requested_failure_code, 64),
      updated_at = pg_catalog.now()
  where order_code = requested_order_code
    and status = 'creating';
end;
$$;

create function public.complete_payos_payment(
  requested_order_code bigint,
  requested_amount_minor bigint,
  requested_currency text,
  requested_payment_link_id text,
  requested_provider_reference text,
  requested_transaction_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction public.payment_transactions%rowtype;
  booking public.bookings%rowtype;
  event_id bigint;
begin
  if requested_order_code is null
     or requested_amount_minor is null
     or requested_amount_minor <= 0
     or requested_currency is null
     or requested_payment_link_id is null
     or requested_provider_reference is null
     or length(requested_provider_reference) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_PAYOS_PAYMENT_EVENT';
  end if;

  select * into transaction
  from public.payment_transactions as payment
  where payment.order_code = requested_order_code
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_ORDER_NOT_FOUND';
  end if;

  insert into public.payment_webhook_events (
    payment_transaction_id, provider_reference, payment_link_id, amount_minor, transaction_at
  )
  values (
    transaction.id,
    requested_provider_reference,
    requested_payment_link_id,
    requested_amount_minor,
    requested_transaction_at
  )
  on conflict (provider_reference) do nothing
  returning id into event_id;

  if event_id is null then
    if exists (
      select 1 from public.payment_webhook_events as event
      where event.provider_reference = requested_provider_reference
        and event.payment_transaction_id = transaction.id
        and event.payment_link_id = requested_payment_link_id
        and event.amount_minor = requested_amount_minor
    ) then
      return 'duplicate';
    end if;
    raise exception using errcode = '22023', message = 'PAYOS_REFERENCE_ALREADY_USED';
  end if;

  if transaction.amount_minor <> requested_amount_minor
     or transaction.currency <> requested_currency
     or transaction.payment_link_id is distinct from requested_payment_link_id then
    update public.payment_transactions
    set status = 'review_required',
        provider_reference = coalesce(provider_reference, requested_provider_reference),
        paid_at = coalesce(requested_transaction_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = transaction.id;

    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, metadata
    )
    values (
      null,
      'payment_details_mismatch_manual_reconciliation_required',
      'payment_transaction',
      transaction.id,
      pg_catalog.jsonb_build_object(
        'provider', 'payos',
        'order_code', requested_order_code,
        'received_amount_minor', requested_amount_minor,
        'received_currency', requested_currency,
        'received_payment_link_id', requested_payment_link_id
      )
    );

    return 'review_required';
  end if;

  if transaction.status in ('paid', 'late_paid', 'review_required') then
    update public.payment_transactions
    set status = 'review_required',
        updated_at = pg_catalog.now()
    where id = transaction.id;

    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, metadata
    )
    values (
      null,
      'payment_additional_transfer_manual_reconciliation_required',
      'payment_transaction',
      transaction.id,
      pg_catalog.jsonb_build_object(
        'provider', 'payos',
        'order_code', requested_order_code,
        'provider_reference', requested_provider_reference,
        'received_amount_minor', requested_amount_minor
      )
    );

    return 'review_required';
  end if;

  select * into booking
  from public.bookings
  where id = transaction.booking_id
  for update;

  if booking.status = 'pending_payment'
     and booking.expires_at is not null
     and booking.expires_at > pg_catalog.now() then
    update public.payment_transactions
    set status = 'paid',
        provider_reference = requested_provider_reference,
        paid_at = coalesce(requested_transaction_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = transaction.id;

    update public.bookings
    set status = 'confirmed',
        expires_at = null
    where id = booking.id;

    insert into public.booking_status_history (
      booking_id, actor_id, old_status, new_status
    )
    values (booking.id, null, booking.status, 'confirmed');

    return 'paid';
  end if;

  update public.payment_transactions
  set status = 'late_paid',
      provider_reference = requested_provider_reference,
      paid_at = coalesce(requested_transaction_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where id = transaction.id;

  if booking.status = 'pending_payment'
     and booking.expires_at is not null
     and booking.expires_at <= pg_catalog.now() then
    update public.bookings
    set status = 'expired',
        expires_at = null
    where id = booking.id;

    insert into public.booking_status_history (
      booking_id, actor_id, old_status, new_status
    )
    values (booking.id, null, booking.status, 'expired');
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata
  )
  values (
    null,
    'payment_late_paid_manual_reconciliation_required',
    'payment_transaction',
    transaction.id,
    pg_catalog.jsonb_build_object(
      'booking_id', booking.id,
      'provider', 'payos',
      'order_code', requested_order_code
    )
  );

  return 'late_paid';
end;
$$;

revoke all on sequence public.payos_order_code_seq from public, anon, authenticated;
revoke all on function public.create_my_payos_payment_intent(uuid) from public, anon;
grant execute on function public.create_my_payos_payment_intent(uuid) to authenticated;
revoke all on function public.record_payos_payment_link(bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.record_payos_payment_link(bigint, text, text)
  to service_role;
revoke all on function public.fail_payos_payment_link(bigint, text)
  from public, anon, authenticated;
grant execute on function public.fail_payos_payment_link(bigint, text)
  to service_role;
revoke all on function public.complete_payos_payment(bigint, bigint, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_payos_payment(bigint, bigint, text, text, text, timestamptz)
  to service_role;
