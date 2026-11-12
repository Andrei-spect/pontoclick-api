#!/usr/bin/env bash
# PontoClick — backup diário do banco e das fotos de perfil (instalado pelo setup.sh
# em /usr/local/bin/pontoclick-backup e agendado para 03:00). Guarda os últimos 14 dias.
#
# Restaurar o banco:  gunzip -c /var/backups/pontoclick/db-AAAA-MM-DD.sql.gz | sudo mysql pontoclick
# Restaurar fotos:    sudo tar -xzf /var/backups/pontoclick/uploads-AAAA-MM-DD.tar.gz -C /opt/pontoclick/api
set -euo pipefail

DIR=/var/backups/pontoclick
DAY=$(date +%F)
mkdir -p "$DIR"

mysqldump --single-transaction --routines pontoclick | gzip > "$DIR/db-$DAY.sql.gz"
tar -czf "$DIR/uploads-$DAY.tar.gz" -C /opt/pontoclick/api uploads 2>/dev/null || true

find "$DIR" -name 'db-*.sql.gz' -mtime +14 -delete
find "$DIR" -name 'uploads-*.tar.gz' -mtime +14 -delete

echo "$(date -Is) backup ok: $(du -sh "$DIR" | cut -f1) em $DIR"
