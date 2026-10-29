alter table public.payment_webhook_events
  add column currency text not null default 'VND';

create or replace function public.complete_payos_payment(
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
  payment_booking_id uuid;
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

  select payment.booking_id into payment_booking_id
  from public.payment_transactions as payment
  where payment.order_code = requested_order_code;
  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_ORDER_NOT_FOUND';
  end if;

  select * into booking
  from public.bookings
  where id = payment_booking_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_BOOKING_NOT_FOUND';
  end if;

  select * into transaction
  from public.payment_transactions as payment
  where payment.order_code = requested_order_code
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_ORDER_NOT_FOUND';
  end if;

  insert into public.payment_webhook_events (
    payment_transaction_id,
    provider_reference,
    payment_link_id,
    amount_minor,
    currency,
    transaction_at
  )
  values (
    transaction.id,
    requested_provider_reference,
    requested_payment_link_id,
    requested_amount_minor,
    requested_currency,
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
        and event.currency = requested_currency
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
        'received_amount_minor', requested_amount_minor,
        'received_currency', requested_currency
      )
    );

    return 'review_required';
  end if;

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
