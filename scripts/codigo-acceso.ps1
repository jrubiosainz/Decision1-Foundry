# Hook preprovision de azd: genera el código de acceso de la web si el entorno aún no tiene uno.
# Para elegir el tuyo antes de desplegar: azd env set DEMO_ACCESS_CODE <código>
if ($env:DEMO_ACCESS_CODE) { exit 0 }
$bytes = New-Object byte[] 4
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$code = 'd1-' + (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
azd env set DEMO_ACCESS_CODE $code
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Código de acceso de la demo: $code"
