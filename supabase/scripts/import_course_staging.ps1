param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath
)

$ErrorActionPreference = "Stop"

$resolvedArchive = Resolve-Path -LiteralPath $ArchivePath
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedArchive.Path)
try {
  $entry = $archive.GetEntry("courses.json")
  if (-not $entry) {
    throw "Archive does not contain courses.json."
  }

  $reader = [System.IO.StreamReader]::new($entry.Open())
  try {
    $dataset = ConvertFrom-Json -InputObject $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
} finally {
  $archive.Dispose()
}

$courses = @($dataset.courses)
$declaredCount = [int]$dataset.metadata.record_count
if ($courses.Count -eq 0 -or $courses.Count -ne $declaredCount) {
  throw "Course record count does not match the archive metadata."
}

if (@($courses | Group-Object id | Where-Object { $_.Count -gt 1 }).Count -gt 0) {
  throw "Duplicate source IDs found."
}

$unsafeRecords = @($courses | Where-Object {
  $_.publication_status -ne "draft" -or
  $_.booking_enabled -ne $false -or
  $_.admin_verification_status -ne "unverified" -or
  $_.verification_status -notin @("secondary_source_only", "partial_primary_verification") -or
  $_.operating_status_reported -notin @(
    "listed_without_construction_flag",
    "under_construction",
    "conflicting_sources"
  )
})
if ($unsafeRecords.Count -gt 0) {
  throw "Found $($unsafeRecords.Count) records with unsupported or unsafe states."
}

$collectedOn = [DateTime]::ParseExact(
  [string]$dataset.metadata.collected_on,
  "yyyy-MM-dd",
  [Globalization.CultureInfo]::InvariantCulture
).ToString("yyyy-MM-dd")
$sourceHash = (Get-FileHash -LiteralPath $resolvedArchive.Path -Algorithm SHA256).Hash.ToLowerInvariant()
$sourceFileName = [IO.Path]::GetFileName($resolvedArchive.Path)

function ConvertTo-SqlLiteral([string]$value) {
  return "'" + $value.Replace("'", "''") + "'"
}

$sqlPath = Join-Path $env:TEMP ("golfhub-course-import-" + [Guid]::NewGuid().ToString("N") + ".sql")
try {
  $rows = [System.Collections.Generic.List[string]]::new()
  foreach ($course in $courses) {
    $recordJson = ConvertTo-Json -InputObject $course -Depth 40 -Compress
    $rows.Add(
      "(" +
      (ConvertTo-SqlLiteral ([string]$course.id)) + ", " +
      (ConvertTo-SqlLiteral $sourceHash) + ", " +
      (ConvertTo-SqlLiteral $collectedOn) + ", " +
      (ConvertTo-SqlLiteral ([string]$course.name_vi)) + ", " +
      (ConvertTo-SqlLiteral ([string]$course.venue_type)) + ", " +
      (ConvertTo-SqlLiteral ([string]$course.operating_status_reported)) + ", " +
      (ConvertTo-SqlLiteral ([string]$course.verification_status)) + ", " +
      (ConvertTo-SqlLiteral ([string]$course.publication_status)) + ", " +
      "false, " +
      (ConvertTo-SqlLiteral $recordJson) + "::jsonb)"
    )
  }

  $batchInsert = @"
insert into private.course_import_batches (
  source_sha256, source_file_name, source_schema_version, collected_on, declared_record_count
)
values (
  $(ConvertTo-SqlLiteral $sourceHash),
  $(ConvertTo-SqlLiteral $sourceFileName),
  $(ConvertTo-SqlLiteral ([string]$dataset.metadata.schema_version)),
  $(ConvertTo-SqlLiteral $collectedOn),
  $declaredCount
)
on conflict (source_sha256) do nothing;
"@

  $recordInsert = @"
insert into private.golf_course_import_staging (
  source_id, source_sha256, collected_on, name_vi, venue_type,
  operating_status_reported, verification_status, publication_status,
  booking_enabled, record
)
values
$($rows -join ",`r`n")
on conflict (source_id, source_sha256) do nothing;
"@

  $verification = @"
do `$verify`$
declare
  actual integer;
  unsafe integer;
begin
  select count(*) into actual
  from private.golf_course_import_staging
  where source_sha256 = $(ConvertTo-SqlLiteral $sourceHash);

  if actual <> $declaredCount then
    raise exception 'Import count mismatch: expected %, found %', $declaredCount, actual;
  end if;

  select count(*) into unsafe
  from private.golf_course_import_staging
  where source_sha256 = $(ConvertTo-SqlLiteral $sourceHash)
    and (
      publication_status <> 'draft'
      or booking_enabled
      or record ->> 'admin_verification_status' <> 'unverified'
    );

  if unsafe <> 0 then
    raise exception 'Unsafe staged records found: %', unsafe;
  end if;
end
`$verify`$;
"@

  $summary = @"
select
  batch.source_file_name,
  batch.source_sha256,
  batch.declared_record_count,
  count(staging.source_id) as staged_records,
  count(*) filter (
    where staging.publication_status = 'draft'
      and not staging.booking_enabled
      and staging.record ->> 'admin_verification_status' = 'unverified'
  ) as safe_draft_records
from private.course_import_batches as batch
left join private.golf_course_import_staging as staging using (source_sha256)
where batch.source_sha256 = $(ConvertTo-SqlLiteral $sourceHash)
group by batch.source_file_name, batch.source_sha256, batch.declared_record_count;
"@

  $sql = @"
begin;
$batchInsert
$recordInsert
$verification
commit;
$summary
"@

  [IO.File]::WriteAllText(
    $sqlPath,
    $sql,
    (New-Object System.Text.UTF8Encoding($false))
  )

  Write-Output "Validated $declaredCount draft records from $sourceFileName."
  Write-Output "Source SHA-256: $sourceHash"

  & npx supabase db query --linked --file $sqlPath
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase import failed with exit code $LASTEXITCODE."
  }
} finally {
  if (Test-Path -LiteralPath $sqlPath) {
    Remove-Item -LiteralPath $sqlPath
  }
}
