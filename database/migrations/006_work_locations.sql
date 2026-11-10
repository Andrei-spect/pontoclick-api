-- Locais de trabalho de cada usuário (substituem os locais de exemplo fixos no app).
-- O servidor faz isto sozinho ao iniciar; esta é a versão manual (produção).
-- Rode no phpMyAdmin (aba SQL, banco "pontoclick" selecionado).
CREATE TABLE IF NOT EXISTS work_locations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  radius_m SMALLINT UNSIGNED NOT NULL DEFAULT 150,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE INDEX uq_user_location_name (user_id, name)
) ENGINE=InnoDB;
