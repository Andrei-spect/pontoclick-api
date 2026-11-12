#!/usr/bin/env bash
# PontoClick — atualiza a API com a versão mais recente do GitHub.
# Uso no servidor:  sudo bash /opt/pontoclick/api/deploy/update.sh
# O .env e as fotos (uploads/) não são tocados; as migrações do banco rodam
# sozinhas quando a API inicia (src/config/migrations.js).
set -euo pipefail

API_DIR=/opt/pontoclick/api

/usr/local/bin/pontoclick-backup || echo "Aviso: o backup antes da atualização falhou."
git -C "$API_DIR" pull --ff-only
cd "$API_DIR"
npm ci --omit=dev
chown -R pontoclick:pontoclick "$API_DIR"
systemctl restart pontoclick-api
sleep 3
systemctl --no-pager --lines=10 status pontoclick-api
