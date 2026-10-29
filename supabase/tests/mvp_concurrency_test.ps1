$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("golfhub-concurrency-" + [guid]::NewGuid())
$null = New-Item -ItemType Directory -Path $tempRoot

function Write-SqlFile {
  param(
    [string]$Name,
    [string]$Sql
  )

  $path = Join-Path $tempRoot $Name
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

$partnerId = [guid]::NewGuid().ToString()
$courseId = [guid]::NewGuid().ToString()
$teeTimeId = [guid]::NewGuid().ToString()
$idempotencyKeyA = [guid]::NewGuid().ToString()
$idempotencyKeyB = [guid]::NewGuid().ToString()
$slugSuffix = [guid]::NewGuid().ToString("N").Substring(0, 12)
$setupStarted = $false
$jobs = @()

try {
  Set-Location $projectRoot

  $usersResult = Invoke-SupabaseQuery -SqlFile (Write-SqlFile -Name "users.sql" -Sql @"
select id
from auth.users
where deleted_at is null and email_confirmed_at is not null
order by created_at asc
limit 2;
"@)
  $users = @($usersResult.rows)
  if ($users.Count -lt 2) {
    throw "Two confirmed test golfers are required."
  }

  $userA = [string]$users[0].id
  $userB = [string]$users[1].id

  $setupSql = @"
insert into public.partner_organizations (id, name, slug, partner_type, verification_status)
values ('$partnerId', 'Temporary concurrency test', 'mvp-concurrency-$slugSuffix', 'course', 'verified');
insert into public.partner_members (partner_id, user_id, role)
values ('$partnerId', '$userA', 'owner');
insert into public.golf_courses (
  id, partner_id, name, slug, city, province, address, verification_status, is_published
)
values (
  '$courseId', '$partnerId', 'Temporary concurrency course', 'mvp-concurrency-course-$slugSuffix',
  'Test', 'Test', 'Temporary fixture', 'verified', true
);
insert into public.tee_times (
  id, course_id, starts_at, ends_at, price_per_player_minor, capacity
)
values (
  '$teeTimeId', '$courseId', now() + interval '1 day', now() + interval '1 day 3 hours',
  100000, 1
);
"@
  $setupStarted = $true
  $null = Invoke-SupabaseQuery -SqlFile (Write-SqlFile -Name "setup.sql" -Sql $setupSql)

  $requestASql = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$userA', true);
select id from public.tee_times where id = '$teeTimeId' for update;
select pg_catalog.pg_sleep(5);
select public.create_booking('$teeTimeId', 1, '$idempotencyKeyA');
commit;
"@
  $requestBSql = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$userB', true);
select public.create_booking('$teeTimeId', 1, '$idempotencyKeyB');
commit;
"@
  $requestAFile = Write-SqlFile -Name "request-a.sql" -Sql $requestASql
  $requestBFile = Write-SqlFile -Name "request-b.sql" -Sql $requestBSql

  $jobBlock = {
    param($Root, $SqlFile)
    Set-Location $Root
    $ErrorActionPreference = "Continue"
    $attempt = 0
    do {
      $attempt++
      $result = & npx.cmd supabase db query --linked --file $SqlFile 2>&1
      $exitCode = $LASTEXITCODE
      $text = $result -join [Environment]::NewLine
      if ($exitCode -eq 0 -or -not $text.Contains("DbConfigConnectTempRoleError")) {
        break
      }
      Start-Sleep -Seconds 2
    } while ($attempt -lt 3)

    [pscustomobject]@{
      ExitCode = $exitCode
      Text = $text
    }
  }

  $jobs += Start-Job -ScriptBlock $jobBlock -ArgumentList $projectRoot, $requestAFile
  Start-Sleep -Seconds 2
  $jobs += Start-Job -ScriptBlock $jobBlock -ArgumentList $projectRoot, $requestBFile

  $jobResults = @()
  foreach ($job in $jobs) {
    $jobResults += Receive-Job -Job $job -Wait
  }

  $successCount = @($jobResults | Where-Object { $_.ExitCode -eq 0 }).Count
  $capacityRejectionCount = @(
    $jobResults | Where-Object {
      $_.ExitCode -ne 0 -and $_.Text.Contains("TEE_TIME_FULL")
    }
  ).Count

  if ($successCount -ne 1 -or $capacityRejectionCount -ne 1) {
    $details = ($jobResults | ForEach-Object { "exit $($_.ExitCode): $($_.Text)" }) -join "`n"
    throw "Expected one successful booking and one TEE_TIME_FULL rejection. Results:`n$details"
  }

  $verifySql = @"
select count(*) as active_bookings
from public.bookings
where tee_time_id = '$teeTimeId'
  and (status = 'confirmed' or (status = 'pending_payment' and expires_at > now()));
"@
  $verification = Invoke-SupabaseQuery -SqlFile (Write-SqlFile -Name "verify.sql" -Sql $verifySql)
  if ([int]$verification.rows[0].active_bookings -ne 1) {
    throw "Expected exactly one active booking after the concurrent requests."
  }

  Write-Output "PASS: two concurrent authenticated requests produced one booking and one TEE_TIME_FULL rejection."
}
finally {
  foreach ($job in $jobs) {
    if ($job.State -eq "Running") {
      Stop-Job -Job $job
    }
    Remove-Job -Job $job -Force
  }

  if ($setupStarted) {
    $cleanupSql = @"
delete from public.notifications
where related_booking_id in (
  select id from public.bookings where tee_time_id = '$teeTimeId'
);
delete from public.booking_status_history
where booking_id in (
  select id from public.bookings where tee_time_id = '$teeTimeId'
);
delete from public.bookings where tee_time_id = '$teeTimeId';
delete from public.tee_times where id = '$teeTimeId';
delete from public.golf_courses where id = '$courseId';
delete from public.partner_members where partner_id = '$partnerId';
delete from public.partner_organizations where id = '$partnerId';
"@
    try {
      $null = Invoke-SupabaseQuery -SqlFile (Write-SqlFile -Name "cleanup.sql" -Sql $cleanupSql)
    }
    catch {
      Write-Error "Could not clean up temporary concurrency fixtures: $_"
    }
  }

  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
