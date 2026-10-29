create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null check (
    notification_type in ('booking_created', 'booking_cancelled', 'booking_expired')
  ),
  title text not null,
  body text not null,
  related_booking_id uuid references public.bookings (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "Users read own notifications"
  on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy "Users mark own notifications read"
  on public.notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create function public.notify_booking_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  course_name text;
  partner_id uuid;
begin
  select course.name, course.partner_id
  into course_name, partner_id
  from public.tee_times as tt
  join public.golf_courses as course on course.id = tt.course_id
  where tt.id = new.tee_time_id;

  insert into public.notifications (
    recipient_id, notification_type, title, body, related_booking_id
  )
  values (
    new.golfer_id,
    'booking_created',
    'Đã tạo lượt giữ chỗ',
    'Lượt giữ chỗ đang chờ thanh toán và sẽ hết hạn sau 10 phút.',
    new.id
  );

  insert into public.notifications (
    recipient_id, notification_type, title, body, related_booking_id
  )
  select
    member.user_id,
    'booking_created',
    'Có lượt giữ chỗ mới',
    'Một golfer vừa giữ chỗ tại ' || course_name || '.',
    new.id
  from public.partner_members as member
  where member.partner_id = partner_id;

  return new;
end;
$$;

create trigger booking_created_notifications
  after insert on public.bookings
  for each row execute function public.notify_booking_created();

create function public.notify_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_type text;
  event_title text;
  event_body text;
  partner_id uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status not in ('cancelled', 'expired') then
    return new;
  end if;

  if new.status = 'cancelled' then
    event_type := 'booking_cancelled';
    event_title := 'Lượt giữ chỗ đã hủy';
    event_body := 'Số chỗ đã được giải phóng.';
  else
    event_type := 'booking_expired';
    event_title := 'Lượt giữ chỗ đã hết hạn';
    event_body := 'Thời gian giữ chỗ 10 phút đã kết thúc.';
  end if;

  insert into public.notifications (
    recipient_id, notification_type, title, body, related_booking_id
  )
  values (new.golfer_id, event_type, event_title, event_body, new.id);

  select course.partner_id into partner_id
  from public.tee_times as tt
  join public.golf_courses as course on course.id = tt.course_id
  where tt.id = new.tee_time_id;

  insert into public.notifications (
    recipient_id, notification_type, title, body, related_booking_id
  )
  select member.user_id, event_type, event_title, event_body, new.id
  from public.partner_members as member
  where member.partner_id = partner_id;

  return new;
end;
$$;

create trigger booking_status_notifications
  after update of status on public.bookings
  for each row execute function public.notify_booking_status_change();
