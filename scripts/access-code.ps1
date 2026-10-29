# azd preprovision hook: generates the web app's access code if the environment doesn't have one yet.
# To choose your own before deploying: azd env set DEMO_ACCESS_CODE <code>
if ($env:DEMO_ACCESS_CODE) { exit 0 }
$bytes = New-Object byte[] 4
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$code = 'd1-' + (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
azd env set DEMO_ACCESS_CODE $code
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Demo access code: $code"
