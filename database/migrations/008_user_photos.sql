-- Fotos de perfil guardadas no banco (usado com PHOTO_STORAGE=db, ex: Render gratuito).
-- O servidor faz isto sozinho ao iniciar; esta é a versão manual (produção).
-- Rode no phpMyAdmin (aba SQL, banco "pontoclick" selecionado).
CREATE TABLE IF NOT EXISTS user_photos (
  filename VARCHAR(64) PRIMARY KEY,               -- mesmo nome usado na URL /uploads/avatars/<arquivo>
  user_id INT UNSIGNED NOT NULL,
  mime VARCHAR(20) NOT NULL,                      -- image/jpeg, image/png ou image/webp
  data MEDIUMBLOB NOT NULL,                       -- a imagem (até 5 MB)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_photos_user (user_id)
) ENGINE=InnoDB;
