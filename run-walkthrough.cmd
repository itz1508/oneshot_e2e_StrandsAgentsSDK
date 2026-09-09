@echo off
setlocal enabledelayedexpansion
cd /d d:\oneshot_e2e_StrandsAgentsSDK
set ONESHOT_API_TOKEN=oneshot-e2e-dev-token
set ONESHOT_MODE=sample
set ONESHOT_NO_OPEN=1
set ONESHOT_WORKSPACE_ROOT=d:\oneshot_e2e_StrandsAgentsSDK\.runtime\demo-target
set PORT=8787
set API_RATE_LIMIT_WINDOW_MS=60000
set API_RATE_LIMIT_MAX=100000
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 3 /nobreak >nul
start /b node dist\backend\index.js > server-stdout.log 2> server-stderr.log
set HEALTH=0
set LIMIT=
for /l %%i in (1,1,20) do (
  if !HEALTH!==0 if not defined LIMIT for /f %%v in ('powershell -NoProfile -Command "try{ $r = Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/health -Headers @{Authorization='Bearer oneshot-e2e-dev-token'} -TimeoutSec 3; if($r.StatusCode -eq 200){ $r.Headers['x-ratelimit-limit'] } else { exit 1 } }catch{ exit 1 }"') do set LIMIT=%%v
  if !HEALTH!==0 if not defined LIMIT timeout /t 2 /nobreak >nul
)
if not defined LIMIT (
  echo [walkthrough] server failed to become healthy
  exit /b 1
)
echo [walkthrough] server healthy - ratelimit=!LIMIT! - starting UI walkthrough
node scripts/e2e/browser/strands-ui-walkthrough.mjs > walkthrough.log 2>&1
