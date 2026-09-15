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

## Próximos passos

- [ ] Recuperação de senha (`/auth/forgot-password`, `/auth/reset-password`)
- [ ] Perfil do usuário (`/users/me`, editar perfil, alterar senha)
- [ ] Registros de ponto (`/records`)

## Sobre publicar na Play Store

O MySQL do XAMPP é ótimo para desenvolvimento **local**, mas não é feito para produção. Quando for publicar o app de verdade, você vai precisar:

1. Hospedar este servidor Node.js em algum provedor (Railway, Render, uma VPS, etc.) com **HTTPS configurado**
2. Hospedar um banco MySQL "de verdade" (ex: um MySQL gerenciado na nuvem, ou instalado no mesmo servidor da API)

O app Flutter nunca se conecta direto ao banco — sempre passa por esta API.
