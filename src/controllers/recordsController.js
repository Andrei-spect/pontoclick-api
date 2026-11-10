const pool = require('../config/database');

// Ordem obrigatória dos pontos em um dia.
const SEQUENCE = ['entrada', 'intervalo', 'volta_intervalo', 'saida'];
const LABELS = {
  entrada: 'Entrada',
  intervalo: 'Início do intervalo',
  volta_intervalo: 'Volta do intervalo',
  saida: 'Saída',
};

const HOUR_MS = 60 * 60 * 1000;
const MAX_RANGE_DAYS = 62;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000; // tolera pequena diferença entre o relógio do app e o do servidor
const MAX_EDIT_SHIFT_MS = 24 * HOUR_MS;

// Turno: da entrada até a saída cabem no máximo 16 h. Dentro desse prazo, um ponto
// depois da meia-noite continua o turno aberto (work_date do dia da entrada).
const MAX_SHIFT_HOURS = 16;
// Ponto feito sem internet pode ser enviado até 72 h depois; mais antigo é recusado.
const MAX_OFFLINE_HOURS = 72;
// O servidor não sabe o fuso do aparelho: o horário do ponto precisa cair entre
// a meia-noite do work_date no fuso mais adiantado (UTC+14) e o fim de um turno
// de 16 h começado às 23:59 no fuso mais atrasado (UTC-12).
const WORKDATE_BEFORE_MS = 14 * HOUR_MS;
const WORKDATE_AFTER_MS = (24 + 12 + MAX_SHIFT_HOURS) * HOUR_MS;

