-- Preferências dos lembretes de bater o ponto.
-- O servidor faz isto sozinho ao iniciar; esta é a versão manual (produção).
-- Rode no phpMyAdmin (aba SQL, banco "pontoclick" selecionado).
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id INT UNSIGNED PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,            -- chave geral dos lembretes
  days VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5',  -- dias da semana (1 = segunda ... 7 = domingo)
  entrada_enabled TINYINT(1) NOT NULL DEFAULT 1,
  entrada_time CHAR(5) NOT NULL DEFAULT '08:00',   -- HH:MM no horário local do aparelho
  intervalo_enabled TINYINT(1) NOT NULL DEFAULT 1,
  intervalo_time CHAR(5) NOT NULL DEFAULT '12:00',
  volta_enabled TINYINT(1) NOT NULL DEFAULT 1,
  volta_time CHAR(5) NOT NULL DEFAULT '13:00',
  saida_enabled TINYINT(1) NOT NULL DEFAULT 1,
  saida_time CHAR(5) NOT NULL DEFAULT '17:00',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
