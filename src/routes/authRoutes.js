const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const { forgotPassword, resetPassword } = require('../controllers/passwordResetController');
const { loginLimiter, registerLimiter, passwordResetLimiter } = require('../middleware/rateLimiters');

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);

module.exports = router;
