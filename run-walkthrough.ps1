$ErrorActionPreference = "Continue"
Set-Location "d:\oneshot_e2e_StrandsAgentsSDK"
$env:ONESHOT_API_TOKEN = "oneshot-e2e-dev-token"
$env:ONESHOT_MODE = "sample"
$env:ONESHOT_NO_OPEN = "1"
$env:ONESHOT_WORKSPACE_ROOT = "d:\oneshot_e2e_StrandsAgentsSDK\.runtime\demo-target"
$env:PORT = "8787"
$env:API_RATE_LIMIT_WINDOW_MS = "60000"
$env:API_RATE_LIMIT_MAX = "100000"

Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3

$server = Start-Process -FilePath node -ArgumentList "dist/backend/index.js" -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru -RedirectStandardOutput "server-stdout.log" -RedirectStandardError "server-stderr.log"

$limit = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 1500
  try {
    $r = Invoke-WebRequest -UseBasicParsing "http://localhost:8787/api/health" -Headers @{ Authorization = "Bearer oneshot-e2e-dev-token" } -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $limit = $r.Headers["x-ratelimit-limit"]; break }
  } catch { }
}
if (-not $limit) { Write-Output "[walkthrough] server failed to become healthy"; exit 1 }
Write-Output "[walkthrough] server healthy ratelimit=$limit"

& node scripts/e2e/browser/strands-ui-walkthrough.mjs > walkthrough.log 2>&1
$code = $LASTEXITCODE
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
exit $code