/// Turno ainda aberto de um dia ANTERIOR a [workDate]: tem entrada, não tem os 4
/// pontos e a entrada foi há no máximo 16 h de [at]. Devolve o work_date dele ou null.
async function findOpenShiftBefore(userId, workDate, at) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date, COUNT(*) AS total,
            DATE_FORMAT(MIN(CASE WHEN type = 'entrada' THEN recorded_at END), '%Y-%m-%dT%H:%i:%sZ') AS entrada
       FROM time_records
      WHERE user_id = ? AND work_date < ?
      GROUP BY work_date
      ORDER BY work_date DESC
      LIMIT 1`,
    [userId, workDate]
  );
  const day = rows[0];
  if (!day || !day.entrada || Number(day.total) >= SEQUENCE.length) return null;
  const elapsed = at.getTime() - new Date(day.entrada).getTime();
  return elapsed >= 0 && elapsed <= MAX_SHIFT_HOURS * HOUR_MS ? day.work_date : null;
}

// Datas saem do banco já formatadas (ISO em UTC), sem depender do fuso do servidor.
const SELECT_COLUMNS = `
  id, type,
  DATE_FORMAT(recorded_at, '%Y-%m-%dT%H:%i:%sZ') AS recorded_at,
  DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
  latitude, longitude, accuracy_m, location_name,
  DATE_FORMAT(original_recorded_at, '%Y-%m-%dT%H:%i:%sZ') AS original_recorded_at,
  (edited_at IS NOT NULL) AS edited`;

function numberOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

/// Formato que o app recebe.
function toRecord(row) {
  return {
    id: row.id,
    type: row.type,
    recordedAt: row.recorded_at,
    workDate: row.work_date,
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    accuracy: numberOrNull(row.accuracy_m),
    locationName: row.location_name,
    originalRecordedAt: row.original_recorded_at,
    edited: Boolean(row.edited),
  };
}

function isValidDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseInstant(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/// "2026-10-25 14:32:05" (UTC) — formato que o MySQL espera.
function toMysqlUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function inRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/// GET /records?date=2026-10-25            -> pontos de um dia
/// GET /records?from=2026-10-01&to=2026-10-31 -> pontos de um período (máx. 62 dias)
/// "date" é o dia local do usuário (o mesmo "workDate" enviado ao registrar).
async function listRecords(req, res) {
  try {
    let { date, from, to } = req.query;
    if (date !== undefined) {
      from = date;
      to = date;
    }

    if (!isValidDay(from) || !isValidDay(to)) {
      return res.status(400).json({ error: 'Informe "date" ou "from" e "to" no formato AAAA-MM-DD.' });
    }
    const days = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000 + 1;
    if (days < 1) {
      return res.status(400).json({ error: 'A data inicial deve ser anterior à final.' });
    }
    if (days > MAX_RANGE_DAYS) {
      return res.status(400).json({ error: `O período máximo é de ${MAX_RANGE_DAYS} dias.` });
    }

    const [rows] = await pool.query(
      `SELECT ${SELECT_COLUMNS} FROM time_records
        WHERE user_id = ? AND work_date BETWEEN ? AND ?
        ORDER BY recorded_at ASC, id ASC`,
      [req.userId, from, to]
    );
    return res.status(200).json({ records: rows.map(toRecord) });
  } catch (err) {
    console.error('Erro em listRecords:', err);
    return res.status(500).json({ error: 'Erro interno ao buscar os registros.' });
  }
}

/// POST /records
/// Corpo: { type, workDate?, recordedAt?, clientId?, latitude?, longitude?, accuracy?, locationName? }
///  - recordedAt ausente = vale o relógio do servidor (ponto feito online).
///  - recordedAt presente = ponto feito offline e enviado depois.
///  - clientId torna o envio idempotente: reenviar o mesmo ponto não duplica.
async function createRecord(req, res) {
  try {
    const body = req.body || {};

    if (!SEQUENCE.includes(body.type)) {
      return res.status(400).json({ error: 'Tipo de ponto inválido.' });
    }

    let recordedAt = new Date();
    if (body.recordedAt !== undefined && body.recordedAt !== null) {
      recordedAt = parseInstant(body.recordedAt);
      if (!recordedAt) return res.status(400).json({ error: 'Horário do ponto inválido.' });
      if (recordedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
        return res.status(400).json({ error: 'O horário do ponto não pode estar no futuro.' });
      }
      if (Date.now() - recordedAt.getTime() > MAX_OFFLINE_HOURS * HOUR_MS) {
        return res.status(400).json({
          error: `Este ponto foi feito há mais de ${MAX_OFFLINE_HOURS} horas e não pode mais ser enviado.`,
        });
      }
    }

    let workDate = body.workDate ?? recordedAt.toISOString().slice(0, 10);
    if (!isValidDay(workDate)) {
      return res.status(400).json({ error: 'Data do ponto inválida.' });
    }
    const workDateStart = new Date(`${workDate}T00:00:00Z`).getTime();
    if (
      recordedAt.getTime() < workDateStart - WORKDATE_BEFORE_MS ||
      recordedAt.getTime() > workDateStart + WORKDATE_AFTER_MS
    ) {
      return res.status(400).json({ error: 'A data do ponto não confere com o horário registrado.' });
    }

    const latitude = body.latitude ?? null;
    const longitude = body.longitude ?? null;
    const accuracy = body.accuracy ?? null;
    if (
      (latitude !== null && !inRange(latitude, -90, 90)) ||
      (longitude !== null && !inRange(longitude, -180, 180)) ||
      (accuracy !== null && !inRange(accuracy, 0, 65535))
    ) {
      return res.status(400).json({ error: 'Localização inválida.' });
    }
    const locationName = body.locationName ? String(body.locationName).trim().slice(0, 100) || null : null;
    const clientId = body.clientId ? String(body.clientId).trim().slice(0, 64) : null;

    // Reenvio do mesmo ponto: devolve o que já existe, sem duplicar.
    if (clientId) {
      const [existing] = await pool.query(
        `SELECT ${SELECT_COLUMNS} FROM time_records WHERE user_id = ? AND client_id = ?`,
        [req.userId, clientId]
      );
      if (existing.length > 0) {
        return res.status(200).json({ record: toRecord(existing[0]), duplicate: true });
      }
    }

    // Sequência do dia: entrada -> intervalo -> volta -> saída.
    const loadDay = async (date) => {
      const [rows] = await pool.query(
        `SELECT type, DATE_FORMAT(recorded_at, '%Y-%m-%dT%H:%i:%sZ') AS recorded_at
           FROM time_records WHERE user_id = ? AND work_date = ? ORDER BY recorded_at ASC, id ASC`,
        [req.userId, date]
      );
      return rows;
    };
    let day = await loadDay(workDate);

    // Turno da noite: o dia pedido ainda está vazio, mas há um turno aberto de um dia
    // anterior com entrada há no máximo 16 h -> o ponto continua aquele turno.
    // (Também corrige apps antigos, que mandavam a data do relógio do aparelho.)
    if (day.length === 0) {
      const openShift = await findOpenShiftBefore(req.userId, workDate, recordedAt);
      if (openShift) {
        workDate = openShift;
        day = await loadDay(workDate);
      }
    }
    if (day.length >= SEQUENCE.length) {
      return res.status(409).json({ error: 'Todos os pontos deste dia já foram registrados.', expectedType: null });
    }
    const expected = SEQUENCE[day.length];
    if (body.type !== expected) {
      return res.status(409).json({
        error: `Sequência inválida: o próximo ponto deste dia é "${LABELS[expected]}".`,
        expectedType: expected,
      });
    }
    if (day.length > 0 && recordedAt.getTime() <= new Date(day[day.length - 1].recorded_at).getTime()) {
      return res.status(400).json({ error: 'O horário precisa ser depois do ponto anterior.' });
    }

    let insertId;
    try {
      const [result] = await pool.query(
        `INSERT INTO time_records
           (user_id, type, recorded_at, work_date, client_id, latitude, longitude, accuracy_m, location_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.userId, body.type, toMysqlUtc(recordedAt), workDate, clientId, latitude, longitude,
          accuracy === null ? null : Math.round(accuracy), locationName]
      );
      insertId = result.insertId;
    } catch (err) {
      // Duas chamadas ao mesmo tempo: o índice único do banco segura a segunda.
      if (err.code === 'ER_DUP_ENTRY') {
        if (String(err.sqlMessage).includes('uq_user_client')) {
          const [again] = await pool.query(
            `SELECT ${SELECT_COLUMNS} FROM time_records WHERE user_id = ? AND client_id = ?`,
            [req.userId, clientId]
          );
          if (again.length > 0) return res.status(200).json({ record: toRecord(again[0]), duplicate: true });
        }
        return res.status(409).json({ error: 'Este ponto já foi registrado hoje.' });
      }
      throw err;
    }

    const [rows] = await pool.query(`SELECT ${SELECT_COLUMNS} FROM time_records WHERE id = ?`, [insertId]);
    return res.status(201).json({ message: 'Ponto registrado!', record: toRecord(rows[0]) });
  } catch (err) {
    console.error('Erro em createRecord:', err);
    return res.status(500).json({ error: 'Erro interno ao registrar o ponto.' });
  }
}

