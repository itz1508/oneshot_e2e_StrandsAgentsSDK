@echo off
cd /d d:\oneshot_e2e_StrandsAgentsSDK
set ONESHOT_API_TOKEN=oneshot-e2e-dev-token
node scripts/e2e/browser/state-adaptive-e2e.mjs > browser-e2e.log 2>&1
