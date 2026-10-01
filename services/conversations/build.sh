#!/usr/bin/env bash
set -euo pipefail
export MIX_ENV=prod
mix local.hex --force
mix local.rebar --force
mix deps.get --only prod
mix compile --warnings-as-errors
mix release --overwrite
