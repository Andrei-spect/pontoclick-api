const pool = require('../config/database');
const { isMailConfigured, sendSupportMessage } = require('../utils/mailer');
const { optionalText } = require('../utils/validation');

const MIN_LENGTH = 10;
const MAX_LENGTH = 2000;
const MAX_PER_HOUR = 5;

/// POST /support
/// Corpo esperado: { message, appVersion?, platform? }
/// Grava a mensagem e envia por e-mail para SUPPORT_EMAIL (padrão: SMTP_USER).
/// A mensagem fica salva mesmo se o e-mail falhar (coluna emailed = 0).
async function createSupportMessage(req, res) {
  try {
    const body = req.body || {};
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const appVersion = (optionalText(body.appVersion) || '').slice(0, 20) || null;
    const platform = (optionalText(body.platform) || '').slice(0, 30) || null;

    if (message.length < MIN_LENGTH) {
      return res.status(400).json({ error: `Escreva pelo menos ${MIN_LENGTH} caracteres para a gente entender o que aconteceu.` });
    }
    if (message.length > MAX_LENGTH) {
      return res.status(400).json({ error: `A mensagem deve ter no máximo ${MAX_LENGTH} caracteres.` });
    }

    const [[recent]] = await pool.query(
      'SELECT COUNT(*) AS total FROM support_messages WHERE user_id = ? AND created_at > NOW() - INTERVAL 1 HOUR',
      [req.userId]
    );
    if (Number(recent.total) >= MAX_PER_HOUR) {
      return res.status(429).json({ error: 'Você já enviou várias mensagens na última hora. Aguarde um pouco para enviar outra.' });
    }

    const [users] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [req.userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const user = users[0];

    const [insert] = await pool.query(
      'INSERT INTO support_messages (user_id, message, app_version, platform) VALUES (?, ?, ?, ?)',
      [user.id, message, appVersion, platform]
    );

    const to = process.env.SUPPORT_EMAIL || process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER;
    if (isMailConfigured() && to) {
      try {
        await sendSupportMessage({ to, user, message, appVersion, platform, messageId: insert.insertId });
        await pool.query('UPDATE support_messages SET emailed = 1 WHERE id = ?', [insert.insertId]);
      } catch (err) {
        // A mensagem já está salva no banco; o suporte pode consultá-la lá.
        console.error(`Falha ao enviar a mensagem de suporte nº ${insert.insertId} por e-mail:`, err.message);
      }
    } else {
      console.log(`[DEV] Mensagem de suporte nº ${insert.insertId} de ${user.email}: ${message}`);
    }

    return res.status(201).json({ message: 'Mensagem enviada! Responderemos no seu e-mail.' });
  } catch (err) {
    console.error('Erro em createSupportMessage:', err);
    return res.status(500).json({ error: 'Erro interno ao enviar a mensagem.' });
  }
}

module.exports = { createSupportMessage };
