const pool = require('../db');

const CATEGORIES = ['laundry', 'minibar', 'extra_bed', 'restaurant', 'other'];
const METHODS = ['cash', 'bank_transfer', 'mobile_money'];

const round = (n) => Math.round(n * 100) / 100;

const loadBill = async (bookingId) => {
  const found = await pool.query(
    `SELECT b.id, b.status, b.check_in, b.check_out, b.total_price,
            g.full_name AS guest_name, r.room_number
     FROM bookings b
     JOIN guests g ON g.id = b.guest_id
     JOIN rooms r ON r.id = b.room_id
     WHERE b.id = $1`,
    [bookingId]
  );
  const booking = found.rows[0];
  if (!booking) return null;

  const charges = await pool.query(
    `SELECT id, category, description, amount, created_at
     FROM charges WHERE booking_id = $1 ORDER BY created_at`,
    [bookingId]
  );
  const payments = await pool.query(
    `SELECT id, amount, method, created_at
     FROM payments WHERE booking_id = $1 ORDER BY created_at`,
    [bookingId]
  );

  const roomCharge = Number(booking.total_price);
  const chargesTotal = charges.rows.reduce((sum, c) => sum + Number(c.amount), 0);
  const paidTotal = payments.rows.reduce((sum, p) => sum + Number(p.amount), 0);
  const total = roomCharge + chargesTotal;

  return {
    booking,
    room_charge: round(roomCharge),
    charges: charges.rows,
    charges_total: round(chargesTotal),
    total: round(total),
    payments: payments.rows,
    paid_total: round(paidTotal),
    balance: round(total - paidTotal),
  };
};

exports.getBill = async (req, res) => {
  try {
    const bill = await loadBill(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Booking not found' });
    res.json(bill);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load bill' });
  }
};

exports.addCharge = async (req, res) => {
  const { category, description, amount } = req.body;

  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ message: `category must be one of: ${CATEGORIES.join(', ')}` });
  }
  if (!description || !(Number(amount) > 0)) {
    return res.status(400).json({ message: 'description and a positive amount are required' });
  }

  try {
    const found = await pool.query('SELECT status FROM bookings WHERE id = $1', [req.params.id]);
    if (!found.rows[0]) return res.status(404).json({ message: 'Booking not found' });
    if (found.rows[0].status !== 'checked_in') {
      return res.status(400).json({ message: 'Charges can only be added while the guest is checked in' });
    }

    await pool.query(
      `INSERT INTO charges (booking_id, category, description, amount, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, category, description, amount, req.user.id]
    );

    res.status(201).json(await loadBill(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to add charge' });
  }
};

exports.addPayment = async (req, res) => {
  const { amount, method } = req.body;

  if (!METHODS.includes(method)) {
    return res.status(400).json({ message: `method must be one of: ${METHODS.join(', ')}` });
  }
  if (!(Number(amount) > 0)) {
    return res.status(400).json({ message: 'A positive amount is required' });
  }

  try {
    const bill = await loadBill(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Booking not found' });
    if (bill.booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Booking is cancelled' });
    }
    if (Number(amount) > bill.balance) {
      return res.status(400).json({ message: `Payment is more than the balance (${bill.balance})` });
    }

    await pool.query(
      `INSERT INTO payments (booking_id, amount, method, created_by)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, amount, method, req.user.id]
    );

    res.status(201).json(await loadBill(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to add payment' });
  }
};
