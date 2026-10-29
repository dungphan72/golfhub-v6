create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('SUPER_ADMIN', 'ADMIN', 'GOLFER')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.partner_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  partner_type text not null check (
    partner_type in ('course', 'range', 'simulator', 'academy', 'club', 'retailer', 'other')
  ),
  verification_status text not null default 'pending' check (
    verification_status in ('pending', 'verified', 'rejected', 'suspended')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_members (
  partner_id uuid not null references public.partner_organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff', 'coach')),
  created_at timestamptz not null default now(),
  primary key (partner_id, user_id)
);

create index partner_members_user_id_idx on public.partner_members (user_id);

create table public.golf_courses (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_organizations (id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  city text not null,
  province text not null,
  address text not null,
  description text not null default '',
  amenities text[] not null default '{}',
  verification_status text not null default 'pending' check (
    verification_status in ('pending', 'verified', 'rejected', 'suspended')
  ),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index golf_courses_discovery_idx
  on public.golf_courses (province, city, name)
  where verification_status = 'verified' and is_published;

create table public.tee_times (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.golf_courses (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_per_player_minor bigint not null check (
    price_per_player_minor between 0 and 1000000000000
  ),
  currency text not null default 'VND' check (currency = 'VND'),
  capacity integer not null check (capacity between 1 and 8),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (course_id, starts_at)
);

create index tee_times_course_start_idx on public.tee_times (course_id, starts_at)
  where is_active;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tee_time_id uuid not null references public.tee_times (id) on delete restrict,
  golfer_id uuid not null references auth.users (id) on delete restrict,
  player_count integer not null check (player_count between 1 and 8),
  status text not null check (
    status in ('pending_payment', 'confirmed', 'cancelled', 'expired', 'completed', 'payment_failed')
  ),
  amount_minor bigint not null check (amount_minor between 0 and 8000000000000),
  currency text not null check (currency = 'VND'),
  idempotency_key uuid not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (golfer_id, idempotency_key)
);

create index bookings_tee_time_status_idx on public.bookings (tee_time_id, status, expires_at);
create index bookings_golfer_created_idx on public.bookings (golfer_id, created_at desc);

create table public.booking_status_history (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  old_status text,
  new_status text not null check (
    new_status in ('pending_payment', 'confirmed', 'cancelled', 'expired', 'completed', 'payment_failed')
  ),
  created_at timestamptz not null default now()
);

create index booking_history_booking_idx
  on public.booking_status_history (booking_id, created_at);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger partner_organizations_set_updated_at before update on public.partner_organizations
  for each row execute function public.set_updated_at();
create trigger golf_courses_set_updated_at before update on public.golf_courses
  for each row execute function public.set_updated_at();
create trigger tee_times_set_updated_at before update on public.tee_times
  for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    pg_catalog.left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 160)
  )
  on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, 'GOLFER')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

create trigger auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('ADMIN', 'SUPER_ADMIN')
  );
$$;

create function private.is_partner_member(
  requested_partner_id uuid,
  permitted_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.partner_members
    where partner_id = requested_partner_id
      and user_id = auth.uid()
      and (permitted_roles is null or role = any (permitted_roles))
  );
$$;

create function public.prevent_course_verification_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.verification_status is distinct from old.verification_status
     and not private.is_platform_admin() then
    raise exception 'Only platform administrators can change course verification.';
  end if;
  return new;
end;
$$;

create trigger golf_courses_verification_guard
  before update on public.golf_courses
  for each row execute function public.prevent_course_verification_change();

create function public.create_booking(
  requested_tee_time_id uuid,
  requested_player_count integer,
  requested_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  slot public.tee_times%rowtype;
  booking_id uuid;
  occupied_seats integer;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if requested_player_count is null
     or requested_player_count < 1 or requested_player_count > 8
     or requested_idempotency_key is null then
    raise exception using errcode = '22023', message = 'INVALID_BOOKING_REQUEST';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      actor_id::text || ':' || requested_idempotency_key::text,
      0
    )
  );

  select id into booking_id
  from public.bookings
  where golfer_id = actor_id
    and idempotency_key = requested_idempotency_key;

  if booking_id is not null then
    if not exists (
      select 1 from public.bookings
      where id = booking_id
        and tee_time_id = requested_tee_time_id
        and player_count = requested_player_count
    ) then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return booking_id;
  end if;

  select tt.* into slot
  from public.tee_times as tt
  join public.golf_courses as course on course.id = tt.course_id
  where tt.id = requested_tee_time_id
    and tt.is_active
    and tt.starts_at > pg_catalog.now()
    and course.verification_status = 'verified'
    and course.is_published
  for update of tt;

  if not found then
    raise exception using errcode = 'P0002', message = 'TEE_TIME_UNAVAILABLE';
  end if;

  with expired as (
    update public.bookings
    set status = 'expired', expires_at = null
    where tee_time_id = slot.id
      and status = 'pending_payment'
      and expires_at <= pg_catalog.now()
    returning id
  )
  insert into public.booking_status_history (booking_id, actor_id, old_status, new_status)
  select id, actor_id, 'pending_payment', 'expired'
  from expired;

  select coalesce(pg_catalog.sum(player_count), 0)::integer
    into occupied_seats
  from public.bookings
  where tee_time_id = slot.id
    and (
      status = 'confirmed'
      or (status = 'pending_payment' and expires_at > pg_catalog.now())
    );

  if occupied_seats + requested_player_count > slot.capacity then
    raise exception using errcode = 'P0001', message = 'TEE_TIME_FULL';
  end if;

  insert into public.bookings (
    tee_time_id,
    golfer_id,
    player_count,
    status,
    amount_minor,
    currency,
    idempotency_key,
    expires_at
  )
  values (
    slot.id,
    actor_id,
    requested_player_count,
    'pending_payment',
    slot.price_per_player_minor * requested_player_count,
    slot.currency,
    requested_idempotency_key,
    pg_catalog.now() + interval '10 minutes'
  )
  returning id into booking_id;

  insert into public.booking_status_history (
    booking_id, actor_id, old_status, new_status
  )
  values (booking_id, actor_id, null, 'pending_payment');

  return booking_id;
