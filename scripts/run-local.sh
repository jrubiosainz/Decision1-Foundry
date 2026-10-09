#!/bin/sh
# Arranca la web en local contra los recursos desplegados con azd.
# Autenticación keyless con tu sesión de `az login` o `azd auth login`. Sin código de acceso en local.
set -e
cd "$(dirname "$0")/.."
set -a
eval "$(azd env get-values)"
set +a
unset DEMO_ACCESS_CODE
[ -d .venv ] || python3 -m venv .venv
.venv/bin/python -m pip install -q -r src/requirements.txt
echo "Demo en http://localhost:${PORT:-8000}"
cd src
exec ../.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port "${PORT:-8000}"
