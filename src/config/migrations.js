const pool = require('./database');

/// Tabelas criadas depois da primeira versão do banco (CREATE TABLE IF NOT EXISTS:
/// rodar de novo não faz nada). Mesma definição de database/schema.sql.
const TABLES = [
  {
    name: 'support_messages',
    ddl: `CREATE TABLE IF NOT EXISTS support_messages (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      message TEXT NOT NULL,
      app_version VARCHAR(20) NULL,
      platform VARCHAR(30) NULL,
      emailed TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_support_user_created (user_id, created_at)
    ) ENGINE=InnoDB`,
  },
  {
    name: 'work_locations',
    ddl: `CREATE TABLE IF NOT EXISTS work_locations (
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
    ) ENGINE=InnoDB`,
  },
  {
    name: 'notification_settings',
    ddl: `CREATE TABLE IF NOT EXISTS notification_settings (
      user_id INT UNSIGNED PRIMARY KEY,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      days VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5',
      entrada_enabled TINYINT(1) NOT NULL DEFAULT 1,
      entrada_time CHAR(5) NOT NULL DEFAULT '08:00',
      intervalo_enabled TINYINT(1) NOT NULL DEFAULT 1,
      intervalo_time CHAR(5) NOT NULL DEFAULT '12:00',
      volta_enabled TINYINT(1) NOT NULL DEFAULT 1,
      volta_time CHAR(5) NOT NULL DEFAULT '13:00',
      saida_enabled TINYINT(1) NOT NULL DEFAULT 1,
      saida_time CHAR(5) NOT NULL DEFAULT '17:00',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
  },
];

async function tableExists(name) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [name]
  );
  return Number(rows[0].total) > 0;
}

/// Colunas adicionadas depois da primeira versão do banco.
const COLUMNS = [
  { table: 'users', column: 'photo_url', ddl: 'ALTER TABLE users ADD COLUMN photo_url VARCHAR(255) NULL AFTER company' },
  // Versão da sessão: sobe a cada troca/redefinição de senha e invalida os tokens antigos.
  { table: 'users', column: 'token_version', ddl: 'ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER password_hash' },

  { table: 'time_records', column: 'work_date', ddl: 'ALTER TABLE time_records ADD COLUMN work_date DATE NULL AFTER recorded_at' },
  { table: 'time_records', column: 'client_id', ddl: 'ALTER TABLE time_records ADD COLUMN client_id VARCHAR(64) NULL AFTER work_date' },
  { table: 'time_records', column: 'latitude', ddl: 'ALTER TABLE time_records ADD COLUMN latitude DECIMAL(9,6) NULL AFTER client_id' },
  { table: 'time_records', column: 'longitude', ddl: 'ALTER TABLE time_records ADD COLUMN longitude DECIMAL(9,6) NULL AFTER latitude' },
  { table: 'time_records', column: 'accuracy_m', ddl: 'ALTER TABLE time_records ADD COLUMN accuracy_m SMALLINT UNSIGNED NULL AFTER longitude' },
  { table: 'time_records', column: 'location_name', ddl: 'ALTER TABLE time_records ADD COLUMN location_name VARCHAR(100) NULL AFTER accuracy_m' },
  { table: 'time_records', column: 'original_recorded_at', ddl: 'ALTER TABLE time_records ADD COLUMN original_recorded_at DATETIME NULL AFTER location_name' },
  { table: 'time_records', column: 'edited_at', ddl: 'ALTER TABLE time_records ADD COLUMN edited_at DATETIME NULL AFTER original_recorded_at' },

  { table: 'password_resets', column: 'attempts', ddl: 'ALTER TABLE password_resets ADD COLUMN attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER used' },
];

/// Colunas cujo TIPO precisou mudar. expires_at era TIMESTAMP e o MySQL/MariaDB
/// coloca "ON UPDATE CURRENT_TIMESTAMP" nele sozinho: qualquer UPDATE na linha
/// (marcar como usado, contar tentativa) mudava a validade para "agora".
const TYPE_CHANGES = [
  {
    table: 'password_resets',
    column: 'expires_at',
    dataType: 'datetime',
    ddl: 'ALTER TABLE password_resets MODIFY expires_at DATETIME NOT NULL',
  },
];

const INDEXES = [
  { table: 'time_records', name: 'idx_user_workdate', ddl: 'ALTER TABLE time_records ADD INDEX idx_user_workdate (user_id, work_date)' },
  // Um mesmo tipo de ponto só pode existir uma vez por dia (protege contra clique duplo / corrida).
  { table: 'time_records', name: 'uq_user_day_type', ddl: 'ALTER TABLE time_records ADD UNIQUE INDEX uq_user_day_type (user_id, work_date, type)' },
  // Evita duplicar um ponto offline que foi reenviado depois de uma falha de rede.
  { table: 'time_records', name: 'uq_user_client', ddl: 'ALTER TABLE time_records ADD UNIQUE INDEX uq_user_client (user_id, client_id)' },
  // Busca do código mais recente do usuário e limite de pedidos por hora.
  { table: 'password_resets', name: 'idx_user_created', ddl: 'ALTER TABLE password_resets ADD INDEX idx_user_created (user_id, created_at)' },
];

async function columnDataType(table, column) {
  const [rows] = await pool.query(
    `SELECT DATA_TYPE AS type FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length ? String(rows[0].type).toLowerCase() : null;
}

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
  for (const { name, ddl } of TABLES) {
    if (!(await tableExists(name))) {
      await pool.query(ddl);
      console.log(`Banco atualizado: tabela ${name} criada.`);
    }
  }
  for (const { table, column, ddl } of COLUMNS) {
    if (!(await columnExists(table, column))) {
      await pool.query(ddl);
      console.log(`Banco atualizado: coluna ${table}.${column} criada.`);
    }
  }
  for (const { table, column, dataType, ddl } of TYPE_CHANGES) {
    const current = await columnDataType(table, column);
    if (current && current !== dataType) {
      await pool.query(ddl);
      console.log(`Banco atualizado: coluna ${table}.${column} agora é ${dataType.toUpperCase()}.`);
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
