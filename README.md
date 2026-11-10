# PontoClick API

Backend do app PontoClick, feito em Node.js + Express, usando **MySQL** (gerenciado pelo **XAMPP**/phpMyAdmin) como banco de dados.

## Pré-requisitos

- [Node.js](https://nodejs.org/) instalado (versão 18 ou superior)
- [XAMPP](https://www.apachefriends.org/) instalado, com os módulos **Apache** e **MySQL** ligados no painel de controle

## Passo a passo para rodar localmente

### 1. Ligar o MySQL no XAMPP

Abra o **Painel de Controle do XAMPP** e clique em **Start** ao lado de:
- **Apache**
- **MySQL**

Os dois devem ficar com fundo verde, indicando que estão rodando.

### 2. Instalar as dependências do projeto

Dentro da pasta `pontoclick-api`, rode:

```bash
npm install
```

### 3. Criar o banco de dados no phpMyAdmin

1. Com o Apache e o MySQL ligados, abra o navegador em `http://localhost/phpmyadmin`
2. Clique em **"Bancos de dados"** (ou "Databases") no menu superior
3. No campo "Criar banco de dados", digite `pontoclick` e clique em **Criar**
4. Com o banco `pontoclick` selecionado no menu à esquerda, clique na aba **"SQL"**
5. Abra o arquivo `database/schema.sql` (deste projeto), copie todo o conteúdo e cole na caixa de texto
6. Clique em **"Executar"** (ou "Go")

Isso vai criar as tabelas `users`, `password_resets` e `time_records`.

### 4. Configurar as variáveis de ambiente

Copie o arquivo `.env.example` e renomeie a cópia para `.env`:

```bash
cp .env.example .env
```

Por padrão, o MySQL do XAMPP usa usuário `root` e **senha em branco** — o `.env.example` já vem configurado assim. Se em algum momento você definiu uma senha para o MySQL do XAMPP, preencha `DB_PASSWORD` com ela.

E defina uma chave secreta forte para `JWT_SECRET`.

### 5. Rodar o servidor

Para desenvolvimento (reinicia sozinho a cada alteração no código):

```bash
npm run dev
```

Ou, para rodar sem reinício automático:

```bash
npm start
```

Se tudo estiver certo, você verá no terminal:

```
Servidor rodando em http://localhost:3000
```

> **Atenção:** o Apache do XAMPP e o servidor Node.js usam portas diferentes (Apache geralmente na 80, Node na 3000 aqui), então não há conflito entre eles.

### 6. Testar

Abra `http://localhost:3000` no navegador — deve aparecer:

```json
{ "message": "API do PontoClick está rodando 🚀" }
```

## Endpoints disponíveis até agora

### `POST /auth/register`

Cria uma nova conta.

**Corpo da requisição:**
```json
{
  "name": "João Silva",
  "email": "joao@gmail.com",
  "phone": "(11) 99999-9999",
  "password": "senha123"
}
```

**Resposta (201):**
```json
{
  "message": "Conta criada com sucesso!",
  "token": "eyJhbGciOi...",
  "user": { "id": 1, "name": "João Silva", "email": "joao@gmail.com", "phone": "(11) 99999-9999" }
}
```

### `POST /auth/login`

Autentica um usuário existente.

**Corpo da requisição:**
```json
{
  "email": "joao@gmail.com",
  "password": "senha123"
}
```

**Resposta (200):**
```json
{
  "message": "Login realizado com sucesso!",
  "token": "eyJhbGciOi...",
  "user": { "id": 1, "name": "João Silva", "email": "joao@gmail.com", "phone": "...", "role": null, "company": null }
}
```

### `POST /auth/forgot-password`

Envia para o e-mail um **código de 6 dígitos**, válido por 15 minutos.

**Corpo da requisição:**
```json
{ "email": "joao@gmail.com" }
```

**Resposta (200):** sempre a mesma, exista ou não a conta (a rota não revela quais e-mails estão cadastrados):
```json
{ "message": "Se houver uma conta com esse e-mail, enviamos um código de 6 dígitos." }
```

**Outras respostas:** `400` e-mail inválido · `429` pedido repetido em menos de 60 s ou mais de 5 pedidos na mesma hora · `503` falha ao enviar o e-mail.

- O banco guarda só o **hash** do código (HMAC-SHA256 com o `JWT_SECRET`); o código nunca é devolvido pela API.
- Pedir um código novo invalida os anteriores.
- **Desenvolvimento sem SMTP** (`SMTP_PASS` vazio): o código aparece só no terminal da API, numa linha `[DEV] Código de recuperação para ...`. Com `NODE_ENV=production` e sem SMTP, a rota responde `503`.

**Configurar o envio (no `.env`):**

| Variável | iCloud | Gmail |
|---|---|---|
| `SMTP_HOST` | `smtp.mail.me.com` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` | `587` |
| `SMTP_USER` | seu e-mail do iCloud | seu e-mail do Gmail |
| `SMTP_PASS` | senha de app (appleid.apple.com → Entrar e Segurança → Senhas de app) | senha de app (myaccount.google.com → Segurança → Senhas de app) |
| `SMTP_FROM` | `'"PontoClick" <seu-email@icloud.com>'` (o iCloud exige que seja o mesmo e-mail do usuário) | `'"PontoClick" <seu-email@gmail.com>'` |

> Use sempre uma **senha de app**, nunca a senha da sua conta. Reinicie a API depois de alterar o `.env`.

### `POST /auth/reset-password`

Confere o código e define a nova senha.

**Corpo da requisição:**
```json
{ "email": "joao@gmail.com", "code": "123456", "newPassword": "novaSenha123" }
```

**Resposta (200):**
```json
{ "message": "Senha redefinida com sucesso!" }
```

**Outras respostas (400):** código inválido ou expirado · `Código incorreto. Você ainda tem N tentativas.` · após **5 erros** o código é bloqueado e é preciso pedir outro · senha com menos de 6 caracteres.

**Banco de dados:** as mudanças em `password_resets` (coluna `attempts`, `expires_at` como `DATETIME`) são aplicadas automaticamente ao iniciar o servidor. A versão manual está em `database/migrations/003_password_resets_codes.sql`.

### Rotas de perfil (exigem login)

Todas as rotas de `/users` precisam do token no header:

```
Authorization: Bearer <token recebido no login>
```

Sem token, ou com token inválido/expirado, a resposta é `401`.

Sem token, com token inválido/expirado ou **emitido antes da última troca de senha**, a resposta é `401`.

#### `GET /users/me`

Devolve os dados do usuário logado.

**Resposta (200):**
```json
{ "user": { "id": 1, "name": "João Silva", "email": "joao@gmail.com", "phone": "11999999999", "role": "Desenvolvedor", "company": "TechCorp", "photoUrl": null } }
```

#### `PUT /users/me`

Atualiza o perfil. `name` e `email` são obrigatórios; `phone`, `role` e `company` podem ir vazios (viram `null`).

**Corpo da requisição:**
```json
{ "name": "João Silva", "email": "joao@gmail.com", "phone": "11999999999", "role": "Desenvolvedor", "company": "TechCorp" }
```

**Respostas:** `200` com o usuário atualizado · `400` nome vazio ou e-mail inválido · `409` e-mail já usado por outra conta.

#### `PUT /users/change-password`

Troca a senha de quem já está logado (diferente do `reset-password`, que é para quem esqueceu a senha).

**Corpo da requisição:**
```json
{ "currentPassword": "senha123", "newPassword": "novaSenha456" }
```

**Respostas:** `200` `{ "message": "...", "token": "..." }` · `400` senha atual incorreta, nova senha curta (mín. 6), longa (máx. 128) ou igual à atual.

> A troca **encerra as sessões dos outros aparelhos**. O `token` da resposta substitui o anterior neste aparelho (o app já faz isso).

> A senha atual incorreta responde `400` e não `401` de propósito: o app trata `401` como "sessão expirada" e deslogaria o usuário.

#### `POST /users/me/photo`

Envia a foto de perfil. É um `multipart/form-data` com a imagem no campo **`photo`** (JPG, PNG ou WebP, até 5 MB). O formato é conferido pelos bytes do arquivo, não pelo nome ou tipo informado. A foto antiga é apagada.

**Resposta (200):**
```json
{ "message": "Foto atualizada com sucesso!", "user": { "id": 1, "name": "João Silva", "photoUrl": "/uploads/avatars/1-3fa9c2d41b7e0a55.jpg" } }
```

`photoUrl` é um caminho relativo: o app monta o endereço completo juntando com a URL da API (`http://localhost:3000/uploads/avatars/...`). **Respostas:** `400` arquivo ausente ou formato inválido · `413` maior que 5 MB · `401` sem login.

#### `DELETE /users/me/photo`

Remove a foto de perfil (apaga o arquivo e volta `photoUrl` para `null`).

**Onde as fotos ficam:** na pasta `uploads/avatars/`, na raiz do projeto (já está no `.gitignore`).

> ⚠️ **Antes de publicar:** muitos serviços de hospedagem apagam os arquivos do disco a cada novo deploy. Em produção, use um disco persistente (VPS) ou mova as fotos para um armazenamento na nuvem (Cloudinary, S3...). Só o trecho que grava/apaga arquivos em `userController.js` precisa mudar.

**Banco de dados:** a coluna `users.photo_url` é criada automaticamente quando o servidor inicia. A versão manual está em `database/migrations/001_add_photo_url.sql`.

### Rotas de registros de ponto (exigem login)

A ordem dos pontos em um dia é sempre **entrada → intervalo → volta_intervalo → saida**, e cada tipo só existe uma vez por dia. O servidor valida isso.

Datas: `recordedAt` é um instante em UTC (ex: `2026-10-25T14:32:05Z`) e `workDate` é o dia **local** do usuário (`2026-10-25`). O app manda o `workDate` com o fuso do aparelho.

#### `POST /records`

```json
{ "type": "entrada", "workDate": "2026-10-25", "latitude": -23.55, "longitude": -46.63, "accuracy": 12, "locationName": "Escritório Central" }
```

- Só `type` e `workDate` são necessários. Sem `recordedAt`, vale o **relógio do servidor** (ponto feito online).
- Ponto feito offline e enviado depois: mande também `recordedAt` com o horário real e um `clientId`. Reenviar o mesmo `clientId` não duplica (responde `200` com `"duplicate": true`). Pontos com **mais de 72 horas** são recusados.
- **Turno da noite:** um turno dura no máximo **16 horas**. Se o `workDate` pedido ainda não tem pontos e existe um turno aberto de um dia anterior (com entrada há no máximo 16 h e sem os 4 pontos), o ponto vai para o dia desse turno. Ex: entrada 22:00 do dia 10 → saída 06:00 do dia 11 é gravada no dia 10. Confira o `workDate` do `record` devolvido.
- O horário precisa ser compatível com o `workDate` (entre a meia-noite do dia, considerando qualquer fuso, e o fim de um turno de 16 h).

**Respostas:** `201` `{ "record": { ... } }` · `400` dados inválidos, horário no futuro/antes do ponto anterior, ponto offline com mais de 72 h ou data que não confere com o horário · `409` fora de ordem (`expectedType` diz qual era o esperado) ou dia completo.

#### `GET /records?date=2026-10-25` e `GET /records?from=2026-10-01&to=2026-10-31`

Lista os pontos do dia (ou do período, máx. 62 dias) do usuário logado, em ordem de horário.

```json
{ "records": [ { "id": 7, "type": "entrada", "recordedAt": "2026-10-25T11:00:00Z", "workDate": "2026-10-25",
  "latitude": -23.55, "longitude": -46.63, "accuracy": 12, "locationName": "Escritório Central",
  "originalRecordedAt": null, "edited": false } ] }
```

#### `PUT /records/:id`

Corrige o horário de um ponto: `{ "recordedAt": "2026-10-25T11:30:00Z" }`. O horário original fica guardado (`originalRecordedAt`) e o ponto aparece como `edited: true`. O novo horário precisa respeitar a ordem do dia e ficar a até 24 h do original. **Respostas:** `200` · `400` horário inválido · `404` ponto não encontrado (ou de outro usuário).

**Banco de dados:** as colunas novas de `time_records` são criadas automaticamente ao iniciar o servidor. A versão manual está em `database/migrations/002_time_records_details.sql`.

#### `GET /users/me/notifications` e `PUT /users/me/notifications`

Preferências dos **lembretes de bater o ponto**. Sem registro salvo, o `GET` devolve o padrão. Os avisos são agendados no próprio celular pelo app (Android e iPhone); a API só guarda as escolhas.

```json
{
  "enabled": true,
  "days": [1, 2, 3, 4, 5],
  "reminders": {
    "entrada":   { "enabled": true, "time": "08:00" },
    "intervalo": { "enabled": true, "time": "12:00" },
    "volta":     { "enabled": true, "time": "13:00" },
    "saida":     { "enabled": true, "time": "17:00" }
  }
}
```

`days`: 1 = segunda … 7 = domingo. `time`: `HH:MM` no horário local do aparelho. Os horários ligados precisam seguir a ordem entrada → intervalo → volta → saída; a saída pode ser mais cedo que a entrada (turno da noite). **Respostas do PUT:** `200` com `settings` · `400` horário inválido ou fora de ordem.

**Banco de dados:** tabela `notification_settings` criada automaticamente ao iniciar o servidor (manual: `database/migrations/007_notification_settings.sql`).

### Locais de trabalho (exigem login)

Cada usuário cadastra os próprios locais (até 20). O app compara o GPS com eles para mostrar "Você está em: ..." e grava o nome do local junto com o ponto (`locationName`).

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /locations` | — | `{ "locations": [ { "id", "name", "latitude", "longitude", "radiusMeters" } ] }` |
| `POST /locations` | `{ "name", "latitude", "longitude", "radiusMeters"? }` | `201` `{ "location": { ... } }` |
| `PUT /locations/:id` | só os campos que mudam | `200` `{ "location": { ... } }` |
| `DELETE /locations/:id` | — | `200` (os pontos já registrados mantêm o nome do local) |

**Regras:** nome de 2 a 100 caracteres e único por usuário (`409` se repetir) · raio de 50 a 1000 m (padrão 150) · coordenadas válidas · `404` para local de outro usuário.

**Banco de dados:** a tabela `work_locations` é criada automaticamente ao iniciar o servidor. A versão manual está em `database/migrations/006_work_locations.sql`.

### Suporte (exige login)

#### `POST /support`

Envia uma mensagem da tela "Ajuda e suporte". Ela é gravada em `support_messages` e enviada por e-mail para `SUPPORT_EMAIL` (padrão: `SMTP_USER`), com nome, e-mail, aparelho e versão do app. O "Responder" do e-mail vai direto para o usuário.

```json
{ "message": "O ponto de ontem não apareceu", "appVersion": "1.0.0", "platform": "android" }
```

**Respostas:** `201` `{ "message": "Mensagem enviada! ..." }` · `400` mensagem com menos de 10 ou mais de 2000 caracteres · `429` mais de 5 mensagens na mesma hora.

Se o e-mail falhar, a mensagem continua salva (coluna `emailed = 0`). Sem SMTP configurado, em desenvolvimento ela aparece no terminal da API.

**Banco de dados:** a tabela é criada automaticamente ao iniciar o servidor. A versão manual está em `database/migrations/005_support_messages.sql`.

## Segurança

- **Limite de tentativas** (por IP, em memória — zera ao reiniciar a API), resposta `429` com `{ "error": "..." }`:
  - `POST /auth/login`: 10 tentativas **erradas** a cada 15 min por IP + e-mail (acertos não contam; outras contas na mesma rede não são afetadas);
  - `POST /auth/register`: 5 por hora por IP;
  - `POST /auth/forgot-password` e `/auth/reset-password`: 20 a cada 15 min por IP (além dos limites por conta).
- **Sessões**: o token leva a versão da sessão (`users.token_version`). Trocar ou redefinir a senha sobe a versão e todos os tokens antigos passam a receber `401`.
- **Entradas validadas**: e-mail sempre em minúsculas e sem espaços; tamanhos máximos iguais aos das colunas; senha de 6 a 128 caracteres.
- **Respostas de erro sempre em JSON**, inclusive rota inexistente (`404`), JSON malformado (`400`) e corpo acima de 100 KB (`413`).
- **Cabeçalhos de segurança** com `helmet`.
- **Hospedagem**: atrás de proxy (Render, Railway, Nginx), defina `TRUST_PROXY=1`; para limitar o app web a um domínio, `CORS_ORIGINS=https://seu-dominio` (várias separadas por vírgula). Use um `JWT_SECRET` longo e aleatório (a API avisa no terminal se tiver menos de 32 caracteres) — trocá-lo desconecta todos os usuários.

**Banco de dados:** a coluna `users.token_version` é criada automaticamente ao iniciar o servidor. A versão manual está em `database/migrations/004_users_token_version.sql`.

## Próximos passos

- [x] Recuperação de senha (`/auth/forgot-password`, `/auth/reset-password`)
- [x] Perfil do usuário (`/users/me`, editar perfil, alterar senha)
- [x] Registros de ponto (`/records`)
- [x] Envio real do código de recuperação por e-mail (SMTP)

## Sobre publicar na Play Store

O MySQL do XAMPP é ótimo para desenvolvimento **local**, mas não é feito para produção. Quando for publicar o app de verdade, você vai precisar:

1. Hospedar este servidor Node.js em algum provedor (Railway, Render, uma VPS, etc.) com **HTTPS configurado**
2. Hospedar um banco MySQL "de verdade" (ex: um MySQL gerenciado na nuvem, ou instalado no mesmo servidor da API)

O app Flutter nunca se conecta direto ao banco — sempre passa por esta API.
