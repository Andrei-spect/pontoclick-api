const pool = require('./database');

/// Rede de segurança para desenvolvimento: se a coluna da foto de perfil ainda
/// não existe no banco, cria. Evita que login/perfil quebrem por esquecer de
/// rodar o ALTER TABLE à mão (database/migrations/001_add_photo_url.sql).
async function ensureSchema() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'photo_url'`
  );

  if (Number(rows[0].total) === 0) {
    await pool.query('ALTER TABLE users ADD COLUMN photo_url VARCHAR(255) NULL AFTER company');
    console.log('Banco atualizado: coluna users.photo_url criada.');
  }
}

module.exports = { ensureSchema };
