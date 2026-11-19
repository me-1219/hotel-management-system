const express = require('express');
const { getRoomTypes, createRoomType } = require('../controllers/roomTypeController');
const { protect, allowRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/', getRoomTypes);
router.post('/', allowRoles('manager'), createRoomType);

module.exports = router;
