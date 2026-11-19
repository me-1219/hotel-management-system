const bcrypt = require('bcryptjs');
const pool = require('../db');

const ROLES = ['manager', 'receptionist', 'kitchen', 'housekeeping'];
const USER_FIELDS = 'id, full_name, email, role, is_active, created_at';

exports.getUsers = async (req, res) => {
  const { role, active } = req.query;

  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of: ${ROLES.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `SELECT ${USER_FIELDS} FROM users
       WHERE ($1::text IS NULL OR role = $1)
         AND ($2::boolean IS NULL OR is_active = $2)
       ORDER BY is_active DESC, full_name`,
      [role || null, active === undefined ? null : active === 'true']
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load users' });
  }
};

exports.updateUser = async (req, res) => {
  const { full_name, role } = req.body;
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }
  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of: ${ROLES.join(', ')}` });
  }
  if (full_name !== undefined && !String(full_name).trim()) {
    return res.status(400).json({ message: 'full_name cannot be empty' });
  }
  if (role !== undefined && id === req.user.id) {
    return res.status(400).json({ message: 'You cannot change your own role' });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           role = COALESCE($2, role)
       WHERE id = $3
       RETURNING ${USER_FIELDS}`,
      [full_name ? String(full_name).trim() : null, role || null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update user' });
  }
};

exports.setUserActive = async (req, res) => {
  const { is_active } = req.body;
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ message: 'is_active must be true or false' });
  }
  if (id === req.user.id) {
    return res.status(400).json({ message: 'You cannot disable your own account' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET is_active = $1 WHERE id = $2 RETURNING ${USER_FIELDS}`,
      [is_active, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update user' });
  }
};

exports.resetPassword = async (req, res) => {
  const { new_password } = req.body;
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ message: 'new_password must be at least 6 characters' });
  }

  try {
    const password_hash = await bcrypt.hash(String(new_password), 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
      [password_hash, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to reset password' });
  }
};
