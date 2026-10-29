create or replace function public.create_my_payos_payment_intent(requested_booking_id uuid)
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
  create_link_now boolean := false;
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
    and payment.status in ('creating', 'pending', 'uncertain')
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
    create_link_now := true;
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
    create_link_now;
end;
$$;
