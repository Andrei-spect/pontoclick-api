require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const { ensureSchema } = require('./config/migrations');

const app = express();

app.use(cors());
app.use(express.json());

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

const PORT = process.env.PORT || 3000;

// Garante que o banco tem a coluna da foto antes de aceitar pedidos.
// Se o banco estiver fora do ar, avisa e sobe mesmo assim (como antes).
ensureSchema()
  .catch((err) => console.error('Aviso: não foi possível verificar o banco:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  });
