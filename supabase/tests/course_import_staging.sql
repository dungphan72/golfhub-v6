begin;

do $$
begin
  if has_table_privilege(
    'service_role',
    'private.course_import_batches',
    'select'
  ) or has_table_privilege(
    'service_role',
    'private.golf_course_import_staging',
    'select'
  ) then
    raise exception 'Service role unexpectedly has access to private course import staging';
  end if;
end;
$$;

set local role authenticated;

do $$
begin
  begin
    perform count(*) from private.course_import_batches;
    raise exception 'Authenticated role read private course import batches';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform count(*) from private.golf_course_import_staging;
    raise exception 'Authenticated role read private course import staging';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    execute $statement$
      insert into private.course_import_batches (
        source_sha256,
        source_file_name,
        source_schema_version,
        collected_on,
        declared_record_count
      )
      values (
        repeat('0', 64),
        'unauthorized.json',
        'test',
        current_date,
        1
      )
    $statement$;
    raise exception 'Authenticated role inserted into private course import staging';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

rollback;
