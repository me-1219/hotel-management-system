const express = require('express');
const {
  getAvailableRooms,
  createBooking,
  getBookings,
  cancelBooking,
  checkInBooking,
  checkOutBooking,
} = require('../controllers/bookingController');
const { getBill, addCharge, addPayment } = require('../controllers/billController');
const { protect, allowRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect, allowRoles('manager', 'receptionist'));

router.get('/availability', getAvailableRooms);
router.get('/', getBookings);
router.post('/', createBooking);
router.patch('/:id/cancel', cancelBooking);
router.patch('/:id/check-in', checkInBooking);
router.patch('/:id/check-out', checkOutBooking);

router.get('/:id/bill', getBill);
router.post('/:id/charges', addCharge);
router.post('/:id/payments', addPayment);

module.exports = router;