exception
  when unique_violation then
    select id into booking_id
    from public.bookings
    where golfer_id = auth.uid()
      and idempotency_key = requested_idempotency_key;
    if booking_id is not null then
      if exists (
        select 1 from public.bookings
        where id = booking_id
          and tee_time_id = requested_tee_time_id
          and player_count = requested_player_count
      ) then
        return booking_id;
      end if;
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED';
    end if;
    raise;
end;
$$;

create function public.list_course_availability(requested_course_id uuid)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  price_per_player_minor bigint,
  currency text,
  capacity integer,
  available_seats integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    tt.id,
    tt.starts_at,
    tt.ends_at,
    tt.price_per_player_minor,
    tt.currency,
    tt.capacity,
    greatest(
      tt.capacity - coalesce(pg_catalog.sum(booking.player_count), 0)::integer,
      0
    ) as available_seats
  from public.tee_times as tt
  join public.golf_courses as course on course.id = tt.course_id
  left join public.bookings as booking
    on booking.tee_time_id = tt.id
    and (
      booking.status = 'confirmed'
      or (
        booking.status = 'pending_payment'
        and booking.expires_at > pg_catalog.now()
      )
    )
  where tt.course_id = requested_course_id
    and tt.is_active
    and tt.starts_at > pg_catalog.now()
    and course.verification_status = 'verified'
    and course.is_published
  group by tt.id
  order by tt.starts_at
  limit 30;
$$;

