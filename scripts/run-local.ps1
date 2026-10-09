# Arranca la web en local contra los recursos desplegados con azd.
# Autenticación keyless con tu sesión de `az login` o `azd auth login`. Sin código de acceso en local.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
foreach ($line in (azd env get-values)) {
  if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)="(.*)"$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
}
Remove-Item env:DEMO_ACCESS_CODE -ErrorAction SilentlyContinue
if (-not (Test-Path .venv)) { python -m venv .venv }
& .venv\Scripts\python.exe -m pip install -q -r src\requirements.txt
$port = if ($env:PORT) { $env:PORT } else { '8000' }
Write-Host "Demo en http://localhost:$port"
Set-Location src
& ..\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port $port
