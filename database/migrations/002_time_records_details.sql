-- Detalhes dos registros de ponto: dia local, id do app (offline), localização e edição.
-- O servidor faz isto sozinho ao iniciar; esta é a versão manual (produção).
-- Rode no phpMyAdmin (aba SQL, banco "pontoclick" selecionado).
ALTER TABLE time_records
  ADD COLUMN work_date DATE NULL AFTER recorded_at,
  ADD COLUMN client_id VARCHAR(64) NULL AFTER work_date,
  ADD COLUMN latitude DECIMAL(9,6) NULL AFTER client_id,
  ADD COLUMN longitude DECIMAL(9,6) NULL AFTER latitude,
  ADD COLUMN accuracy_m SMALLINT UNSIGNED NULL AFTER longitude,
  ADD COLUMN location_name VARCHAR(100) NULL AFTER accuracy_m,
  ADD COLUMN original_recorded_at DATETIME NULL AFTER location_name,
  ADD COLUMN edited_at DATETIME NULL AFTER original_recorded_at,
  ADD INDEX idx_user_workdate (user_id, work_date),
  ADD UNIQUE INDEX uq_user_day_type (user_id, work_date, type),
  ADD UNIQUE INDEX uq_user_client (user_id, client_id);
