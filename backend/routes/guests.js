const express = require('express');
const {
  getGuests,
  getGuestById,
  createGuest,
  updateGuest,
} = require('../controllers/guestController');
const { protect, allowRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect, allowRoles('manager', 'receptionist'));

router.get('/', getGuests);
router.get('/:id', getGuestById);
router.post('/', createGuest);
router.put('/:id', updateGuest);

module.exports = router;
