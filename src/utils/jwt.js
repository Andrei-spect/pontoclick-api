const jwt = require('jsonwebtoken');

/// Gera o token de sessão. O payload leva:
///   userId — dono da sessão
///   tv     — "token version" (users.token_version). Trocar ou redefinir a senha
///            incrementa a versão no banco e todos os tokens antigos deixam de valer.
function generateToken({ userId, tokenVersion = 0 }) {
  return jwt.sign({ userId, tv: tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    algorithm: 'HS256',
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

module.exports = { generateToken, verifyToken };
