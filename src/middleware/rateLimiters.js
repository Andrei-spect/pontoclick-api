const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

/// Limites de requisições por IP (guardados em memória: zeram quando a API reinicia).
/// A resposta segue o padrão da API: { "error": "..." } com status 429.
function limiter({ windowMinutes, max, message, keyByEmail = false, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests,
    // No login, a chave é IP + e-mail: errar a senha de uma conta não bloqueia
    // outras pessoas que usam a mesma rede (ex: Wi-Fi da empresa).
    keyGenerator: keyByEmail
      ? (req) => `${ipKeyGenerator(req.ip)}|${String((req.body || {}).email || '').trim().toLowerCase()}`
      : (req) => ipKeyGenerator(req.ip),
    handler: (req, res) => res.status(429).json({ error: message }),
  });
}

/// POST /auth/login — 10 tentativas ERRADAS a cada 15 min por IP + e-mail (acertos não contam).
const loginLimiter = limiter({
  windowMinutes: 15,
  max: 10,
  keyByEmail: true,
  skipSuccessfulRequests: true,
  message: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.',
});

/// POST /auth/register — 5 contas por hora por IP.
const registerLimiter = limiter({
  windowMinutes: 60,
  max: 5,
  message: 'Muitos cadastros feitos a partir desta rede. Tente novamente mais tarde.',
});

/// POST /auth/forgot-password e /auth/reset-password — complementa os limites por conta do controller.
const passwordResetLimiter = limiter({
  windowMinutes: 15,
  max: 20,
  message: 'Muitas tentativas de recuperação de senha. Aguarde 15 minutos e tente novamente.',
});

/// DELETE /users/me — confirmação por senha: 5 tentativas a cada 15 min por IP.
const accountDeletionLimiter = limiter({
  windowMinutes: 15,
  max: 5,
  message: 'Muitas tentativas de excluir a conta. Aguarde 15 minutos e tente novamente.',
});

module.exports = { loginLimiter, registerLimiter, passwordResetLimiter, accountDeletionLimiter };
