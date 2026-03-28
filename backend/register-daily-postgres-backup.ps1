$taskName = "WINGA PostgreSQL Daily Backup"
$taskTime = "21:00"
$scriptPath = Join-Path $PSScriptRoot "backup-postgres-task.bat"

if (-not (Test-Path $scriptPath)) {
  Write-Error "Backup task script not found: $scriptPath"
  exit 1
}

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At $taskTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Daily backup of WINGA PostgreSQL database" | Out-Null

Write-Host "Scheduled task created successfully."
Write-Host "Task: $taskName"
Write-Host "Time: $taskTime"
