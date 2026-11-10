const pool = require('./database');

/// Colunas adicionadas depois da primeira versão do banco.
const COLUMNS = [
  { table: 'users', column: 'photo_url', ddl: 'ALTER TABLE users ADD COLUMN photo_url VARCHAR(255) NULL AFTER company' },

  { table: 'time_records', column: 'work_date', ddl: 'ALTER TABLE time_records ADD COLUMN work_date DATE NULL AFTER recorded_at' },
  { table: 'time_records', column: 'client_id', ddl: 'ALTER TABLE time_records ADD COLUMN client_id VARCHAR(64) NULL AFTER work_date' },
  { table: 'time_records', column: 'latitude', ddl: 'ALTER TABLE time_records ADD COLUMN latitude DECIMAL(9,6) NULL AFTER client_id' },
  { table: 'time_records', column: 'longitude', ddl: 'ALTER TABLE time_records ADD COLUMN longitude DECIMAL(9,6) NULL AFTER latitude' },
  { table: 'time_records', column: 'accuracy_m', ddl: 'ALTER TABLE time_records ADD COLUMN accuracy_m SMALLINT UNSIGNED NULL AFTER longitude' },
  { table: 'time_records', column: 'location_name', ddl: 'ALTER TABLE time_records ADD COLUMN location_name VARCHAR(100) NULL AFTER accuracy_m' },
  { table: 'time_records', column: 'original_recorded_at', ddl: 'ALTER TABLE time_records ADD COLUMN original_recorded_at DATETIME NULL AFTER location_name' },
  { table: 'time_records', column: 'edited_at', ddl: 'ALTER TABLE time_records ADD COLUMN edited_at DATETIME NULL AFTER original_recorded_at' },
];

const INDEXES = [
  { table: 'time_records', name: 'idx_user_workdate', ddl: 'ALTER TABLE time_records ADD INDEX idx_user_workdate (user_id, work_date)' },
  // Um mesmo tipo de ponto só pode existir uma vez por dia (protege contra clique duplo / corrida).
  { table: 'time_records', name: 'uq_user_day_type', ddl: 'ALTER TABLE time_records ADD UNIQUE INDEX uq_user_day_type (user_id, work_date, type)' },
  // Evita duplicar um ponto offline que foi reenviado depois de uma falha de rede.
  { table: 'time_records', name: 'uq_user_client', ddl: 'ALTER TABLE time_records ADD UNIQUE INDEX uq_user_client (user_id, client_id)' },
];

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].total) > 0;
}

async function indexExists(table, name) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, name]
  );
  return Number(rows[0].total) > 0;
}

/// Rede de segurança para desenvolvimento: cria o que faltar no banco ao iniciar
/// o servidor, para que atualizar o código nunca quebre por esquecer um ALTER TABLE.
/// As versões manuais estão em database/migrations/.
async function ensureSchema() {
  for (const { table, column, ddl } of COLUMNS) {
    if (!(await columnExists(table, column))) {
      await pool.query(ddl);
      console.log(`Banco atualizado: coluna ${table}.${column} criada.`);
    }
  }
  for (const { table, name, ddl } of INDEXES) {
    if (!(await indexExists(table, name))) {
      await pool.query(ddl);
      console.log(`Banco atualizado: índice ${table}.${name} criado.`);
    }
  }
}

module.exports = { ensureSchema };
