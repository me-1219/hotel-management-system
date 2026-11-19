const pool = require('../db');

exports.getRoomTypes = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM room_types ORDER BY price_per_night');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load room types' });
  }
};

exports.createRoomType = async (req, res) => {
  const { name, description, price_per_night, capacity } = req.body;

  if (!name || price_per_night === undefined) {
    return res.status(400).json({ message: 'name and price_per_night are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO room_types (name, description, price_per_night, capacity)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description || null, price_per_night, capacity || 2]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Room type name already exists' });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to create room type' });
  }
};
