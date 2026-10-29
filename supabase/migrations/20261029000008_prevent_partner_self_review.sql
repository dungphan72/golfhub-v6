create or replace function public.review_partner_application(
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

  if application.applicant_id = actor_id then
    raise exception using errcode = '42501', message = 'PARTNER_APPLICATION_SELF_REVIEW_NOT_ALLOWED';
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
