const { verifyToken } = require('../utils/jwt');
const pool = require('../config/database');

/// Middleware que protege rotas privadas.
/// O app Flutter deve enviar o token no header:
///   Authorization: Bearer <token>
///
/// Além da assinatura e da validade, confere no banco se o usuário ainda existe
/// e se a versão do token (tv) é a atual — senha trocada = sessões antigas encerradas.
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  let decoded;
  try {
    decoded = verifyToken(authHeader.slice('Bearer '.length).trim());
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }

  try {
    const [rows] = await pool.query('SELECT token_version FROM users WHERE id = ?', [decoded.userId]);
    // Tokens emitidos antes desta checagem não têm "tv": valem como versão 0.
    if (rows.length === 0 || Number(rows[0].token_version) !== Number(decoded.tv ?? 0)) {
      return res.status(401).json({ error: 'Sua sessão foi encerrada. Faça login novamente.' });
    }
  } catch (err) {
    console.error('Erro em authMiddleware:', err);
    return res.status(500).json({ error: 'Erro interno ao validar a sessão.' });
  }

  req.userId = decoded.userId;
  next();
}

module.exports = authMiddleware;
