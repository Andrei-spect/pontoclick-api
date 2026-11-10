const pool = require('../config/database');

/// Os 4 lembretes, na ordem do dia, com o nome das colunas no banco.
const REMINDERS = ['entrada', 'intervalo', 'volta', 'saida'];

const DEFAULTS = {
  enabled: true,
  days: [1, 2, 3, 4, 5], // 1 = segunda ... 7 = domingo
  reminders: {
    entrada: { enabled: true, time: '08:00' },
    intervalo: { enabled: true, time: '12:00' },
    volta: { enabled: true, time: '13:00' },
    saida: { enabled: true, time: '17:00' },
  },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/// Formato que o app recebe.
function toSettings(row) {
  if (!row) return DEFAULTS;
  const reminders = {};
  for (const key of REMINDERS) {
    reminders[key] = { enabled: Boolean(row[`${key}_enabled`]), time: row[`${key}_time`] };
  }
  return {
    enabled: Boolean(row.enabled),
    days: String(row.days || '')
      .split(',')
      .map(Number)
      .filter((d) => d >= 1 && d <= 7),
    reminders,
  };
}

/// GET /users/me/notifications — preferências dos lembretes (padrão se nunca salvou).
async function getNotificationSettings(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM notification_settings WHERE user_id = ?', [req.userId]);
    return res.status(200).json({ settings: toSettings(rows[0]) });
  } catch (err) {
    console.error('Erro em getNotificationSettings:', err);
    return res.status(500).json({ error: 'Erro interno ao buscar as notificações.' });
  }
}

/// PUT /users/me/notifications
/// Corpo: { enabled, days: [1..7], reminders: { entrada|intervalo|volta|saida: { enabled, time: "HH:MM" } } }
async function updateNotificationSettings(req, res) {
  try {
    const body = req.body || {};

    if (typeof body.enabled !== 'boolean') {
      return res.status(400).json({ error: 'Informe se os lembretes estão ligados.' });
    }
    if (!Array.isArray(body.days) || body.days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
      return res.status(400).json({ error: 'Dias da semana inválidos.' });
    }
    const days = [...new Set(body.days)].sort((a, b) => a - b);

    const reminders = body.reminders || {};
    const values = [];
    for (const key of REMINDERS) {
      const item = reminders[key];
      if (!item || typeof item.enabled !== 'boolean' || typeof item.time !== 'string' || !TIME_RE.test(item.time)) {
        return res.status(400).json({ error: 'Horário de lembrete inválido. Use o formato HH:MM.' });
      }
      values.push(item.enabled ? 1 : 0, item.time);
    }

    // Os horários precisam seguir a ordem do dia (entrada < intervalo < volta < saída)
    // entre os lembretes ligados — exceto turno da noite, em que a saída pode ser no dia seguinte.
    const active = REMINDERS.filter((k) => reminders[k].enabled).map((k) => ({ key: k, time: reminders[k].time }));
    for (let i = 1; i < active.length; i++) {
      const isOvernightExit = active[i].key === 'saida' && active[i].time < active[0].time;
      if (active[i].time <= active[i - 1].time && !isOvernightExit) {
        return res.status(400).json({ error: 'Os horários precisam seguir a ordem: entrada, intervalo, volta e saída.' });
      }
    }

    await pool.query(
      `INSERT INTO notification_settings
         (user_id, enabled, days, entrada_enabled, entrada_time, intervalo_enabled, intervalo_time,
          volta_enabled, volta_time, saida_enabled, saida_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         enabled = VALUES(enabled), days = VALUES(days),
         entrada_enabled = VALUES(entrada_enabled), entrada_time = VALUES(entrada_time),
         intervalo_enabled = VALUES(intervalo_enabled), intervalo_time = VALUES(intervalo_time),
         volta_enabled = VALUES(volta_enabled), volta_time = VALUES(volta_time),
         saida_enabled = VALUES(saida_enabled), saida_time = VALUES(saida_time)`,
      [req.userId, body.enabled ? 1 : 0, days.join(','), ...values]
    );

    const [rows] = await pool.query('SELECT * FROM notification_settings WHERE user_id = ?', [req.userId]);
    return res.status(200).json({ message: 'Notificações atualizadas!', settings: toSettings(rows[0]) });
  } catch (err) {
    console.error('Erro em updateNotificationSettings:', err);
    return res.status(500).json({ error: 'Erro interno ao salvar as notificações.' });
  }
}

module.exports = { getNotificationSettings, updateNotificationSettings };
