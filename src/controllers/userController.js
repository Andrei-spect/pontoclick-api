const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/database');
const { generateToken } = require('../utils/jwt');
const { savePhoto, removePhoto } = require('../utils/photoStore');
const { normalizeEmail, isValidEmail, optionalText, passwordError, lengthError } = require('../utils/validation');

const SALT_ROUNDS = 10;
const PUBLIC_COLUMNS = 'id, name, email, phone, role, company, photo_url';


/// Formato que o app recebe (camelCase), sem nada sensível como o hash da senha.
function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    company: row.company,
    photoUrl: row.photo_url,
  };
}


/// Descobre o formato REAL da imagem pelos primeiros bytes (e não pelo tipo
/// que o cliente diz que é, que pode ser mentira). Devolve a extensão ou null.
function detectImageExtension(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  return null;
}

/// GET /users/me
async function getMe(req, res) {
  try {
    const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [req.userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    return res.status(200).json({ user: toPublicUser(rows[0]) });
  } catch (err) {
    console.error('Erro em getMe:', err);
    return res.status(500).json({ error: 'Erro interno ao buscar o perfil.' });
  }
}

/// PUT /users/me
/// Corpo esperado: { name, email, phone?, role?, company? }
async function updateMe(req, res) {
  try {
    const body = req.body || {};
    const name = optionalText(body.name);
    const email = normalizeEmail(body.email);
    const phone = optionalText(body.phone);
    const role = optionalText(body.role);
    const company = optionalText(body.company);

    if (!name) {
      return res.status(400).json({ error: 'O nome é obrigatório.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    const tooLong = lengthError({ name, phone, role, company });
    if (tooLong) {
      return res.status(400).json({ error: tooLong });
    }

    // O e-mail precisa continuar único — mas o próprio usuário pode mantê-lo.
    const [taken] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, req.userId]);
    if (taken.length > 0) {
      return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
    }

    const [result] = await pool.query(
      'UPDATE users SET name = ?, email = ?, phone = ?, role = ?, company = ? WHERE id = ?',
      [name, email, phone, role, company, req.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [req.userId]);
    return res.status(200).json({ message: 'Perfil atualizado com sucesso!', user: toPublicUser(rows[0]) });
  } catch (err) {
    console.error('Erro em updateMe:', err);
    return res.status(500).json({ error: 'Erro interno ao atualizar o perfil.' });
  }
}

/// PUT /users/change-password
/// Corpo esperado: { currentPassword, newPassword }
/// Resposta: { message, token } — a troca encerra as sessões dos OUTROS aparelhos;
/// o app guarda o token novo para continuar conectado neste.
///
/// Senha atual incorreta responde 400 (e não 401) de propósito — o app trata
/// 401 como "sessão expirada" e deslogaria o usuário à toa.
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (typeof currentPassword !== 'string' || !currentPassword || newPassword === undefined) {
      return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
    }
    const invalid = passwordError(newPassword, 'A nova senha');
    if (invalid) {
      return res.status(400).json({ error: invalid });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'A nova senha deve ser diferente da atual.' });
    }

    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const matches = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!matches) {
      return res.status(400).json({ error: 'A senha atual está incorreta.' });
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [
      newHash,
      req.userId,
    ]);
    const [[updated]] = await pool.query('SELECT token_version FROM users WHERE id = ?', [req.userId]);
    const token = generateToken({ userId: req.userId, tokenVersion: updated.token_version });

    return res.status(200).json({ message: 'Senha alterada com sucesso!', token });
  } catch (err) {
    console.error('Erro em changePassword:', err);
    return res.status(500).json({ error: 'Erro interno ao alterar a senha.' });
  }
}

/// POST /users/me/photo
/// multipart/form-data com a imagem no campo "photo" (JPG, PNG ou WebP, até 5 MB).
async function uploadPhoto(req, res) {
  let savedUrl = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie uma imagem no campo "photo".' });
    }

    const extension = detectImageExtension(req.file.buffer);
    if (!extension) {
      return res.status(400).json({ error: 'Formato inválido. Use uma imagem JPG, PNG ou WebP.' });
    }

    const [current] = await pool.query('SELECT photo_url FROM users WHERE id = ?', [req.userId]);
    if (current.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    // Nome novo e aleatório a cada envio: ninguém adivinha a URL e o app não
    // mostra a foto antiga guardada em cache.
    const filename = `${req.userId}-${crypto.randomBytes(8).toString('hex')}.${extension}`;
    savedUrl = await savePhoto(req.userId, filename, req.file.buffer);

    await pool.query('UPDATE users SET photo_url = ? WHERE id = ?', [savedUrl, req.userId]);
    savedUrl = null; // gravou no perfil: a foto nova passa a valer

    await removePhoto(current[0].photo_url);

    const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [req.userId]);
    return res.status(200).json({ message: 'Foto atualizada com sucesso!', user: toPublicUser(rows[0]) });
  } catch (err) {
    // Se algo falhou depois de gravar a foto, não deixa lixo guardado.
    if (savedUrl) await removePhoto(savedUrl);
    console.error('Erro em uploadPhoto:', err);
    return res.status(500).json({ error: 'Erro interno ao salvar a foto.' });
  }
}

/// DELETE /users/me/photo
async function deletePhoto(req, res) {
  try {
    const [current] = await pool.query('SELECT photo_url FROM users WHERE id = ?', [req.userId]);
    if (current.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    await pool.query('UPDATE users SET photo_url = NULL WHERE id = ?', [req.userId]);
    await removePhoto(current[0].photo_url);

    const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [req.userId]);
    return res.status(200).json({ message: 'Foto removida.', user: toPublicUser(rows[0]) });
  } catch (err) {
    console.error('Erro em deletePhoto:', err);
    return res.status(500).json({ error: 'Erro interno ao remover a foto.' });
  }
}

/// DELETE /users/me
/// Corpo esperado: { password }
///
/// Exclui a conta e TODOS os dados do usuário, sem volta: pontos, locais de
/// trabalho, preferências, mensagens de suporte, códigos de recuperação
/// (ON DELETE CASCADE no banco) e a foto de perfil no disco.
/// Exigido pela App Store e pela Google Play para apps com cadastro.
/// Senha errada responde 400 (e não 401), pelo mesmo motivo do change-password.
async function deleteMe(req, res) {
  try {
    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Digite sua senha para confirmar a exclusão.' });
    }

    const [rows] = await pool.query('SELECT password_hash, photo_url FROM users WHERE id = ?', [req.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const matches = await bcrypt.compare(password, rows[0].password_hash);
    if (!matches) {
      return res.status(400).json({ error: 'Senha incorreta.' });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [req.userId]);
    await removePhoto(rows[0].photo_url);

    return res.status(200).json({ message: 'Sua conta e todos os seus dados foram excluídos.' });
  } catch (err) {
    console.error('Erro em deleteMe:', err);
    return res.status(500).json({ error: 'Erro interno ao excluir a conta.' });
  }
}

module.exports = { getMe, updateMe, changePassword, uploadPhoto, deletePhoto, deleteMe };
