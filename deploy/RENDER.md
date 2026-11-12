# Publicar de graça: Render + TiDB Cloud + Brevo

| Parte | Onde | Plano gratuito |
|---|---|---|
| API (Node) | Render — Web Service | dorme após 15 min sem uso; a 1ª abertura leva ~1 min |
| Banco (MySQL) | TiDB Cloud — Starter | 5 GB, conexão TLS obrigatória |
| E-mail | Brevo — API | 300 e-mails/dia |
| App web (Flutter) | Render — Static Site | não dorme |

O plano gratuito do Render bloqueia SMTP (portas 25/465/587); por isso o e-mail sai pela API HTTPS do Brevo.
Fotos de perfil ficam no banco (`PHOTO_STORAGE=db`), porque o disco do Render é apagado a cada reinício.

## 1. Banco — TiDB Cloud

1. Crie a conta em https://tidbcloud.com (pode entrar com Google ou GitHub).
2. **Create Cluster → Starter** (gratuito). Região: **AWS N. Virginia (us-east-1)**, perto da API no Render.
3. No cluster, clique em **Connect**:
   - *Connection Type*: Public; *Connect With*: General.
   - Clique em **Generate Password** e guarde a senha (ela só aparece uma vez).
   - Anote **HOST**, **PORT** (4000) e **USERNAME** (algo como `xxxxxxxx.root`).

Não precisa criar tabelas: a API cria o banco `pontoclick` e todas as tabelas na primeira vez que sobe.

## 2. E-mail — Brevo

1. Crie a conta em https://www.brevo.com (plano Free).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: o e-mail que vai enviar (ex: o Gmail do suporte). Confirme pelo código que chega nessa caixa.
3. **SMTP & API → API Keys → Generate a new API key**. Guarde a chave (`xkeysib-...`).

Remetente @gmail.com pode cair no spam de alguns provedores; com domínio próprio (verificado no Brevo) isso melhora.

## 3. API — Render Web Service

1. Crie a conta em https://render.com entrando com o **GitHub** e libere acesso ao repositório `pontoclick-api`.
2. **New → Web Service →** `pontoclick-api`.
   - Region: **Virginia (US East)** · Branch: `main` · Instance type: **Free**
   - Build Command: `npm ci --omit=dev` · Start Command: `npm start`
   - Health Check Path (em *Advanced*): `/`
3. **Environment Variables**:

| Chave | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| `JWT_SECRET` | botão **Generate** do Render |
| `JWT_EXPIRES_IN` | `7d` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` | do passo 1 |
| `DB_NAME` | `pontoclick` |
| `DB_SSL` | `true` |
| `PHOTO_STORAGE` | `db` |
| `BREVO_API_KEY` | do passo 2 |
| `MAIL_FROM_EMAIL` | o remetente verificado no Brevo |
| `SUPPORT_EMAIL` | para onde vão as mensagens do suporte |

4. **Create Web Service**. Quando terminar, abra `https://<nome>.onrender.com/` — deve responder `{"message":"API do PontoClick está rodando 🚀"}`.

## 4. App web — Render Static Site

1. No PC, gere o app apontando para a API:
   ```bash
   flutter build web --release --dart-define=API_URL=https://<nome>.onrender.com
   ```
   e publique a pasta `build/web` na branch `web` do repositório `pontoclick-main` (só os arquivos gerados).
2. No Render: **New → Static Site →** `pontoclick-main`, branch **`web`**, Build Command vazio, Publish Directory `.`.
3. Em **Redirects/Rewrites**: Source `/*`, Destination `/index.html`, Action **Rewrite**.
4. Volte na API e adicione `CORS_ORIGINS` = endereço do site (ex: `https://pontoclick.onrender.com`).

## Atualizar depois

- API: todo `git push` na `main` publica sozinho.
- App web: gerar de novo (passo 4.1) e enviar para a branch `web`.

Para trocar por um servidor próprio no futuro (Oracle Cloud, VPS), veja `setup.sh`.
