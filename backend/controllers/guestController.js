const pool = require('../db');

exports.getGuests = async (req, res) => {
  const search = req.query.search ? `%${req.query.search}%` : '%';

  try {
    const result = await pool.query(
      `SELECT * FROM guests
       WHERE full_name ILIKE $1 OR phone ILIKE $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [search]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load guests' });
  }
};

exports.getGuestById = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM guests WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Guest not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load guest' });
  }
};

exports.createGuest = async (req, res) => {
  const { full_name, phone, email, id_number } = req.body;

  if (!full_name || !phone) {
    return res.status(400).json({ message: 'full_name and phone are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO guests (full_name, phone, email, id_number)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [full_name, phone, email || null, id_number || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create guest' });
  }
};

exports.updateGuest = async (req, res) => {
  const { full_name, phone, email, id_number } = req.body;

  try {
    const result = await pool.query(
      `UPDATE guests
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           email = COALESCE($3, email),
           id_number = COALESCE($4, id_number)
       WHERE id = $5 RETURNING *`,
      [full_name, phone, email, id_number, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Guest not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update guest' });
  }
};
