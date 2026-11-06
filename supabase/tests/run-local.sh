#!/usr/bin/env bash
# Lance la migration + les tests de sécurité sur un Postgres local jetable.
# Prérequis : PostgreSQL 15+ installé (initdb, pg_ctl, psql dans le PATH).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
port=54329
export PGUSER=postgres
bin="$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")"
"$bin/initdb" -D "$tmp/data" -U postgres -A trust >/dev/null
"$bin/pg_ctl" -D "$tmp/data" -o "-p $port -k $tmp" -l "$tmp/log" start >/dev/null
trap '"$bin/pg_ctl" -D "$tmp/data" stop >/dev/null; rm -rf "$tmp"' EXIT
psql=( "$bin/psql" -h "$tmp" -p "$port" -v ON_ERROR_STOP=1 -q -X )
"${psql[@]}" -d postgres -f "$here/shim.sql"
for f in "$here"/../migrations/*.sql; do "${psql[@]}" -d postgres -f "$f"; done
"${psql[@]}" -d postgres -f "$here/rls.test.sql"
