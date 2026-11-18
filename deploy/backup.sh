#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/machado-app
exec 9>private/backup.lock
flock -n 9 || exit 0
database=$(sed -n 's|^DATABASE_URL=.*:5432/||p' private/app.env)
case "$database" in machado|machado_stage) ;; *) echo 'Unexpected database'; exit 1;; esac
work=$(mktemp -d /opt/machado-app/private/backup.XXXXXXXX)
trap 'rm -rf -- "$work"' EXIT
docker exec machado-app-db pg_dump -U machado_cluster_admin -d "$database" -Fc >"$work/database.dump"
docker exec machado-app-db pg_dumpall -U machado_cluster_admin --roles-only >"$work/roles.sql"
if docker exec machado-app-web test -d /var/lib/machado/media; then
 docker cp machado-app-web:/var/lib/machado/media "$work/media"
else
 mkdir -p "$work/media"
fi
mkdir -p backups/encrypted
name="machado-$(date -u +%Y%m%dT%H%M%SZ).tar.age"
tar -cf - -C "$work" database.dump roles.sql media -C /opt/machado-app compose.yaml private/app.env private/cluster-password private/tls |
 age -R private/backup-recipient -o "backups/encrypted/$name.partial"
mv "backups/encrypted/$name.partial" "backups/encrypted/$name"
(cd backups/encrypted && sha256sum "$name" >"$name.sha256")
find backups/encrypted -maxdepth 1 -type f -name 'machado-*.tar.age*' -mtime +14 -delete
printf 'Encrypted database, media and configuration backup completed: %s\n' "$name"
