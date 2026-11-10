const pool = require('../config/database');

const MAX_LOCATIONS = 20;
const NAME_MIN = 2;
const NAME_MAX = 100;
const RADIUS_MIN = 50;
const RADIUS_MAX = 1000;
const DEFAULT_RADIUS = 150;

const COLUMNS = 'id, name, latitude, longitude, radius_m';

/// Formato que o app recebe.
function toLocation(row) {
  return {
    id: row.id,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radiusMeters: Number(row.radius_m),
  };
}

function inRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/// Valida o corpo (campos ausentes ficam com o valor atual, se houver).
/// Devolve { error } ou { name, latitude, longitude, radius }.
function parseBody(body, current = null) {
  const name = body.name !== undefined ? (typeof body.name === 'string' ? body.name.trim() : '') : current?.name;
  const latitude = body.latitude !== undefined ? body.latitude : current?.latitude;
  const longitude = body.longitude !== undefined ? body.longitude : current?.longitude;
  const radius = body.radiusMeters !== undefined ? body.radiusMeters : current?.radiusMeters ?? DEFAULT_RADIUS;

  if (!name || name.length < NAME_MIN) return { error: 'Dê um nome ao local (ex: Escritório Central).' };
  if (name.length > NAME_MAX) return { error: `O nome deve ter no máximo ${NAME_MAX} caracteres.` };
  if (!inRange(latitude, -90, 90) || !inRange(longitude, -180, 180)) return { error: 'Localização inválida.' };
  if (!Number.isInteger(radius) || radius < RADIUS_MIN || radius > RADIUS_MAX) {
    return { error: `O raio deve ser entre ${RADIUS_MIN} e ${RADIUS_MAX} metros.` };
  }
  return { name, latitude, longitude, radius };
}

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/// GET /locations — locais do usuário logado, em ordem alfabética.
async function listLocations(req, res) {
  try {
    const [rows] = await pool.query(`SELECT ${COLUMNS} FROM work_locations WHERE user_id = ? ORDER BY name ASC`, [
      req.userId,
    ]);
    return res.status(200).json({ locations: rows.map(toLocation) });
  } catch (err) {
    console.error('Erro em listLocations:', err);
    return res.status(500).json({ error: 'Erro interno ao buscar os locais.' });
  }
}

/// POST /locations
/// Corpo: { name, latitude, longitude, radiusMeters? (50–1000, padrão 150) }
async function createLocation(req, res) {
  try {
    const parsed = parseBody(req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM work_locations WHERE user_id = ?', [req.userId]);
    if (Number(count.total) >= MAX_LOCATIONS) {
      return res.status(400).json({ error: `Você pode cadastrar até ${MAX_LOCATIONS} locais. Apague um para adicionar outro.` });
    }

    let result;
    try {
      [result] = await pool.query(
        'INSERT INTO work_locations (user_id, name, latitude, longitude, radius_m) VALUES (?, ?, ?, ?, ?)',
        [req.userId, parsed.name, parsed.latitude, parsed.longitude, parsed.radius]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Você já tem um local com esse nome.' });
      throw err;
    }

    const [rows] = await pool.query(`SELECT ${COLUMNS} FROM work_locations WHERE id = ?`, [result.insertId]);
    return res.status(201).json({ message: 'Local adicionado!', location: toLocation(rows[0]) });
  } catch (err) {
    console.error('Erro em createLocation:', err);
    return res.status(500).json({ error: 'Erro interno ao salvar o local.' });
  }
}

/// PUT /locations/:id — altera nome, posição e/ou raio (só os campos enviados).
async function updateLocation(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Local inválido.' });

    const [found] = await pool.query(`SELECT ${COLUMNS} FROM work_locations WHERE id = ? AND user_id = ?`, [id, req.userId]);
    if (found.length === 0) return res.status(404).json({ error: 'Local não encontrado.' });

    const parsed = parseBody(req.body || {}, toLocation(found[0]));
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    try {
      await pool.query(
        'UPDATE work_locations SET name = ?, latitude = ?, longitude = ?, radius_m = ? WHERE id = ? AND user_id = ?',
        [parsed.name, parsed.latitude, parsed.longitude, parsed.radius, id, req.userId]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Você já tem um local com esse nome.' });
      throw err;
    }

    const [rows] = await pool.query(`SELECT ${COLUMNS} FROM work_locations WHERE id = ?`, [id]);
    return res.status(200).json({ message: 'Local atualizado!', location: toLocation(rows[0]) });
  } catch (err) {
    console.error('Erro em updateLocation:', err);
    return res.status(500).json({ error: 'Erro interno ao atualizar o local.' });
  }
}

/// DELETE /locations/:id — os pontos já registrados mantêm o nome do local.
async function deleteLocation(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Local inválido.' });

    const [result] = await pool.query('DELETE FROM work_locations WHERE id = ? AND user_id = ?', [id, req.userId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Local não encontrado.' });

    return res.status(200).json({ message: 'Local removido.' });
  } catch (err) {
    console.error('Erro em deleteLocation:', err);
    return res.status(500).json({ error: 'Erro interno ao remover o local.' });
  }
}

module.exports = { listLocations, createLocation, updateLocation, deleteLocation };
