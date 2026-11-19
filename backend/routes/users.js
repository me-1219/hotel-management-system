const express = require('express');
const {
  getUsers,
  updateUser,
  setUserActive,
  resetPassword,
} = require('../controllers/userController');
const { protect, allowRoles } = require('../middleware/auth');

const router = express.Router();

router.use(protect, allowRoles('manager'));

router.get('/', getUsers);
router.put('/:id', updateUser);
router.patch('/:id/active', setUserActive);
router.patch('/:id/password', resetPassword);

module.exports = router;
