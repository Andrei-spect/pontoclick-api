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
  role VARCHAR(100) NULL,        -- Cargo (ex: Desenvolvedor)
  company VARCHAR(150) NULL,     -- Empresa (ex: TechCorp)
  photo_url VARCHAR(255) NULL,   -- Caminho da foto de perfil (ex: /uploads/avatars/1-ab12.jpg)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- Tabela: password_resets
-- Controla os links (e-mail) e códigos (celular) de
-- recuperação de senha, com validade.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  method ENUM('email', 'phone') NOT NULL,
  token VARCHAR(255) NOT NULL,   -- token do link (e-mail) ou código numérico (celular)
  expires_at TIMESTAMP NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (token)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- Tabela: time_records
-- Cada linha é um "ponto" batido (entrada, intervalo, etc.)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('entrada', 'intervalo', 'volta_intervalo', 'saida') NOT NULL,
  recorded_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_date (user_id, recorded_at)
) ENGINE=InnoDB;
