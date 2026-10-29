param(
  [ValidateSet("Setup", "Cleanup")]
  [string]$Action = "Setup"
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$statePath = Join-Path ([System.IO.Path]::GetTempPath()) "golfhub-mvp-e2e-fixture.json"
$sqlRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("golfhub-e2e-sql-" + [guid]::NewGuid())
$null = New-Item -ItemType Directory -Path $sqlRoot

function Write-SqlFile {
  param(
    [string]$Name,
    [string]$Sql
  )

  $path = Join-Path $sqlRoot $Name
  [System.IO.File]::WriteAllText($path, $Sql, [System.Text.UTF8Encoding]::new($false))
  return $path
}

function Invoke-SupabaseQuery {
  param([string]$SqlFile)

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & npx.cmd supabase db query --linked --file $SqlFile 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }

  $text = $output -join [Environment]::NewLine
  if ($exitCode -ne 0) {
    throw "Supabase query failed (exit $exitCode): $text"
  }

  $jsonStart = $text.IndexOf("{")
  if ($jsonStart -lt 0) {
    throw "Supabase query returned no JSON result: $text"
  }

  return $text.Substring($jsonStart) | ConvertFrom-Json
}

function Invoke-Cleanup {
  if (-not (Test-Path -LiteralPath $statePath)) {
    Write-Output "No saved end-to-end fixture found."
    return
  }

  $fixture = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  foreach ($id in @($fixture.PartnerId, $fixture.CourseId, $fixture.TeeTimeId)) {
    $parsedId = [guid]::Empty
    if (-not [guid]::TryParse([string]$id, [ref]$parsedId)) {
      throw "Saved fixture state contains an invalid identifier."
    }
  }

  $cleanupSql = @"
begin;
delete from public.notifications
where related_booking_id in (
  select id from public.bookings where tee_time_id = '$($fixture.TeeTimeId)'
);
delete from public.booking_status_history
where booking_id in (
  select id from public.bookings where tee_time_id = '$($fixture.TeeTimeId)'
);
delete from public.bookings where tee_time_id = '$($fixture.TeeTimeId)';
delete from public.tee_times where id = '$($fixture.TeeTimeId)';
delete from public.golf_courses where id = '$($fixture.CourseId)';
delete from public.partner_members where partner_id = '$($fixture.PartnerId)';
delete from public.partner_organizations where id = '$($fixture.PartnerId)';
commit;
"@
  $null = Invoke-SupabaseQuery -SqlFile (Write-SqlFile -Name "cleanup.sql" -Sql $cleanupSql)
  Remove-Item -LiteralPath $statePath -Force
  Write-Output "End-to-end test course, tee time, and any test booking were removed."
}

try {
  Set-Location $projectRoot

  if ($Action -eq "Cleanup") {
    Invoke-Cleanup
    return
  }

  if (Test-Path -LiteralPath $statePath) {
    throw "An end-to-end fixture is already recorded. Clean it up before creating another."
  }

  $userResult = Invoke-SupabaseQuery -SqlFile (Write-SqlFile -Name "user.sql" -Sql @"
select id
from auth.users
where deleted_at is null and email_confirmed_at is not null
order by created_at asc
limit 1;
"@)
  if (@($userResult.rows).Count -lt 1) {
    throw "At least one confirmed test golfer is required."
  }

  $userId = [string]$userResult.rows[0].id
  $partnerId = [guid]::NewGuid().ToString()
  $courseId = [guid]::NewGuid().ToString()
  $teeTimeId = [guid]::NewGuid().ToString()
  $suffix = [guid]::NewGuid().ToString("N").Substring(0, 12)
  $slug = "mvp-e2e-$suffix"
  $courseSlug = "$slug-course"

  $setupSql = @"
begin;
insert into public.partner_organizations (id, name, slug, partner_type, verification_status)
values ('$partnerId', 'TEST ONLY - Golf Hub E2E', '$slug', 'course', 'verified');
insert into public.partner_members (partner_id, user_id, role)
values ('$partnerId', '$userId', 'owner');
insert into public.golf_courses (
  id, partner_id, name, slug, city, province, address, description,
  verification_status, is_published
)
values (
  '$courseId', '$partnerId', 'TEST ONLY - Disposable Golf Hub QA Course',
  '$courseSlug', 'Test QA', 'Test Environment', 'Disposable test fixture - not a real golf course',
  'Temporary fixture for verifying course discovery and the booking flow. Not a real venue.',
  'verified', true
);
insert into public.tee_times (
  id, course_id, starts_at, ends_at, price_per_player_minor, capacity
)
values (
  '$teeTimeId', '$courseId', now() + interval '3 days',
  now() + interval '3 days 4 hours', 120000, 1
);
commit;
"@

  $null = Invoke-SupabaseQuery -SqlFile (Write-SqlFile -Name "setup.sql" -Sql $setupSql)
  $state = [ordered]@{
    PartnerId = $partnerId
    CourseId = $courseId
    TeeTimeId = $teeTimeId
    CourseSlug = $courseSlug
  }
  [System.IO.File]::WriteAllText(
    $statePath,
    ($state | ConvertTo-Json),
    [System.Text.UTF8Encoding]::new($false)
  )

  Write-Output "Temporary test fixture created; it is labeled TEST ONLY and is not a real venue."
  Write-Output "Course URL: http://127.0.0.1:3000/courses/$courseSlug"
  Write-Output "Cleanup: powershell -NoProfile -ExecutionPolicy Bypass -File supabase\tests\mvp_e2e_fixture.ps1 -Action Cleanup"
}
finally {
  Remove-Item -LiteralPath $sqlRoot -Recurse -Force -ErrorAction SilentlyContinue
}
