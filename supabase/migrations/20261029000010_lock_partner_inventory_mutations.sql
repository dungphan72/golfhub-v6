drop policy "Partners update own courses" on public.golf_courses;
create policy "Owners and managers update own course details" on public.golf_courses
  for update to authenticated using (
    private.is_partner_member(partner_id, array['owner', 'manager'])
    or private.is_platform_admin()
  ) with check (
    private.is_partner_member(partner_id, array['owner', 'manager'])
    or private.is_platform_admin()
  );

revoke update on public.golf_courses from authenticated;
grant update (name, city, province, address, description, amenities)
  on public.golf_courses to authenticated;

revoke update, delete on public.tee_times from authenticated;
