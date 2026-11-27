#!/usr/bin/env bash
# Prepara o teste de tela: banco rdo_e2e com a migração real, 4 contas
# (dono, técnico, analista, engenheiro; senha "senha-teste-123") e o
# app montado apontando para o servidor de teste (porta 5700).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres testes-tela/preparar.sh
set -euo pipefail
cd "$(dirname "$0")"
psql -X -q -d postgres -c "drop database if exists rdo_e2e" -c "create database rdo_e2e"
psql -X -q -v ON_ERROR_STOP=1 -d rdo_e2e -f ../supabase/tests/_stub_supabase.sql >/dev/null
for f in ../supabase/migrations/*.sql; do psql -X -q -v ON_ERROR_STOP=1 -d rdo_e2e -f "$f" >/dev/null; done
psql -X -q -d rdo_e2e -c "insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000d0','dono@obra.test','{\"nome\":\"Carla Proprietária\"}')"
psql -X -q -d rdo_e2e -c "insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a1','tecnico@obra.test','{\"nome\":\"João Técnico\"}'),('00000000-0000-0000-0000-0000000000a2','analista@obra.test','{\"nome\":\"Ana Analista\"}'),('00000000-0000-0000-0000-0000000000a3','engenheiro@obra.test','{\"nome\":\"Eduardo Engenheiro\"}')"
npm install --no-audit --no-fund >/dev/null
(cd ../app && VITE_SUPABASE_URL=http://127.0.0.1:5700 VITE_SUPABASE_ANON_KEY=chave-anon-teste npx vite build --outDir ../testes-tela/dist --emptyOutDir >/dev/null)
echo "Pronto. Rode: node testes-tela/servidor.cjs testes-tela/dist  (e em outro terminal)  node testes-tela/fluxo.cjs && node testes-tela/fluxo2.cjs"
