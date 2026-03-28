$taskName = "WINGA PostgreSQL Daily Backup"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if (-not $existing) {
  Write-Host "Scheduled backup task does not exist."
  exit 0
}

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Host "Scheduled backup task removed."
