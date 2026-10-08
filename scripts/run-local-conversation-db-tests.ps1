param([int]$Port=55440,[switch]$RoomsOnly,[switch]$RoomConcurrencyOnly,[string]$TestNamePattern)
$ErrorActionPreference='Stop'
if($Port -lt 49152 -or $Port -gt 65535){throw 'Use an unprivileged disposable test port (49152-65535).'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$installed=Get-ChildItem -LiteralPath 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^\d+$' } | Sort-Object { [int]$_.Name } -Descending
$bin=$null
foreach($version in $installed){
  $candidate=Join-Path $version.FullName 'bin'
  if(Test-Path -LiteralPath (Join-Path $candidate 'initdb.exe')){$bin=$candidate;break}
}
if(!$bin){throw 'Install PostgreSQL binaries first; this runner never uses DATABASE_URL or downloads an executable.'}
if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){throw 'Disposable test port is occupied.'}
$data=[IO.Path]::GetFullPath((Join-Path $root ('.tmp-conversation-postgres-tests-'+[Guid]::NewGuid().ToString('N'))))
if([IO.Path]::GetDirectoryName($data) -ne $root -or (Test-Path -LiteralPath $data)){throw 'Unsafe disposable cluster path.'}
$previous=$env:WINGA_TEST_POSTGRES_URL
$previousRooms=$env:WINGA_TEST_SHOPPING_ROOMS_POSTGRES
$started=$false
Push-Location -LiteralPath $root
try {
  & (Join-Path $bin 'initdb.exe') "--pgdata=$data" --username=winga_test --auth-local=trust --auth-host=trust --encoding=UTF8 --no-locale
  if($LASTEXITCODE -ne 0){throw 'Test cluster initialization failed.'}
  $args=@('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $data 'test-server.log')+'"'),'-o',('"-p '+$Port+' -h 127.0.0.1 -c max_connections=30"'),'-w','start')
  $process=Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $args -WindowStyle Hidden -PassThru
  if(!$process.WaitForExit(60000)){throw 'Test cluster start timed out.'}
  if($process.ExitCode -ne 0){throw 'Test cluster start failed.'}
  $started=$true
  $env:WINGA_TEST_POSTGRES_URL="postgresql://winga_test@127.0.0.1:$Port/postgres"
  $env:WINGA_TEST_SHOPPING_ROOMS_POSTGRES='true'
  $tests=@('tests/shopping-rooms-service.test.mjs')
  if(!$RoomsOnly -and !$RoomConcurrencyOnly){$tests=@('tests/conversation-event-concurrency.test.js','tests/encrypted-conversation-concurrency.test.js','tests/conversation-operations.test.js')+$tests}
  if($TestNamePattern){& node --test --test-concurrency=1 ('--test-name-pattern='+$TestNamePattern) @tests}
  elseif($RoomConcurrencyOnly){& node --test --test-concurrency=1 '--test-name-pattern=PostgreSQL Rooms:' @tests}
  else{& node --test --test-concurrency=1 @tests}
  if($LASTEXITCODE -ne 0){throw 'Conversation PostgreSQL tests failed.'}
} finally {
  $env:WINGA_TEST_POSTGRES_URL=$previous
  $env:WINGA_TEST_SHOPPING_ROOMS_POSTGRES=$previousRooms
  # Stop only this run's fresh cluster, never a Windows database service or an existing data directory.
  if($started -or (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid'))){
    & (Join-Path $bin 'pg_ctl.exe') -D $data -m fast -w -t 180 stop
    if($LASTEXITCODE -ne 0){
      & (Join-Path $bin 'pg_ctl.exe') -D $data status
      if($LASTEXITCODE -ne 3){
        # This is a fresh synthetic cluster; an immediate stop is limited to its exact data directory.
        & (Join-Path $bin 'pg_ctl.exe') -D $data -m immediate -w -t 30 stop
        if($LASTEXITCODE -ne 0){
          & (Join-Path $bin 'pg_ctl.exe') -D $data status
          if($LASTEXITCODE -ne 3){throw 'Disposable test cluster shutdown failed; retained its data for diagnosis.'}
        }
      }
    }
  }
  Pop-Location
}
