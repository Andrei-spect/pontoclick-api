-- Versão da sessão do usuário. Vai dentro do token (JWT) e sobe a cada troca
-- ou redefinição de senha: tokens com a versão antiga deixam de ser aceitos.
-- O servidor faz isto sozinho ao iniciar; esta é a versão manual (produção).
-- Rode no phpMyAdmin (aba SQL, banco "pontoclick" selecionado).
ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER password_hash;
