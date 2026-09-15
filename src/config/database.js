require('dotenv').config();
const mysql = require('mysql2/promise');

// Pool de conexões: reutiliza conexões com o MySQL em vez de abrir
// uma nova a cada requisição, o que é essencial para performance
// quando vários usuários do app estiverem usando ao mesmo tempo.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
