#!/bin/sh
# Starts the web app locally against the resources deployed with azd.
# Keyless authentication with your `az login` or `azd auth login` session. No access code locally.
set -e
cd "$(dirname "$0")/.."
set -a
eval "$(azd env get-values)"
set +a
unset DEMO_ACCESS_CODE
[ -d .venv ] || python3 -m venv .venv
.venv/bin/python -m pip install -q -r src/requirements.txt
echo "Demo at http://localhost:${PORT:-8000}"
cd src
exec ../.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port "${PORT:-8000}"
