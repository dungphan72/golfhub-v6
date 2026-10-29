create or replace function public.notify_booking_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_course_name text;
  target_partner_id uuid;
begin
  select course.name, course.partner_id
  into target_course_name, target_partner_id
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
    'Một golfer vừa giữ chỗ tại ' || target_course_name || '.',
    new.id
  from public.partner_members as member
  where member.partner_id = target_partner_id;

  return new;
end;
$$;

create or replace function public.notify_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_type text;
  event_title text;
  event_body text;
  target_partner_id uuid;
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

  select course.partner_id into target_partner_id
  from public.tee_times as tt
  join public.golf_courses as course on course.id = tt.course_id
  where tt.id = new.tee_time_id;

  insert into public.notifications (
    recipient_id, notification_type, title, body, related_booking_id
  )
  select member.user_id, event_type, event_title, event_body, new.id
  from public.partner_members as member
  where member.partner_id = target_partner_id;

  return new;
end;
$$;

revoke all on function public.notify_booking_created() from public, anon, authenticated;
revoke all on function public.notify_booking_status_change() from public, anon, authenticated;
