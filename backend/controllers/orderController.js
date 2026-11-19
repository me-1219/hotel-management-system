const pool = require('../db');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_STATUS = ['new', 'preparing', 'ready', 'delivered', 'cancelled'];
const NEXT_STATUS = {
  new: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered'],
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

// public: guest orders from the QR code
exports.createOrder = async (req, res) => {
  const { room_token, items, notes } = req.body;

  if (!UUID_REGEX.test(room_token || '')) {
    return res.status(400).json({ message: 'Invalid room code' });
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    return res.status(400).json({ message: 'items must be a list of 1 to 20 items' });
  }

  const wanted = {};
  for (const it of items) {
    const id = Number(it.menu_item_id);
    const qty = Number(it.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 20) {
      return res.status(400).json({ message: 'Each item needs menu_item_id and quantity (1 to 20)' });
    }
    wanted[id] = (wanted[id] || 0) + qty;
  }
  const ids = Object.keys(wanted).map(Number);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const roomResult = await client.query('SELECT id FROM rooms WHERE qr_token = $1', [room_token]);
    const room = roomResult.rows[0];
    if (!room) throw httpError(404, 'Room code not found');

    const stayResult = await client.query(
      `SELECT id FROM bookings WHERE room_id = $1 AND status = 'checked_in'`,
      [room.id]
    );
    const stay = stayResult.rows[0];
    if (!stay) throw httpError(400, 'Orders are only accepted for rooms with a checked-in guest');

    const menuResult = await client.query(
      'SELECT id, name, price, is_available FROM menu_items WHERE id = ANY($1::int[])',
      [ids]
    );
    if (menuResult.rows.length !== ids.length) {
      throw httpError(400, 'One or more items do not exist');
    }
    const soldOut = menuResult.rows.filter((m) => !m.is_available);
    if (soldOut.length > 0) {
      throw httpError(400, `Sold out: ${soldOut.map((m) => m.name).join(', ')}`);
    }

    const lines = menuResult.rows.map((m) => ({
      menu_item_id: m.id,
      name: m.name,
      unit_price: Number(m.price),
      quantity: wanted[m.id],
    }));
    const total = Math.round(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0) * 100) / 100;

    const orderResult = await client.query(
      `INSERT INTO orders (booking_id, room_id, notes, total)
       VALUES ($1, $2, $3, $4) RETURNING id, status, total, created_at`,
      [stay.id, room.id, notes ? String(notes).slice(0, 200) : null, total]
    );
    const order = orderResult.rows[0];

    for (const l of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, name, unit_price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, l.menu_item_id, l.name, l.unit_price, l.quantity]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...order, total: Number(order.total), items: lines });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to create order' });
  } finally {
    client.release();
  }
};

// staff: kitchen screen
exports.getOrders = async (req, res) => {
  const { status } = req.query;

  if (status && !ORDER_STATUS.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${ORDER_STATUS.join(', ')}` });
  }
  const statuses = status ? [status] : ['new', 'preparing', 'ready'];

  try {
    const result = await pool.query(
      `SELECT o.id, o.status, o.notes, o.total, o.created_at, r.room_number,
              json_agg(
                json_build_object('name', oi.name, 'quantity', oi.quantity, 'unit_price', oi.unit_price)
                ORDER BY oi.id
              ) AS items
       FROM orders o
       JOIN rooms r ON r.id = o.room_id
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status = ANY($1::text[])
       GROUP BY o.id, r.room_number
       ORDER BY o.created_at`,
      [statuses]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load orders' });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const { status } = req.body || {};

  if (!ORDER_STATUS.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${ORDER_STATUS.join(', ')}` });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const found = await client.query(
      'SELECT id, booking_id, status, total FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    const order = found.rows[0];

    if (!order) throw httpError(404, 'Order not found');

    const allowed = NEXT_STATUS[order.status] || [];
    if (!allowed.includes(status)) {
      throw httpError(400, `Cannot change order from ${order.status} to ${status}`);
    }

    await client.query('UPDATE orders SET status = $1 WHERE id = $2', [status, order.id]);

    if (status === 'delivered') {
      await client.query(
        `INSERT INTO charges (booking_id, category, description, amount, order_id, created_by)
         VALUES ($1, 'restaurant', $2, $3, $4, $5)`,
        [order.booking_id, `Restaurant order #${order.id}`, order.total, order.id, req.user.id]
      );
    }

    await client.query('COMMIT');
    res.json({ id: order.id, status });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to update order' });
  } finally {
    client.release();
  }
};
