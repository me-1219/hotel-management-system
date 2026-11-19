const express = require('express');
const { register, login, getMe } = require('../controllers/authController');
const { protect, allowRoles } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/login', loginLimiter, login);
router.post('/register', protect, allowRoles('manager'), register);
router.get('/me', protect, getMe);

module.exports = router;
