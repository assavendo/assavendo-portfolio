#!/usr/bin/env bash
# Rejoue migrations + seed + tests SQL dans un PostgreSQL JETABLE (aucun accès à Supabase).
# Usage : scripts/test-db.sh   (nécessite les binaires PostgreSQL ; PGBIN pour les indiquer)
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
DIR="$(mktemp -d)"; chown postgres "$DIR" 2>/dev/null || true
RUN() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
RUN "$PGBIN/initdb -D $DIR/data -A trust >/dev/null"
RUN "$PGBIN/pg_ctl -D $DIR/data -o '-p 54399 -k $DIR -c listen_addresses=' -w -l $DIR/log start >/dev/null"
trap 'RUN "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null" || true' EXIT
PSQL="psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -h $DIR -p 54399 -U postgres -d postgres"
RUN "$PSQL -f supabase/tests/00_supabase_shim.sql"
i=0
for f in supabase/migrations/*.sql; do
  echo "→ $f"; RUN "$PSQL -f $f"
  # l'état constaté en production est rejoué juste après le schéma initial, avant la réconciliation
  if [ "$i" = 0 ]; then echo "→ fixture : état de production du 19/10/2026"; RUN "$PSQL -f supabase/tests/fixtures/legacy_live_state.sql"; fi
  i=$((i+1))
done
for f in supabase/seed/*.sql; do echo "→ $f"; RUN "$PSQL -f $f"; done
for f in supabase/tests/[1-9]*.sql; do echo "→ $f"; RUN "$PSQL -f $f"; done
# Téléchargements simultanés : 12 requêtes parallèles sur un lien limité à 3 → exactement 3 réussites
echo "→ concurrence"
for n in $(seq 1 12); do RUN "psql -X -q -At -v ON_ERROR_STOP=1 -h $DIR -p 54399 -U postgres -d postgres -c \"select count(*) from public.claim_download('tokenconcurrent0000000000000000000000000')\"" > "$DIR/c$n" & done; wait
OK=$(cat $DIR/c* | grep -c '^1$' || true)
[ "$OK" = "3" ] || { echo "ÉCHEC : $OK téléchargements acceptés au lieu de 3"; exit 1; }
# Les retours arrière doivent s'exécuter sans erreur (ordre inverse)
for f in $(ls supabase/rollbacks/*.down.sql | sort -r); do echo "→ retour arrière $f"; RUN "$PSQL -f $f"; done
echo "Tests SQL : OK"
