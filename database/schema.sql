-- ==========================================================
-- PontoClick - Schema do banco de dados (MySQL / XAMPP)
-- ==========================================================
-- Como usar no phpMyAdmin (XAMPP):
--   1. Abra o painel do XAMPP e clique em "Start" nos módulos
--      Apache e MySQL.
--   2. Acesse http://localhost/phpmyadmin no navegador.
--   3. Crie um banco chamado "pontoclick" (aba "Databases" /
--      "Bancos de dados" > digite o nome > Create/Criar).
--   4. Com o banco "pontoclick" selecionado, vá na aba "SQL".
--   5. Cole todo o conteúdo deste arquivo e clique em "Go"/"Executar".
-- ==========================================================

-- ----------------------------------------------------------
-- Tabela: users
-- Armazena os dados de cadastro de cada usuário do app.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  token_version INT UNSIGNED NOT NULL DEFAULT 0, -- sobe ao trocar a senha: invalida as sessões antigas
  role VARCHAR(100) NULL,        -- Cargo (ex: Desenvolvedor)
  company VARCHAR(150) NULL,     -- Empresa (ex: TechCorp)
  photo_url VARCHAR(255) NULL,   -- Caminho da foto de perfil (ex: /uploads/avatars/1-ab12.jpg)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- Tabela: password_resets
-- Códigos de recuperação de senha (6 dígitos, enviados por
-- e-mail), com validade e limite de tentativas.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  method ENUM('email', 'phone') NOT NULL,
  token VARCHAR(255) NOT NULL,   -- HASH do código (HMAC-SHA256); o código em si nunca é guardado
  expires_at DATETIME NOT NULL,  -- em UTC; DATETIME para não ganhar "ON UPDATE CURRENT_TIMESTAMP"
  used TINYINT(1) NOT NULL DEFAULT 0,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- tentativas erradas com este código
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (token),
  INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- Tabela: time_records
-- Cada linha é um "ponto" batido (entrada, intervalo, etc.)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('entrada', 'intervalo', 'volta_intervalo', 'saida') NOT NULL,
  recorded_at DATETIME NOT NULL,              -- horário exato do ponto, sempre em UTC
  work_date DATE NULL,                        -- dia do ponto na data local do usuário (YYYY-MM-DD)
  client_id VARCHAR(64) NULL,                 -- id gerado no app; evita duplicar pontos offline reenviados
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  accuracy_m SMALLINT UNSIGNED NULL,          -- precisão do GPS, em metros
  location_name VARCHAR(100) NULL,            -- ex: "Escritório Central"
  original_recorded_at DATETIME NULL,         -- horário original, se o ponto foi editado
  edited_at DATETIME NULL,                    -- quando foi editado (NULL = nunca)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_date (user_id, recorded_at),
  INDEX idx_user_workdate (user_id, work_date),
  UNIQUE INDEX uq_user_day_type (user_id, work_date, type),
  UNIQUE INDEX uq_user_client (user_id, client_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- Tabela: support_messages
-- Mensagens enviadas pela tela "Ajuda e suporte" do app.
-- Cada uma também é enviada por e-mail para SUPPORT_EMAIL.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  message TEXT NOT NULL,
  app_version VARCHAR(20) NULL,   -- versão do app que enviou (ex: 1.0.0)
  platform VARCHAR(30) NULL,      -- android, ios, web, windows...
  emailed TINYINT(1) NOT NULL DEFAULT 0,  -- 1 = o e-mail para o suporte foi enviado
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_support_user_created (user_id, created_at)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- Tabela: work_locations
-- Locais de trabalho de cada usuário. O app compara o GPS
-- com eles para mostrar e gravar o nome do local no ponto.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_locations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,               -- ex: "Escritório Central"
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  radius_m SMALLINT UNSIGNED NOT NULL DEFAULT 150,  -- distância máxima (metros) para considerar "no local"
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE INDEX uq_user_location_name (user_id, name)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- Tabela: notification_settings
-- Lembretes de bater o ponto (um registro por usuário; sem
-- registro = valores padrão). O app agenda os avisos no aparelho.
-- ----------------------------------------------------------
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
