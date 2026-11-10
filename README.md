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

Inicia a recuperação de senha. Gera um token (link, se `method` for `email`) ou um código de 6 dígitos (se `method` for `phone`), válido por 15 minutos.

**Corpo da requisição:**
```json
{
  "method": "email",
  "contact": "joao@gmail.com"
}
```

**Resposta (200):**
```json
{
  "message": "Se o cadastro existir, um código/link de recuperação foi enviado.",
  "dev_token": "a1b2c3d4..."
}
```

> ⚠️ O campo `dev_token` só existe para facilitar os testes agora, no início do desenvolvimento — em produção, o token deve ser enviado por e-mail/SMS de verdade, e nunca devolvido na resposta da API. Isso já está marcado com `TODO` no código.

### `POST /auth/reset-password`

Confirma o token/código e define a nova senha.

**Corpo da requisição:**
```json
{
  "token": "a1b2c3d4...",
  "newPassword": "novaSenha123"
}
```

**Resposta (200):**
```json
{ "message": "Senha redefinida com sucesso!" }
```

### Rotas de perfil (exigem login)

Todas as rotas de `/users` precisam do token no header:

```
Authorization: Bearer <token recebido no login>
```

Sem token, ou com token inválido/expirado, a resposta é `401`.

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

**Respostas:** `200` senha alterada · `400` senha atual incorreta, nova senha curta (mín. 6) ou igual à atual.

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
- Ponto feito offline e enviado depois: mande também `recordedAt` com o horário real e um `clientId`. Reenviar o mesmo `clientId` não duplica (responde `200` com `"duplicate": true`).

**Respostas:** `201` `{ "record": { ... } }` · `400` dados inválidos ou horário no futuro/antes do ponto anterior · `409` fora de ordem (`expectedType` diz qual era o esperado) ou dia completo.

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

## Próximos passos

- [x] Recuperação de senha (`/auth/forgot-password`, `/auth/reset-password`)
- [x] Perfil do usuário (`/users/me`, editar perfil, alterar senha)
- [x] Registros de ponto (`/records`)
- [ ] Envio real de e-mail/SMS (substituir o `dev_token` por um serviço de verdade antes de publicar)

## Sobre publicar na Play Store

O MySQL do XAMPP é ótimo para desenvolvimento **local**, mas não é feito para produção. Quando for publicar o app de verdade, você vai precisar:

1. Hospedar este servidor Node.js em algum provedor (Railway, Render, uma VPS, etc.) com **HTTPS configurado**
2. Hospedar um banco MySQL "de verdade" (ex: um MySQL gerenciado na nuvem, ou instalado no mesmo servidor da API)

O app Flutter nunca se conecta direto ao banco — sempre passa por esta API.
