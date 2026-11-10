-- Mensagens do suporte (tela "Ajuda e suporte" do app).
-- O servidor faz isto sozinho ao iniciar; esta é a versão manual (produção).
-- Rode no phpMyAdmin (aba SQL, banco "pontoclick" selecionado).
CREATE TABLE IF NOT EXISTS support_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  message TEXT NOT NULL,
  app_version VARCHAR(20) NULL,
  platform VARCHAR(30) NULL,
  emailed TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_support_user_created (user_id, created_at)
) ENGINE=InnoDB;
