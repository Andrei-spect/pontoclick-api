const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { receiveAvatar } = require('../middleware/uploadMiddleware');
const { getMe, updateMe, changePassword, uploadPhoto, deletePhoto } = require('../controllers/userController');

// Todas as rotas de /users exigem login (token JWT no header Authorization).
// O login é checado ANTES de receber qualquer arquivo.
router.use(authMiddleware);

router.get('/me', getMe);
router.put('/me', updateMe);
router.put('/change-password', changePassword);
router.post('/me/photo', receiveAvatar, uploadPhoto);
router.delete('/me/photo', deletePhoto);

module.exports = router;
