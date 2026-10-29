alter table private.golf_course_import_staging
  add constraint golf_course_import_staging_verification_status_check
  check (verification_status in (
    'secondary_source_only',
    'partial_primary_verification'
  ));

alter table private.golf_course_import_staging
  add constraint golf_course_import_staging_admin_unverified_check
  check (record ->> 'admin_verification_status' = 'unverified');

alter table private.golf_course_import_staging
  add constraint golf_course_import_staging_collection_date_check
  check (record ->> 'collected_on' = collected_on::text);
