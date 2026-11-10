const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { generateToken } = require('../utils/jwt');
const { normalizeEmail, isValidEmail, optionalText, passwordError, lengthError } = require('../utils/validation');

const SALT_ROUNDS = 10;

// Hash qualquer, usado quando o e-mail não existe: o login leva o mesmo tempo
// com ou sem conta, e o tempo de resposta não revela quais e-mails estão cadastrados.
const DUMMY_HASH = bcrypt.hashSync('pontoclick-dummy-password', SALT_ROUNDS);

/// POST /auth/register
/// Corpo esperado: { name, email, phone?, password }
async function register(req, res) {
  try {
    const body = req.body || {};
    const name = optionalText(body.name);
    const email = normalizeEmail(body.email);
    const phone = optionalText(body.phone);
    const { password } = body;

    if (!name || !email || password === undefined) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    const invalid = passwordError(password) || lengthError({ name, phone });
    if (invalid) {
      return res.status(400).json({ error: invalid });
    }

    // Verifica se já existe um usuário com esse e-mail.
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    let result;
    try {
      [result] = await pool.query('INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)', [
        name,
        email,
        phone,
        passwordHash,
      ]);
    } catch (err) {
      // Dois cadastros iguais ao mesmo tempo: o índice único do e-mail segura o segundo.
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
      }
      throw err;
    }

    const userId = result.insertId;
    const token = generateToken({ userId, tokenVersion: 0 });

    return res.status(201).json({
      message: 'Conta criada com sucesso!',
      token,
      user: { id: userId, name, email, phone },
    });
  } catch (err) {
    console.error('Erro no registro:', err);
    return res.status(500).json({ error: 'Erro interno ao criar a conta.' });
  }
}

/// POST /auth/login
/// Corpo esperado: { email, password }
async function login(req, res) {
  try {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const { password } = body;

    if (!email || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }
    if (password.length > 128) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const [rows] = await pool.query(
      'SELECT id, name, email, phone, role, company, photo_url, password_hash, token_version FROM users WHERE email = ?',
      [email]
    );

    const user = rows[0];
    const passwordMatches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !passwordMatches) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const token = generateToken({ userId: user.id, tokenVersion: user.token_version });

    return res.status(200).json({
      message: 'Login realizado com sucesso!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        company: user.company,
        photoUrl: user.photo_url,
      },
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ error: 'Erro interno ao fazer login.' });
  }
}

module.exports = { register, login };
