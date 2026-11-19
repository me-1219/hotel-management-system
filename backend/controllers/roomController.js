const pool = require('../db');

const ROOM_SELECT = `
  SELECT r.id, r.room_number, r.floor, r.status, r.notes,
         t.name AS room_type, t.price_per_night, t.capacity
  FROM rooms r
  JOIN room_types t ON t.id = r.room_type_id
`;

exports.getRooms = async (req, res) => {
  try {
    const result = await pool.query(`${ROOM_SELECT} ORDER BY r.room_number`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load rooms' });
  }
};

exports.getRoomById = async (req, res) => {
  try {
    const result = await pool.query(`${ROOM_SELECT} WHERE r.id = $1`, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load room' });
  }
};

const VALID_STATUS = ['available', 'booked', 'occupied', 'cleaning', 'out_of_service'];

exports.createRoom = async (req, res) => {
  const { room_number, floor, room_type_id, notes } = req.body;

  if (!room_number || floor === undefined || !room_type_id) {
    return res.status(400).json({ message: 'room_number, floor and room_type_id are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO rooms (room_number, floor, room_type_id, notes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [room_number, floor, room_type_id, notes || null]
    );
    const room = await pool.query(`${ROOM_SELECT} WHERE r.id = $1`, [result.rows[0].id]);
    res.status(201).json(room.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Room number already exists' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ message: 'Room type does not exist' });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to create room' });
  }
};

exports.updateRoom = async (req, res) => {
  const { room_number, floor, room_type_id, notes } = req.body;

  try {
    const result = await pool.query(
      `UPDATE rooms
       SET room_number = COALESCE($1, room_number),
           floor = COALESCE($2, floor),
           room_type_id = COALESCE($3, room_type_id),
           notes = COALESCE($4, notes)
       WHERE id = $5 RETURNING id`,
      [room_number, floor, room_type_id, notes, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }
    const room = await pool.query(`${ROOM_SELECT} WHERE r.id = $1`, [req.params.id]);
    res.json(room.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Room number already exists' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ message: 'Room type does not exist' });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to update room' });
  }
};

exports.updateRoomStatus = async (req, res) => {
  const { status } = req.body;

  if (!VALID_STATUS.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${VALID_STATUS.join(', ')}` });
  }

  try {
    const result = await pool.query(
      'UPDATE rooms SET status = $1 WHERE id = $2 RETURNING id',
      [status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }
    const room = await pool.query(`${ROOM_SELECT} WHERE r.id = $1`, [req.params.id]);
    res.json(room.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update status' });
  }
};
