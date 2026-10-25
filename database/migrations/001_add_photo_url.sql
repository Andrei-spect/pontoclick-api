-- Adiciona a coluna da foto de perfil na tabela users.
-- Rode no phpMyAdmin (aba SQL, com o banco "pontoclick" selecionado).
-- OBS: o servidor também faz isso sozinho ao iniciar; este arquivo é a
-- versão manual, útil para o banco de produção.
ALTER TABLE users ADD COLUMN photo_url VARCHAR(255) NULL AFTER company;
