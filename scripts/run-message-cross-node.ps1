param(
  [switch]$Exercise
)

$ErrorActionPreference = 'Stop'
$origin = 'https://winga-pflp.onrender.com'

function Get-TestSessionToken {
  param(
    [string]$Identifier,
    [Security.SecureString]$Password
  )

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  try {
    $csrf = Invoke-RestMethod -Uri "$origin/api/auth/csrf-token" -WebSession $session -TimeoutSec 20
    if (-not $csrf.csrfToken) { throw 'CSRF response was incomplete.' }

    $plainPassword = [System.Net.NetworkCredential]::new('', $Password).Password
    try {
      $body = @{ identifier = $Identifier; password = $plainPassword } | ConvertTo-Json -Compress
      $null = Invoke-RestMethod -Uri "$origin/api/auth/login" -Method Post -WebSession $session `
        -Headers @{ 'X-CSRF-Token' = $csrf.csrfToken } -ContentType 'application/json' `
        -Body $body -TimeoutSec 20
    } finally {
      $body = $null
      $plainPassword = $null
    }

    $cookie = $session.Cookies.GetCookies([uri]$origin)['winga_auth']
    if (-not $cookie -or -not $cookie.Value) { throw 'Login did not return an auth cookie.' }
    return $cookie.Value
  } catch {
    throw 'Test-account login failed. Check the identifier and password privately.'
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is required to run the cross-node verifier.'
}

$receiverIdentifier = Read-Host 'Receiver login identifier'
$receiverUsername = Read-Host 'Receiver exact Winga username'
$receiverPassword = Read-Host 'Receiver password' -AsSecureString
$senderIdentifier = Read-Host 'Sender login identifier'
$senderPassword = Read-Host 'Sender password' -AsSecureString
$opsToken = Read-Host 'OPS_HEALTH_TOKEN from Render' -AsSecureString

try {
  $env:WINGA_FAILOVER_ORIGIN = $origin
  $env:WINGA_TEST_RECEIVER = $receiverUsername
  $env:WINGA_RECEIVER_SESSION_TOKEN = Get-TestSessionToken $receiverIdentifier $receiverPassword
  $env:WINGA_SENDER_SESSION_TOKEN = Get-TestSessionToken $senderIdentifier $senderPassword
  $env:OPS_HEALTH_TOKEN = [System.Net.NetworkCredential]::new('', $opsToken).Password

  $arguments = @('scripts/verify-message-cross-node.js')
  if ($Exercise) { $arguments += @('--exercise', '--confirm-test-send') }
  & node @arguments
  exit $LASTEXITCODE
} finally {
  foreach ($name in @('WINGA_FAILOVER_ORIGIN', 'WINGA_TEST_RECEIVER',
      'WINGA_RECEIVER_SESSION_TOKEN', 'WINGA_SENDER_SESSION_TOKEN', 'OPS_HEALTH_TOKEN')) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  $receiverPassword.Dispose()
  $senderPassword.Dispose()
  $opsToken.Dispose()
}
