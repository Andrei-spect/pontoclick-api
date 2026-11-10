const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { isMailConfigured, sendPasswordResetCode } = require('../utils/mailer');
const { normalizeEmail, isValidEmail, passwordError } = require('../utils/validation');

const SALT_ROUNDS = 10;
const CODE_VALIDITY_MINUTES = 15;
const MAX_ATTEMPTS = 5; // tentativas erradas por código
const RESEND_COOLDOWN_SECONDS = 60; // intervalo mínimo entre pedidos
const MAX_REQUESTS_PER_HOUR = 5;

// Mesma resposta exista ou não a conta: assim a rota não revela quais e-mails estão cadastrados.
const GENERIC_MESSAGE = 'Se houver uma conta com esse e-mail, enviamos um código de 6 dígitos.';

/// Código numérico de 6 dígitos com gerador criptográfico.
function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/// O banco guarda só o hash do código (HMAC com o segredo do servidor), nunca o código em si.
function hashCode(userId, code) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'pontoclick').update(`${userId}:${code}`).digest('hex');
}

function sameHash(a, b) {
  const bufA = Buffer.from(String(a), 'hex');
  const bufB = Buffer.from(String(b), 'hex');
  return bufA.length === bufB.length && bufA.length > 0 && crypto.timingSafeEqual(bufA, bufB);
}

/// POST /auth/forgot-password
/// Corpo esperado: { email }
/// Gera um código de 6 dígitos (válido por 15 min) e envia por e-mail.
async function forgotPassword(req, res) {
  try {
    const email = normalizeEmail((req.body || {}).email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }

    const [users] = await pool.query('SELECT id, name, email FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(200).json({ message: GENERIC_MESSAGE });
    }
    const user = users[0];

    // Limites de envio: evita encher a caixa de e-mail de alguém e tentativas em massa.
    const [[recent]] = await pool.query(
      `SELECT
         SUM(created_at > NOW() - INTERVAL ? SECOND) AS last_minute,
         SUM(created_at > NOW() - INTERVAL 1 HOUR) AS last_hour
       FROM password_resets WHERE user_id = ?`,
      [RESEND_COOLDOWN_SECONDS, user.id]
    );
    if (Number(recent.last_minute) > 0) {
      return res.status(429).json({ error: `Aguarde ${RESEND_COOLDOWN_SECONDS} segundos para pedir um novo código.` });
    }
    if (Number(recent.last_hour) >= MAX_REQUESTS_PER_HOUR) {
      return res.status(429).json({ error: 'Muitos pedidos de código. Tente novamente em 1 hora.' });
    }

    if (!isMailConfigured() && process.env.NODE_ENV === 'production') {
      console.error('forgotPassword: SMTP não configurado no .env');
      return res.status(503).json({ error: 'O envio de e-mails está indisponível no momento. Tente mais tarde.' });
    }

    // Um código novo invalida os anteriores.
    await pool.query('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', [user.id]);

    const code = generateCode();
    const [insert] = await pool.query(
      `INSERT INTO password_resets (user_id, method, token, expires_at)
       VALUES (?, 'email', ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE)`,
      [user.id, hashCode(user.id, code), CODE_VALIDITY_MINUTES]
    );

    if (isMailConfigured()) {
      try {
        await sendPasswordResetCode({ to: user.email, name: user.name, code, validityMinutes: CODE_VALIDITY_MINUTES });
      } catch (err) {
        console.error('Falha ao enviar e-mail de recuperação:', err.message);
        await pool.query('UPDATE password_resets SET used = 1 WHERE id = ?', [insert.insertId]);
        return res.status(503).json({ error: 'Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.' });
      }
    } else {
      // Desenvolvimento sem SMTP: o código aparece só no terminal da API, nunca na resposta.
      console.log(`[DEV] Código de recuperação para ${user.email}: ${code} (configure SMTP_* no .env para enviar por e-mail)`);
    }

    return res.status(200).json({ message: GENERIC_MESSAGE });
  } catch (err) {
    console.error('Erro em forgotPassword:', err);
    return res.status(500).json({ error: 'Erro interno ao processar a solicitação.' });
  }
}

/// POST /auth/reset-password
/// Corpo esperado: { email, code, newPassword }
async function resetPassword(req, res) {
  try {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const newPassword = body.newPassword;

    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Informe o e-mail e o código de 6 dígitos.' });
    }
    const invalidPassword = passwordError(newPassword);
    if (invalidPassword) {
      return res.status(400).json({ error: invalidPassword });
    }

    const invalid = () => res.status(400).json({ error: 'Código inválido ou expirado. Peça um novo código.' });

    const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (users.length === 0) return invalid();
    const userId = users[0].id;

    const [resets] = await pool.query(
      `SELECT id, token, attempts FROM password_resets
        WHERE user_id = ? AND used = 0 AND expires_at > UTC_TIMESTAMP()
        ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (resets.length === 0) return invalid();
    const reset = resets[0];

    if (reset.attempts >= MAX_ATTEMPTS) {
      await pool.query('UPDATE password_resets SET used = 1 WHERE id = ?', [reset.id]);
      return res.status(400).json({ error: 'Muitas tentativas erradas. Peça um novo código.' });
    }

    if (!sameHash(reset.token, hashCode(userId, code))) {
      const attempts = reset.attempts + 1;
      const remaining = MAX_ATTEMPTS - attempts;
      await pool.query('UPDATE password_resets SET attempts = ?, used = ? WHERE id = ?', [attempts, remaining <= 0 ? 1 : 0, reset.id]);
      if (remaining <= 0) {
        return res.status(400).json({ error: 'Muitas tentativas erradas. Peça um novo código.' });
      }
      return res.status(400).json({
        error: `Código incorreto. Você ainda tem ${remaining} ${remaining === 1 ? 'tentativa' : 'tentativas'}.`,
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    // token_version + 1: quem estava logado em qualquer aparelho (inclusive um invasor) é desconectado.
    await pool.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [
      passwordHash,
      userId,
    ]);
    // O código usado e qualquer outro pendente deixam de valer.
    await pool.query('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', [userId]);

    return res.status(200).json({ message: 'Senha redefinida com sucesso!' });
  } catch (err) {
    console.error('Erro em resetPassword:', err);
    return res.status(500).json({ error: 'Erro interno ao redefinir a senha.' });
  }
}

module.exports = { forgotPassword, resetPassword };
