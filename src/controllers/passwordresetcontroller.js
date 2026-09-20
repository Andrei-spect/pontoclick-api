const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const SALT_ROUNDS = 10;
const TOKEN_VALIDITY_MINUTES = 15;

/// Gera um token para o link de e-mail (string longa e aleatória).
function generateEmailToken() {
  return crypto.randomBytes(32).toString('hex');
}

/// Gera um código numérico de 6 dígitos para o fluxo por celular.
function generatePhoneCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/// POST /auth/forgot-password
/// Corpo esperado: { method: 'email' | 'phone', contact: string }
/// "contact" é o e-mail ou o número de celular informado na tela.
async function forgotPassword(req, res) {
  try {
    const { method, contact } = req.body;

    if (!method || !['email', 'phone'].includes(method)) {
      return res.status(400).json({ error: "O campo 'method' deve ser 'email' ou 'phone'." });
    }
    if (!contact) {
      return res.status(400).json({ error: 'Informe o e-mail ou celular cadastrado.' });
    }

    const column = method === 'email' ? 'email' : 'phone';
    const [users] = await pool.query(`SELECT id FROM users WHERE ${column} = ?`, [contact]);

    // Por segurança, não revelamos se o e-mail/celular existe ou não —
    // sempre respondemos com sucesso, mesmo que não exista cadastro.
    // Isso evita que alguém use essa rota para descobrir quais e-mails
    // estão cadastrados no sistema.
    if (users.length === 0) {
      return res.status(200).json({
        message: 'Se o cadastro existir, um código/link de recuperação foi enviado.',
      });
    }

    const userId = users[0].id;
    const token = method === 'email' ? generateEmailToken() : generatePhoneCode();

    const expiresAt = new Date(Date.now() + TOKEN_VALIDITY_MINUTES * 60 * 1000);

    await pool.query(
      'INSERT INTO password_resets (user_id, method, token, expires_at) VALUES (?, ?, ?, ?)',
      [userId, method, token, expiresAt]
    );

    // TODO: integrar com um serviço real de envio (ex: Nodemailer para
    // e-mail, ou uma API de SMS/WhatsApp para celular). Por enquanto,
    // devolvemos o token na resposta apenas para facilitar os testes
    // durante o desenvolvimento — isso NUNCA deve ir para produção.
    return res.status(200).json({
      message: 'Se o cadastro existir, um código/link de recuperação foi enviado.',
      dev_token: token,
    });
  } catch (err) {
    console.error('Erro em forgotPassword:', err);
    return res.status(500).json({ error: 'Erro interno ao processar a solicitação.' });
  }
}

/// POST /auth/reset-password
/// Corpo esperado: { token: string, newPassword: string }
async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const [resets] = await pool.query(
      `SELECT id, user_id, expires_at, used
       FROM password_resets
       WHERE token = ?
       ORDER BY id DESC
       LIMIT 1`,
      [token]
    );

    if (resets.length === 0) {
      return res.status(400).json({ error: 'Código ou link inválido.' });
    }

    const reset = resets[0];

    if (reset.used) {
      return res.status(400).json({ error: 'Este código/link já foi utilizado.' });
    }
    if (new Date(reset.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Este código/link expirou. Solicite um novo.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, reset.user_id]);
    await pool.query('UPDATE password_resets SET used = 1 WHERE id = ?', [reset.id]);

    return res.status(200).json({ message: 'Senha redefinida com sucesso!' });
  } catch (err) {
    console.error('Erro em resetPassword:', err);
    return res.status(500).json({ error: 'Erro interno ao redefinir a senha.' });
  }
}

module.exports = { forgotPassword, resetPassword };