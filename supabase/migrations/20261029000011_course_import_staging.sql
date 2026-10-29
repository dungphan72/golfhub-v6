create table private.course_import_batches (
  source_sha256 text primary key check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_file_name text not null,
  source_schema_version text not null,
  collected_on date not null,
  declared_record_count integer not null check (declared_record_count > 0),
  imported_at timestamptz not null default pg_catalog.now()
);

create table private.golf_course_import_staging (
  source_id text not null,
  source_sha256 text not null
    references private.course_import_batches (source_sha256) on delete restrict,
  collected_on date not null,
  name_vi text not null,
  venue_type text not null,
  operating_status_reported text not null,
  verification_status text not null,
  publication_status text not null check (publication_status = 'draft'),
  booking_enabled boolean not null check (not booking_enabled),
  record jsonb not null check (pg_catalog.jsonb_typeof(record) = 'object'),
  imported_at timestamptz not null default pg_catalog.now(),
  primary key (source_id, source_sha256),
  check (record ->> 'id' = source_id),
  check (record ->> 'name_vi' = name_vi),
  check (record ->> 'venue_type' = venue_type),
  check (record ->> 'operating_status_reported' = operating_status_reported),
  check (record ->> 'verification_status' = verification_status),
  check (record ->> 'publication_status' = publication_status),
  check (record ->> 'booking_enabled' = 'false')
);

create index golf_course_import_staging_review_idx
  on private.golf_course_import_staging (source_sha256, operating_status_reported);

alter table private.course_import_batches enable row level security;
alter table private.golf_course_import_staging enable row level security;

revoke all on private.course_import_batches, private.golf_course_import_staging
  from public, anon, authenticated, service_role;
