#!/bin/sh
# azd preprovision hook: generates the web app's access code if the environment doesn't have one yet.
# To choose your own before deploying: azd env set DEMO_ACCESS_CODE <code>
set -e
if [ -n "${DEMO_ACCESS_CODE:-}" ]; then
  exit 0
fi
code="d1-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
azd env set DEMO_ACCESS_CODE "$code"
echo "Demo access code: $code"
