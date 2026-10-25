const multer = require('multer');

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// A imagem fica só na memória; quem grava em disco (depois de validar) é o controller.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
});

/// Recebe uma imagem no campo "photo" (multipart/form-data) e a deixa em req.file.
function receiveAvatar(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'A imagem deve ter no máximo 5 MB.' });
      }
      return res.status(400).json({ error: 'Não foi possível ler a imagem enviada.' });
    }

    console.error('Erro no upload:', err);
    return res.status(500).json({ error: 'Erro interno ao receber a imagem.' });
  });
}

module.exports = { receiveAvatar, MAX_SIZE_BYTES };
