const express = require('express');
const {
  getMenu,
  createCategory,
  createItem,
  updateItem,
  setItemAvailability,
} = require('../controllers/menuController');
const { protect, allowRoles } = require('../middleware/auth');

const router = express.Router();

// public: guests open this from the QR code
router.get('/', getMenu);

// staff only
router.post('/categories', protect, allowRoles('manager'), createCategory);
router.post('/items', protect, allowRoles('manager'), createItem);
router.put('/items/:id', protect, allowRoles('manager'), updateItem);
router.patch('/items/:id/availability', protect, allowRoles('manager', 'kitchen'), setItemAvailability);

module.exports = router;
