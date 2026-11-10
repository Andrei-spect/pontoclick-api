const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { createSupportMessage } = require('../controllers/supportController');

// Só usuários logados enviam mensagens (o suporte precisa saber quem é para responder).
router.use(authMiddleware);

router.post('/', createSupportMessage);

module.exports = router;