create function public.cancel_booking(requested_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_booking public.bookings%rowtype;
  starts_at timestamptz;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select * into current_booking
  from public.bookings
  where id = requested_booking_id
    and (golfer_id = actor_id or private.is_platform_admin())
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'BOOKING_NOT_FOUND';
  end if;

  if current_booking.status = 'cancelled' then
    return current_booking.id;
  end if;

  if current_booking.status not in ('pending_payment', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'BOOKING_CANNOT_BE_CANCELLED';
  end if;

  select tt.starts_at into starts_at
  from public.tee_times as tt
  where tt.id = current_booking.tee_time_id;

  if current_booking.status = 'confirmed'
     and starts_at - pg_catalog.now() < interval '24 hours' then
    raise exception using errcode = 'P0001', message = 'CANCELLATION_WINDOW_CLOSED';
  end if;

  update public.bookings
  set status = 'cancelled', expires_at = null
  where id = current_booking.id;

  insert into public.booking_status_history (
    booking_id, actor_id, old_status, new_status
  )
  values (current_booking.id, actor_id, current_booking.status, 'cancelled');

  return current_booking.id;
end;
$$;

create function public.expire_my_pending_bookings()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  with expired as (
    update public.bookings
    set status = 'expired', expires_at = null
    where golfer_id = actor_id
      and status = 'pending_payment'
      and expires_at <= pg_catalog.now()
    returning id
  )
  insert into public.booking_status_history (booking_id, actor_id, old_status, new_status)
  select id, actor_id, 'pending_payment', 'expired'
  from expired;
end;
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.partner_organizations enable row level security;
alter table public.partner_members enable row level security;
alter table public.golf_courses enable row level security;
alter table public.tee_times enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_status_history enable row level security;

create policy "Users read own profile" on public.profiles
  for select to authenticated using (user_id = auth.uid());
create policy "Users update own profile" on public.profiles
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users and admins read roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or private.is_platform_admin());

create policy "Read verified or member organizations" on public.partner_organizations
  for select to anon, authenticated using (
    verification_status = 'verified'
    or private.is_partner_member(id)
    or private.is_platform_admin()
  );
create policy "Admins manage organizations" on public.partner_organizations
  for all to authenticated using (private.is_platform_admin())
  with check (private.is_platform_admin());

create policy "Members read organization membership" on public.partner_members
  for select to authenticated using (
    user_id = auth.uid()
    or private.is_partner_member(partner_id)
    or private.is_platform_admin()
  );
create policy "Admins manage organization membership" on public.partner_members
  for all to authenticated using (private.is_platform_admin())
  with check (private.is_platform_admin());

create policy "Read verified courses or own partner courses" on public.golf_courses
  for select to anon, authenticated using (
    (verification_status = 'verified' and is_published)
    or private.is_partner_member(partner_id)
    or private.is_platform_admin()
  );
create policy "Partners add pending courses" on public.golf_courses
  for insert to authenticated with check (
    private.is_partner_member(partner_id, array['owner', 'manager'])
    and exists (
      select 1 from public.partner_organizations as organization
      where organization.id = partner_id
        and organization.verification_status = 'verified'
    )
    and verification_status = 'pending'
    and not is_published
  );
create policy "Admins manage courses" on public.golf_courses
  for all to authenticated using (private.is_platform_admin())
  with check (private.is_platform_admin());
create policy "Partners update own courses" on public.golf_courses
  for update to authenticated using (
    private.is_partner_member(partner_id, array['owner', 'manager'])
    or private.is_platform_admin()
  ) with check (
    private.is_partner_member(partner_id, array['owner', 'manager'])
    or private.is_platform_admin()
  );
create policy "Partners delete own pending courses" on public.golf_courses
  for delete to authenticated using (
    verification_status = 'pending'
    and private.is_partner_member(partner_id, array['owner', 'manager'])
  );

create policy "Read future tee times for verified courses" on public.tee_times
  for select to anon, authenticated using (
    is_active and starts_at > now() and exists (
      select 1 from public.golf_courses as course
      where course.id = course_id
        and course.verification_status = 'verified'
        and course.is_published
    )
    or exists (
      select 1 from public.golf_courses as course
      where course.id = course_id
        and (
          private.is_partner_member(course.partner_id)
          or private.is_platform_admin()
        )
    )
  );
create policy "Partners manage own tee times" on public.tee_times
  for all to authenticated using (
    exists (
      select 1 from public.golf_courses as course
      where course.id = course_id
        and course.verification_status = 'verified'
        and course.is_published
        and exists (
          select 1 from public.partner_organizations as organization
          where organization.id = course.partner_id
            and organization.verification_status = 'verified'
        )
        and private.is_partner_member(course.partner_id, array['owner', 'manager'])
    )
    or private.is_platform_admin()
  ) with check (
    exists (
      select 1 from public.golf_courses as course
      where course.id = course_id
        and course.verification_status = 'verified'
        and course.is_published
        and exists (
          select 1 from public.partner_organizations as organization
          where organization.id = course.partner_id
            and organization.verification_status = 'verified'
        )
        and private.is_partner_member(course.partner_id, array['owner', 'manager'])
    )
    or private.is_platform_admin()
  );

create policy "Golfer and owning partner read bookings" on public.bookings
  for select to authenticated using (
    golfer_id = auth.uid()
    or private.is_platform_admin()
    or exists (
      select 1
      from public.tee_times as tt
      join public.golf_courses as course on course.id = tt.course_id
      where tt.id = tee_time_id
        and private.is_partner_member(course.partner_id)
    )
  );

create policy "Golfer and owning partner read booking history"
  on public.booking_status_history
  for select to authenticated using (
    exists (
      select 1 from public.bookings as booking
      where booking.id = booking_id
        and (
          booking.golfer_id = auth.uid()
          or private.is_platform_admin()
          or exists (
            select 1
            from public.tee_times as tt
            join public.golf_courses as course on course.id = tt.course_id
            where tt.id = booking.tee_time_id
              and private.is_partner_member(course.partner_id)
          )
        )
    )
  );

revoke all on public.profiles, public.user_roles, public.partner_organizations,
  public.partner_members, public.golf_courses, public.tee_times, public.bookings,
  public.booking_status_history from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, city) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.partner_organizations to authenticated;
grant select on public.partner_organizations to anon;
grant select, insert, update, delete on public.partner_members to authenticated;
grant select, insert, update, delete on public.golf_courses to authenticated;
grant select on public.golf_courses to anon;
grant select, insert, update, delete on public.tee_times to authenticated;
grant select on public.tee_times to anon;
grant select on public.bookings, public.booking_status_history to authenticated;
revoke all on function public.create_booking(uuid, integer, uuid) from public, anon;
grant execute on function public.create_booking(uuid, integer, uuid) to authenticated;
revoke all on function public.list_course_availability(uuid) from public;
grant execute on function public.list_course_availability(uuid) to anon, authenticated;
revoke all on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;
revoke all on function public.expire_my_pending_bookings() from public, anon;
grant execute on function public.expire_my_pending_bookings() to authenticated;
revoke all on function private.is_platform_admin() from public, anon, authenticated;
revoke all on function private.is_partner_member(uuid, text[]) from public, anon, authenticated;
grant execute on function private.is_platform_admin() to anon, authenticated;
grant execute on function private.is_partner_member(uuid, text[]) to anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.prevent_course_verification_change()
  from public, anon, authenticated;
