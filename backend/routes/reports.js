const express = require('express');
const { getDashboard, getIncomeReport } = require('../controllers/reportController');
const { protect, allowRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/dashboard', allowRoles('manager', 'receptionist'), getDashboard);
router.get('/income', allowRoles('manager'), getIncomeReport);

module.exports = router;
