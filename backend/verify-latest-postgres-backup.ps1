$backupDir = Join-Path $PSScriptRoot "postgres-backups"

if (-not (Test-Path $backupDir)) {
  Write-Error "Backup folder not found: $backupDir"
  exit 1
}

$latest = Get-ChildItem -Path $backupDir -Filter "*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $latest) {
  Write-Error "No PostgreSQL backup file found."
  exit 1
}

$ageHours = ((Get-Date) - $latest.LastWriteTime).TotalHours

if ($latest.Length -le 0) {
  Write-Error "Latest backup file is empty: $($latest.FullName)"
  exit 1
}

Write-Host "Latest backup:" $latest.FullName
Write-Host "Size:" $latest.Length "bytes"
Write-Host "Age (hours):" ([math]::Round($ageHours, 2))

if ($ageHours -gt 24) {
  Write-Warning "Latest backup is older than 24 hours."
  exit 2
}
