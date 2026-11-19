const pool = require('../db');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const BOOKING_STATUS = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];

const BOOKING_SELECT = `
  SELECT b.id, b.check_in, b.check_out, b.num_guests, b.status, b.total_price, b.notes,
         g.id AS guest_id, g.full_name AS guest_name, g.phone AS guest_phone,
         r.id AS room_id, r.room_number, t.name AS room_type
  FROM bookings b
  JOIN guests g ON g.id = b.guest_id
  JOIN rooms r ON r.id = b.room_id
  JOIN room_types t ON t.id = r.room_type_id
`;

exports.getAvailableRooms = async (req, res) => {
  const { check_in, check_out } = req.query;

  if (!DATE_REGEX.test(check_in || '') || !DATE_REGEX.test(check_out || '')) {
    return res.status(400).json({ message: 'check_in and check_out are required (YYYY-MM-DD)' });
  }
  if (check_out <= check_in) {
    return res.status(400).json({ message: 'check_out must be after check_in' });
  }

  try {
    const result = await pool.query(
      `SELECT r.id, r.room_number, r.floor, t.name AS room_type,
              t.price_per_night, t.capacity
       FROM rooms r
       JOIN room_types t ON t.id = r.room_type_id
       WHERE r.status <> 'out_of_service'
         AND NOT EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.room_id = r.id
             AND b.status NOT IN ('cancelled', 'checked_out')
             AND daterange(b.check_in, b.check_out) && daterange($1::date, $2::date)
         )
       ORDER BY r.room_number`,
      [check_in, check_out]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to check availability' });
  }
};

exports.createBooking = async (req, res) => {
  const { guest_id, room_id, check_in, check_out, num_guests = 1, notes } = req.body;

  if (!guest_id || !room_id || !check_in || !check_out) {
    return res.status(400).json({ message: 'guest_id, room_id, check_in and check_out are required' });
  }
  if (!DATE_REGEX.test(check_in) || !DATE_REGEX.test(check_out)) {
    return res.status(400).json({ message: 'Dates must be in YYYY-MM-DD format' });
  }
  if (check_out <= check_in) {
    return res.status(400).json({ message: 'check_out must be after check_in' });
  }
  if (check_in < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ message: 'check_in cannot be in the past' });
  }

  try {
    const roomResult = await pool.query(
      `SELECT r.status, t.price_per_night, t.capacity
       FROM rooms r JOIN room_types t ON t.id = r.room_type_id
       WHERE r.id = $1`,
      [room_id]
    );
    const room = roomResult.rows[0];

    if (!room) {
      return res.status(400).json({ message: 'Room does not exist' });
    }
    if (room.status === 'out_of_service') {
      return res.status(400).json({ message: 'Room is out of service' });
    }
    if (num_guests > room.capacity) {
      return res.status(400).json({ message: `This room holds at most ${room.capacity} guests` });
    }

    const nights = Math.round((new Date(check_out) - new Date(check_in)) / 86400000);
    const total_price = nights * Number(room.price_per_night);

    const result = await pool.query(
      `INSERT INTO bookings
         (guest_id, room_id, check_in, check_out, num_guests, total_price, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [guest_id, room_id, check_in, check_out, num_guests, total_price, notes || null, req.user.id]
    );

    const booking = await pool.query(`${BOOKING_SELECT} WHERE b.id = $1`, [result.rows[0].id]);
    res.status(201).json(booking.rows[0]);
  } catch (err) {
    if (err.code === '23P01') {
      return res.status(409).json({ message: 'Room is already booked for these dates' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ message: 'Guest or room does not exist' });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to create booking' });
  }
};

exports.getBookings = async (req, res) => {
  const { status } = req.query;

  if (status && !BOOKING_STATUS.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${BOOKING_STATUS.join(', ')}` });
  }

  try {
    const result = status
      ? await pool.query(`${BOOKING_SELECT} WHERE b.status = $1 ORDER BY b.check_in DESC LIMIT 100`, [status])
      : await pool.query(`${BOOKING_SELECT} ORDER BY b.check_in DESC LIMIT 100`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load bookings' });
  }
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

const transition = ({ allowedFrom, newStatus, roomMustBe, newRoomStatus, mustBePaid }) => async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const found = await client.query(
      'SELECT id, room_id, status FROM bookings WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    const booking = found.rows[0];

    if (!booking) throw httpError(404, 'Booking not found');
    if (!allowedFrom.includes(booking.status)) {
      throw httpError(400, `Booking is ${booking.status}, this action is not allowed`);
    }

    if (roomMustBe) {
      const roomResult = await client.query(
        'SELECT status FROM rooms WHERE id = $1 FOR UPDATE',
        [booking.room_id]
      );
      if (!roomMustBe.includes(roomResult.rows[0].status)) {
        throw httpError(400, `Room is ${roomResult.rows[0].status}, it must be ${roomMustBe.join(' or ')}`);
      }
    }
        if (mustBePaid) {
      const balanceResult = await client.query(
        `SELECT b.total_price
                + COALESCE((SELECT SUM(amount) FROM charges WHERE booking_id = b.id), 0)
                - COALESCE((SELECT SUM(amount) FROM payments WHERE booking_id = b.id), 0)
                AS balance
         FROM bookings b WHERE b.id = $1`,
        [booking.id]
      );
      const balance = Math.round(Number(balanceResult.rows[0].balance) * 100) / 100;
      if (balance > 0) {
        throw httpError(400, `Unpaid balance: ${balance} ETB. Record the payment before check-out`);
      }
    }
    await client.query('UPDATE bookings SET status = $1 WHERE id = $2', [newStatus, booking.id]);

    if (newRoomStatus) {
      await client.query('UPDATE rooms SET status = $1 WHERE id = $2', [newRoomStatus, booking.room_id]);
    }

    await client.query('COMMIT');

    const result = await pool.query(`${BOOKING_SELECT} WHERE b.id = $1`, [booking.id]);
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to update booking' });
  } finally {
    client.release();
  }
};

exports.cancelBooking = transition({
  allowedFrom: ['pending', 'confirmed'],
  newStatus: 'cancelled',
});

exports.checkInBooking = transition({
  allowedFrom: ['confirmed'],
  newStatus: 'checked_in',
  roomMustBe: ['available'],
  newRoomStatus: 'occupied',
});

exports.checkOutBooking = transition({
  allowedFrom: ['checked_in'],
  newStatus: 'checked_out',
  newRoomStatus: 'cleaning',
  mustBePaid: true,
});
