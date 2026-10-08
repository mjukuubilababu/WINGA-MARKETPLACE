#!/usr/bin/env bash
# Own a disposable PostgreSQL container; never consult DATABASE_URL or use existing data.
set -euo pipefail
cd "$(dirname "$0")/.."
growth_mode="${1:-tests}"
[[ "$growth_mode" == tests || "$growth_mode" == canary ]] || { echo 'Use tests or canary.' >&2; exit 1; }
growth_container="winga-growth-test-$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
# Pin the verified official PostgreSQL 18.6 image for repeatable acceptance.
growth_image='postgres:18@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
growth_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
growth_docker info --format '{{.ServerVersion}}' >/dev/null
growth_created=false
growth_cleanup() {
  if "$growth_created"; then growth_docker rm -f -v "$growth_container" >/dev/null; fi
}
trap growth_cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Trust is confined to this synthetic instance, published on loopback only.
growth_docker run -d --name "$growth_container" \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=winga_test -e POSTGRES_DB=winga_test \
  -p 127.0.0.1::5432 "$growth_image" >/dev/null
growth_created=true
growth_port="$(growth_docker port "$growth_container" 5432/tcp)"
[[ "$growth_port" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || { echo 'Unexpected test port binding.' >&2; exit 1; }
export WINGA_TEST_POSTGRES_URL="postgresql://winga_test@127.0.0.1:${BASH_REMATCH[1]}/winga_test"
export WINGA_TEST_SHOPPING_ROOMS_POSTGRES=true
growth_ready=false
for ((attempt=0; attempt<30; attempt++)); do
  if growth_docker exec "$growth_container" pg_isready -h 127.0.0.1 -U winga_test -d winga_test >/dev/null; then growth_ready=true; break; fi
  sleep 1
done
"$growth_ready" || { growth_docker logs "$growth_container"; exit 1; }
growth_docker exec "$growth_container" psql -U winga_test -d winga_test -Atc 'SELECT version()'
growth_docker image inspect "$growth_image" --format '{{index .RepoDigests 0}}'
if [[ "$growth_mode" == canary ]]; then
  WINGA_TEST_GROWTH_CANARY=true node scripts/run-local-growth-canary.mjs
else
  node tests/growth-loops.test.mjs
  node tests/growth-postgres.test.mjs
fi
# Every fixture must have removed its schema before container cleanup.
growth_schemas="$(growth_docker exec "$growth_container" psql -U winga_test -d winga_test -Atc "SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'winga_room_test_%'")"
[[ "$growth_schemas" == 0 ]] || { echo 'Leaked disposable test schemas.' >&2; exit 1; }
echo 'Disposable PostgreSQL run passed; all fixture schemas removed.'
