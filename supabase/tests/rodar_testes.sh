#!/usr/bin/env bash
# Roda a migração num banco PostgreSQL vazio e executa os testes de
# permissão. Uso:  PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/rodar_testes.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=rdo_teste_$$
psql -X -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -X -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/_stub_supabase.sql >/dev/null
for f in migrations/*.sql; do
  psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
done
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/permissoes.sql 2>&1 >/dev/null | sed 's/^psql:[^ ]* NOTICE:  /  /'
