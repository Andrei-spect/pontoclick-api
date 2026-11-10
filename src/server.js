require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const recordsRoutes = require('./routes/recordsRoutes');
const supportRoutes = require('./routes/supportRoutes');
const locationsRoutes = require('./routes/locationsRoutes');
const { ensureSchema } = require('./config/migrations');

const app = express();

// Atrás de um proxy/hospedagem (Render, Railway, Nginx...), defina TRUST_PROXY=1 no .env
// para o limite de tentativas enxergar o IP real de quem acessa.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

// Cabeçalhos de segurança. "cross-origin" permite que o app web (outra porta/domínio)
// mostre as fotos servidas em /uploads.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS: por padrão aceita qualquer origem (o app de celular não envia origem).
// Em produção, limite o app web com CORS_ORIGINS=https://app.seudominio.com.br (separe várias por vírgula).
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));

// Corpo JSON de até 100 KB (as fotos vão por multipart, com limite próprio de 5 MB).
app.use(express.json({ limit: '100kb' }));

// Fotos de perfil enviadas pelos usuários (pasta "uploads" na raiz do projeto).
// "nosniff" impede o navegador de tentar interpretar a imagem como outra coisa.
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'), {
    setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
  })
);

// Rota de teste — útil para confirmar que a API está no ar.
app.get('/', (req, res) => {
  res.json({ message: 'API do PontoClick está rodando 🚀' });
});

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/records', recordsRoutes);
app.use('/support', supportRoutes);
app.use('/locations', locationsRoutes);

// Rota inexistente: responde em JSON, no mesmo formato dos outros erros.
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// Erros não tratados (ex: JSON malformado, corpo grande demais): sempre em JSON, sem detalhes internos.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'O corpo da requisição não é um JSON válido.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'O corpo da requisição é grande demais.' });
  }
  console.error('Erro não tratado:', err);
  return res.status(err.status || 500).json({ error: 'Erro interno no servidor.' });
});

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('Aviso: JWT_SECRET ausente ou curto (menos de 32 caracteres). Gere uma chave longa e aleatória no .env.');
}

const PORT = process.env.PORT || 3000;

// Garante que o banco tem as colunas/índices novos antes de aceitar pedidos.
// Se o banco estiver fora do ar, avisa e sobe mesmo assim (como antes).
ensureSchema()
  .catch((err) => console.error('Aviso: não foi possível verificar o banco:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  });
