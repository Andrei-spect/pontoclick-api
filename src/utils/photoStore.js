const fs = require('fs/promises');
const path = require('path');
const pool = require('../config/database');

/// Onde ficam as fotos de perfil. Duas opções (PHOTO_STORAGE no .env):
///   - "disk" (padrão): pasta uploads/avatars/ — bom no PC e em servidor com disco próprio;
///   - "db": tabela user_photos — para hospedagens cujo disco é apagado a cada
///     reinício (ex: plano gratuito do Render).
/// Nos dois casos a URL pública é a mesma: /uploads/avatars/<arquivo>.

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');
const PUBLIC_PREFIX = '/uploads/avatars/';
const MIME_BY_EXTENSION = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function storesInDatabase() {
  return process.env.PHOTO_STORAGE === 'db';
}

/// Grava a foto e devolve a URL pública.
async function savePhoto(userId, filename, buffer) {
  if (storesInDatabase()) {
    const mime = MIME_BY_EXTENSION[path.extname(filename).slice(1)] || 'application/octet-stream';
    await pool.query('INSERT INTO user_photos (filename, user_id, mime, data) VALUES (?, ?, ?, ?)', [
      filename,
      userId,
      mime,
      buffer,
    ]);
  } else {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  }
  return PUBLIC_PREFIX + filename;
}

/// Apaga uma foto pela URL pública. path.basename impede que um valor estranho
/// no banco aponte para fora da pasta de fotos. Nunca lança erro.
async function removePhoto(photoUrl) {
  if (!photoUrl || !photoUrl.startsWith(PUBLIC_PREFIX)) return;
  const filename = path.basename(photoUrl);
  try {
    if (storesInDatabase()) await pool.query('DELETE FROM user_photos WHERE filename = ?', [filename]);
    await fs.unlink(path.join(UPLOAD_DIR, filename));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Não foi possível apagar a foto antiga:', err.message);
  }
}

/// Middleware de GET /uploads/avatars/:file quando as fotos estão no banco.
/// Se não achar, segue para os arquivos do disco (fotos antigas) e depois o 404.
async function servePhotoFromDatabase(req, res, next) {
  if (!storesInDatabase()) return next();
  try {
    const [rows] = await pool.query('SELECT mime, data FROM user_photos WHERE filename = ?', [
      path.basename(req.params.file),
    ]);
    if (rows.length === 0) return next();
    res.set({
      'Content-Type': rows[0].mime,
      'X-Content-Type-Options': 'nosniff',
      // O nome do arquivo muda a cada envio, então pode ficar em cache para sempre.
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    return res.send(rows[0].data);
  } catch (err) {
    return next(err);
  }
}

module.exports = { savePhoto, removePhoto, servePhotoFromDatabase };
