create table public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references auth.users (id) on delete restrict,
  business_name text not null check (length(trim(business_name)) between 2 and 160),
  partner_type text not null check (
    partner_type in ('course', 'range', 'simulator', 'academy', 'club', 'retailer', 'other')
  ),
  contact_name text not null check (length(trim(contact_name)) between 2 and 160),
  contact_email text not null check (length(contact_email) <= 254),
  contact_phone text not null check (length(trim(contact_phone)) between 6 and 32),
  city text not null check (length(trim(city)) between 2 and 100),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected')
  ),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index partner_applications_one_pending_per_user_idx
  on public.partner_applications (applicant_id)
  where status = 'pending';
create index partner_applications_status_created_idx
  on public.partner_applications (status, created_at);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

alter table public.partner_applications enable row level security;
alter table public.audit_logs enable row level security;

create policy "Admins read user profiles" on public.profiles
  for select to authenticated using (private.is_platform_admin());
create policy "Applicants and admins read applications"
  on public.partner_applications for select to authenticated using (
    applicant_id = auth.uid() or private.is_platform_admin()
  );
create policy "Admins read audit log"
  on public.audit_logs for select to authenticated using (private.is_platform_admin());

revoke all on public.partner_applications, public.audit_logs from public, anon, authenticated;
grant select on public.partner_applications to authenticated;
grant select on public.audit_logs to authenticated;

create function public.submit_partner_application(
  requested_business_name text,
  requested_partner_type text,
  requested_contact_name text,
  requested_contact_email text,
  requested_contact_phone text,
  requested_city text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  application_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if length(trim(requested_business_name)) not between 2 and 160
     or requested_partner_type not in ('course', 'range', 'simulator', 'academy', 'club', 'retailer', 'other')
     or length(trim(requested_contact_name)) not between 2 and 160
     or length(trim(requested_contact_email)) not between 3 and 254
     or requested_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(trim(requested_contact_phone)) not between 6 and 32
     or length(trim(requested_city)) not between 2 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_PARTNER_APPLICATION';
  end if;

  insert into public.partner_applications (
    applicant_id,
    business_name,
    partner_type,
    contact_name,
    contact_email,
    contact_phone,
    city
  )
  values (
    actor_id,
    trim(requested_business_name),
    requested_partner_type,
    trim(requested_contact_name),
    pg_catalog.lower(trim(requested_contact_email)),
    trim(requested_contact_phone),
    trim(requested_city)
  )
  returning id into application_id;

  return application_id;
end;
$$;

create function public.review_partner_application(
  requested_application_id uuid,
  requested_decision text,
  requested_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  application public.partner_applications%rowtype;
  organization_id uuid;
begin
  if actor_id is null or not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ACCESS_REQUIRED';
  end if;

  if requested_decision is null
     or requested_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_DECISION';
  end if;

  select * into application
  from public.partner_applications
  where id = requested_application_id
  for update;

  if not found or application.status <> 'pending' then
    raise exception using errcode = 'P0002', message = 'APPLICATION_NOT_PENDING';
  end if;

  if requested_decision = 'approve' then
    if requested_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception using errcode = '22023', message = 'INVALID_ORGANIZATION_SLUG';
    end if;

    insert into public.partner_organizations (
      name, slug, partner_type, verification_status
    )
    values (
      application.business_name, requested_slug, application.partner_type, 'verified'
    )
    returning id into organization_id;

    insert into public.partner_members (partner_id, user_id, role)
    values (organization_id, application.applicant_id, 'owner');
  end if;

  update public.partner_applications
  set status = case when requested_decision = 'approve' then 'approved' else 'rejected' end,
      reviewed_by = actor_id,
      reviewed_at = pg_catalog.now()
  where id = application.id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'partner_application_' || requested_decision,
    'partner_application',
    application.id,
    pg_catalog.jsonb_build_object('decision', requested_decision)
  );

  return organization_id;
end;
$$;

create function public.review_golf_course(
  requested_course_id uuid,
  requested_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  next_status text;
begin
  if actor_id is null or not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ACCESS_REQUIRED';
  end if;

  if requested_decision is null
     or requested_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_DECISION';
  end if;

  next_status := case when requested_decision = 'approve' then 'verified' else 'rejected' end;

  update public.golf_courses
  set verification_status = next_status,
      is_published = requested_decision = 'approve'
  where id = requested_course_id
    and verification_status = 'pending';

  if not found then
    raise exception using errcode = 'P0002', message = 'COURSE_NOT_PENDING';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'course_' || requested_decision,
    'golf_course',
    requested_course_id,
    pg_catalog.jsonb_build_object('decision', requested_decision)
  );
end;
$$;

revoke all on function public.submit_partner_application(text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_partner_application(text, text, text, text, text, text) to authenticated;
revoke all on function public.review_partner_application(uuid, text, text) from public, anon;
grant execute on function public.review_partner_application(uuid, text, text) to authenticated;
revoke all on function public.review_golf_course(uuid, text) from public, anon;
grant execute on function public.review_golf_course(uuid, text) to authenticated;
