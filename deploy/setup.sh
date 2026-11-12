#!/usr/bin/env bash
# =============================================================================
# PontoClick — instalação do servidor (Ubuntu 22.04/24.04, ex: Oracle Cloud Free)
#
# Uso (no servidor, como o usuário "ubuntu"):
#   curl -fsSL https://raw.githubusercontent.com/Andrei-spect/pontoclick-api/main/deploy/setup.sh -o setup.sh
#   sudo bash setup.sh SEU-NOME.duckdns.org
#
# O que faz:
#   - instala Node.js 22, MariaDB (MySQL), Caddy (HTTPS automático) e git
#   - libera as portas 80 e 443 no firewall da máquina
#   - cria o banco "pontoclick" com um usuário e senha aleatória
#   - baixa a API do GitHub, cria o .env de produção e sobe como serviço (systemd)
#   - configura o Caddy:  https://DOMINIO -> app web   |   https://api.DOMINIO -> API
#   - agenda o backup diário (banco + fotos, guardando 14 dias)
#
# Pode rodar de novo sem estragar nada: o que já existe é mantido (inclusive o .env).
# =============================================================================
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Uso: sudo bash setup.sh SEU-NOME.duckdns.org" >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Rode com sudo: sudo bash setup.sh $DOMAIN" >&2
  exit 1
fi

APP_DIR=/opt/pontoclick
API_DIR=$APP_DIR/api
WEB_DIR=/var/www/pontoclick
BACKUP_DIR=/var/backups/pontoclick
REPO=https://github.com/Andrei-spect/pontoclick-api.git
SVC_USER=pontoclick

log() { echo -e "\n\033[1;35m==> $*\033[0m"; }

log "Atualizando o sistema e instalando pacotes básicos"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https \
  mariadb-server iptables-persistent openssl

# Máquinas com pouca memória (ex: 1 GB): cria 2 GB de swap para o npm e o banco não faltarem memória.
if [[ $(free -m | awk '/^Mem:/{print $2}') -lt 3000 && ! -f /swapfile ]]; then
  log "Criando swap de 2 GB"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "Instalando Node.js 22"
if ! command -v node >/dev/null || [[ $(node -v | cut -c2- | cut -d. -f1) -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

log "Instalando Caddy (servidor web com HTTPS automático)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

log "Liberando as portas 80 e 443 no firewall da máquina"
# As imagens Ubuntu da Oracle bloqueiam tudo além do SSH (22) no iptables.
for port in 80 443; do
  iptables -C INPUT -p tcp --dport $port -m state --state NEW -j ACCEPT 2>/dev/null ||
    iptables -I INPUT 6 -p tcp --dport $port -m state --state NEW -j ACCEPT
done
netfilter-persistent save

log "Configurando o banco de dados"
systemctl enable --now mariadb
DB_PASS_FILE=$APP_DIR/.db_password
mkdir -p $APP_DIR
if [[ ! -f $DB_PASS_FILE ]]; then
  openssl rand -hex 24 > $DB_PASS_FILE
  chmod 600 $DB_PASS_FILE
fi
DB_PASS=$(cat $DB_PASS_FILE)
mysql <<SQL
CREATE DATABASE IF NOT EXISTS pontoclick CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER IF NOT EXISTS 'pontoclick'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON pontoclick.* TO 'pontoclick'@'localhost';
FLUSH PRIVILEGES;
SQL

log "Baixando a API do GitHub"
id -u $SVC_USER >/dev/null 2>&1 || useradd --system --home $APP_DIR --shell /usr/sbin/nologin $SVC_USER
if [[ -d $API_DIR/.git ]]; then
  git -C $API_DIR pull --ff-only
else
  git clone $REPO $API_DIR
fi
cd $API_DIR
npm ci --omit=dev
mysql pontoclick < database/schema.sql

log "Criando o .env de produção (se ainda não existir)"
if [[ ! -f $API_DIR/.env ]]; then
  cat > $API_DIR/.env <<ENV
# Gerado por deploy/setup.sh em $(date -I). NUNCA versionar este arquivo.
DB_HOST=localhost
DB_PORT=3306
DB_USER=pontoclick
DB_PASSWORD=$DB_PASS
DB_NAME=pontoclick

PORT=3000
NODE_ENV=production
TRUST_PROXY=1
CORS_ORIGINS=https://$DOMAIN

JWT_SECRET=$(openssl rand -hex 48)
JWT_EXPIRES_IN=7d

# E-mail (recuperação de senha e suporte): preencha SMTP_PASS com a SENHA DE APP do Gmail
# e reinicie a API:  sudo systemctl restart pontoclick-api
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=andrei.barbosa009@gmail.com
SMTP_PASS=
SMTP_FROM='"PontoClick" <andrei.barbosa009@gmail.com>'
SUPPORT_EMAIL=andrei.barbosa009@gmail.com
ENV
fi
mkdir -p $API_DIR/uploads
chown -R $SVC_USER:$SVC_USER $API_DIR
chmod 600 $API_DIR/.env

log "Criando o serviço da API (reinicia sozinho se cair ou se o servidor reiniciar)"
cat > /etc/systemd/system/pontoclick-api.service <<UNIT
[Unit]
Description=PontoClick API
After=network.target mariadb.service
Requires=mariadb.service

[Service]
Type=simple
User=$SVC_USER
WorkingDirectory=$API_DIR
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable pontoclick-api
systemctl restart pontoclick-api

log "Configurando o Caddy (HTTPS automático)"
mkdir -p $WEB_DIR
[[ -f $WEB_DIR/index.html ]] || echo '<!doctype html><meta charset="utf-8"><title>PontoClick</title><p>Em breve.</p>' > $WEB_DIR/index.html
cat > /etc/caddy/Caddyfile <<CADDY
# PontoClick — gerado por deploy/setup.sh
api.$DOMAIN {
	encode gzip
	request_body {
		max_size 6MB
	}
	reverse_proxy 127.0.0.1:3000
}

$DOMAIN {
	root * $WEB_DIR
	encode gzip
	try_files {path} /index.html
	file_server
}
CADDY
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

log "Agendando o backup diário (03:00)"
install -m 750 $API_DIR/deploy/backup.sh /usr/local/bin/pontoclick-backup
mkdir -p $BACKUP_DIR && chmod 700 $BACKUP_DIR
echo "0 3 * * * root /usr/local/bin/pontoclick-backup >> /var/log/pontoclick-backup.log 2>&1" > /etc/cron.d/pontoclick-backup

log "Pronto!"
sleep 3
systemctl --no-pager --lines=5 status pontoclick-api || true
cat <<FIM

  App web:  https://$DOMAIN
  API:      https://api.$DOMAIN
  (o primeiro acesso pode levar até 1 minuto: o Caddy está pedindo os certificados HTTPS)

  Falta: colocar a senha de app do Gmail em SMTP_PASS:
    sudo nano $API_DIR/.env
    sudo systemctl restart pontoclick-api

  Comandos úteis:
    sudo journalctl -u pontoclick-api -f      # ver o log da API
    sudo bash $API_DIR/deploy/update.sh        # atualizar a API com o GitHub
FIM
