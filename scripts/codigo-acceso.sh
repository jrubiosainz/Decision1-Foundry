#!/bin/sh
# Hook preprovision de azd: genera el código de acceso de la web si el entorno aún no tiene uno.
# Para elegir el tuyo antes de desplegar: azd env set DEMO_ACCESS_CODE <código>
set -e
if [ -n "${DEMO_ACCESS_CODE:-}" ]; then
  exit 0
fi
code="d1-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
azd env set DEMO_ACCESS_CODE "$code"
echo "Código de acceso de la demo: $code"
