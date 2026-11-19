const express = require('express');
const {
  createOrder,
  getRoomOrders,
  getOrders,
  updateOrderStatus,
} = require('../controllers/orderController');
const { protect, allowRoles } = require('../middleware/auth');

const router = express.Router();

// public: guest from the QR code
router.post('/', createOrder);
router.get('/room/:token', getRoomOrders);

// staff only
router.get('/', protect, allowRoles('manager', 'kitchen', 'receptionist'), getOrders);
router.patch('/:id/status', protect, allowRoles('manager', 'kitchen', 'receptionist'), updateOrderStatus);

module.exports = router;