/// PUT /records/:id
/// Corpo: { recordedAt }  — corrige o horário de um ponto (guarda o horário original).
async function updateRecord(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Registro inválido.' });
    }

    const newTime = parseInstant((req.body || {}).recordedAt);
    if (!newTime) return res.status(400).json({ error: 'Horário inválido.' });
    if (newTime.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      return res.status(400).json({ error: 'O horário do ponto não pode estar no futuro.' });
    }

    const [found] = await pool.query(`SELECT ${SELECT_COLUMNS} FROM time_records WHERE id = ? AND user_id = ?`, [
      id,
      req.userId,
    ]);
    if (found.length === 0) {
      return res.status(404).json({ error: 'Ponto não encontrado.' });
    }
    const record = found[0];
    const currentTime = new Date(record.recorded_at);

    if (newTime.getTime() === currentTime.getTime()) {
      return res.status(200).json({ record: toRecord(record) });
    }
    if (Math.abs(newTime.getTime() - currentTime.getTime()) > MAX_EDIT_SHIFT_MS) {
      return res.status(400).json({ error: 'O horário só pode ser ajustado dentro do mesmo dia.' });
    }

    // O novo horário precisa respeitar a ordem dos pontos do dia.
    const [day] = await pool.query(
      `SELECT type, DATE_FORMAT(recorded_at, '%Y-%m-%dT%H:%i:%sZ') AS recorded_at
         FROM time_records WHERE user_id = ? AND work_date = ?`,
      [req.userId, record.work_date]
    );
    const position = SEQUENCE.indexOf(record.type);
    const previous = day.find((d) => d.type === SEQUENCE[position - 1]);
    const next = day.find((d) => d.type === SEQUENCE[position + 1]);
    if (
      (previous && newTime.getTime() <= new Date(previous.recorded_at).getTime()) ||
      (next && newTime.getTime() >= new Date(next.recorded_at).getTime())
    ) {
      return res.status(400).json({
        error: 'O horário precisa ficar depois do ponto anterior e antes do próximo do mesmo dia.',
      });
    }

    // original_recorded_at vem PRIMEIRO: o MySQL avalia a lista da esquerda para a direita,
    // então ele ainda enxerga o horário antigo de recorded_at.
    await pool.query(
      `UPDATE time_records
          SET original_recorded_at = COALESCE(original_recorded_at, recorded_at),
              recorded_at = ?,
              edited_at = UTC_TIMESTAMP()
        WHERE id = ? AND user_id = ?`,
      [toMysqlUtc(newTime), id, req.userId]
    );

    const [rows] = await pool.query(`SELECT ${SELECT_COLUMNS} FROM time_records WHERE id = ?`, [id]);
    return res.status(200).json({ message: 'Ponto atualizado!', record: toRecord(rows[0]) });
  } catch (err) {
    console.error('Erro em updateRecord:', err);
    return res.status(500).json({ error: 'Erro interno ao atualizar o ponto.' });
  }
}

module.exports = { listRecords, createRecord, updateRecord };
