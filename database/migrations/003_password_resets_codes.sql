-- Recuperação de senha por código de 6 dígitos enviado por e-mail.
-- O servidor faz isto sozinho ao iniciar; esta é a versão manual (produção).
-- Rode no phpMyAdmin (aba SQL, banco "pontoclick" selecionado).

-- expires_at era TIMESTAMP: o MySQL/MariaDB adiciona "ON UPDATE CURRENT_TIMESTAMP"
-- e qualquer UPDATE na linha mudava a validade para "agora". Passa a ser DATETIME (UTC).
ALTER TABLE password_resets
  MODIFY expires_at DATETIME NOT NULL,
  ADD COLUMN attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER used,
  ADD INDEX idx_user_created (user_id, created_at);

-- Códigos antigos eram guardados sem hash: invalida todos.
UPDATE password_resets SET used = 1 WHERE used = 0;
