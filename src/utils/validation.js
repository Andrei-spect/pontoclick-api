/// Validações e normalizações compartilhadas pelos controllers.

const LIMITS = {
  name: 150, // users.name VARCHAR(150)
  email: 150, // users.email VARCHAR(150)
  phone: 20, // users.phone VARCHAR(20)
  role: 100, // users.role VARCHAR(100)
  company: 150, // users.company VARCHAR(150)
  passwordMin: 6,
  passwordMax: 128, // bcrypt ignora o que passa de 72 bytes; 128 dá folga e evita abuso
};

/// E-mail sempre sem espaços e em minúsculas, para não existir "Joao@x.com" e "joao@x.com".
function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= LIMITS.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/// Texto opcional: aparas nas pontas; vazio vira null. Não aceita objetos/arrays.
function optionalText(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/// Mensagem de erro se a senha não for aceitável; null se estiver ok.
function passwordError(value, label = 'A senha') {
  if (typeof value !== 'string' || value.length < LIMITS.passwordMin) {
    return `${label} deve ter pelo menos ${LIMITS.passwordMin} caracteres.`;
  }
  if (value.length > LIMITS.passwordMax) {
    return `${label} deve ter no máximo ${LIMITS.passwordMax} caracteres.`;
  }
  return null;
}

/// Mensagem de erro se algum campo de texto passar do tamanho da coluna; null se estiver ok.
function lengthError(fields) {
  const labels = { name: 'O nome', phone: 'O celular', role: 'O cargo', company: 'A empresa', email: 'O e-mail' };
  for (const [key, value] of Object.entries(fields)) {
    if (value && LIMITS[key] && value.length > LIMITS[key]) {
      return `${labels[key] || key} deve ter no máximo ${LIMITS[key]} caracteres.`;
    }
  }
  return null;
}

module.exports = { LIMITS, normalizeEmail, isValidEmail, optionalText, passwordError, lengthError };
