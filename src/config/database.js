require('dotenv').config();
const mysql = require('mysql2/promise');

// DB_SSL=true liga a conexão criptografada (obrigatória em bancos na nuvem,
// como o TiDB Cloud). O certificado é conferido com as autoridades do Node.
const connectionOptions = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
};

// Pool de conexões: reutiliza conexões com o MySQL em vez de abrir
// uma nova a cada requisição, o que é essencial para performance
// quando vários usuários do app estiverem usando ao mesmo tempo.
const pool = mysql.createPool({
  ...connectionOptions,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Bancos na nuvem derrubam conexões paradas; o keep-alive evita erros na primeira requisição.
  enableKeepAlive: true,
});

/// Cria o banco DB_NAME se ainda não existir (instalação nova na nuvem).
async function createDatabaseIfMissing() {
  const name = process.env.DB_NAME || '';
  if (!/^\w+$/.test(name)) throw new Error('DB_NAME inválido.');
  const connection = await mysql.createConnection(connectionOptions);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await connection.end();
  }
}

module.exports = pool;
module.exports.createDatabaseIfMissing = createDatabaseIfMissing;
