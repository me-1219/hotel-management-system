const express = require('express');
const {
  getRooms,
  getRoomById,
  createRoom,
  updateRoom,
  updateRoomStatus,
} = require('../controllers/roomController');
const { protect, allowRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/', getRooms);
router.get('/:id', getRoomById);
router.post('/', allowRoles('manager'), createRoom);
router.put('/:id', allowRoles('manager'), updateRoom);
router.patch('/:id/status', allowRoles('manager', 'receptionist', 'housekeeping'), updateRoomStatus);

module.exports = router;
