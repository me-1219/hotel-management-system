const pool = require('../db');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TZ = 'Africa/Addis_Ababa';
const TODAY = `(NOW() AT TIME ZONE '${TZ}')::date`;

const round = (n) => Math.round(Number(n) * 100) / 100;

exports.getDashboard = async (req, res) => {
  try {
    const [roomsResult, bookingsResult, ordersResult, incomeResult] = await Promise.all([
      pool.query('SELECT status, COUNT(*)::int AS count FROM rooms GROUP BY status'),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE check_in = ${TODAY} AND status IN ('confirmed', 'checked_in'))::int AS arrivals_today,
          COUNT(*) FILTER (WHERE check_in = ${TODAY} AND status = 'confirmed')::int AS arrivals_waiting,
          COUNT(*) FILTER (WHERE check_out = ${TODAY} AND status IN ('checked_in', 'checked_out'))::int AS departures_today,
          COUNT(*) FILTER (WHERE check_out = ${TODAY} AND status = 'checked_in')::int AS departures_waiting,
          COUNT(*) FILTER (WHERE status = 'checked_in')::int AS in_house
        FROM bookings
      `),
      pool.query(`
        SELECT status, COUNT(*)::int AS count FROM orders
        WHERE status IN ('new', 'preparing', 'ready') GROUP BY status
      `),
      pool.query(`
        SELECT COALESCE(SUM(amount), 0) AS total FROM payments
        WHERE (created_at AT TIME ZONE '${TZ}')::date = ${TODAY}
      `),
    ]);

    const rooms = { available: 0, booked: 0, occupied: 0, cleaning: 0, out_of_service: 0 };
    for (const r of roomsResult.rows) rooms[r.status] = r.count;
    const totalRooms = Object.values(rooms).reduce((a, b) => a + b, 0);
    const usableRooms = totalRooms - rooms.out_of_service;

    const orders = { new: 0, preparing: 0, ready: 0 };
    for (const o of ordersResult.rows) orders[o.status] = o.count;

    res.json({
      rooms: {
        total: totalRooms,
        ...rooms,
        occupancy_rate: usableRooms > 0 ? Math.round((rooms.occupied / usableRooms) * 1000) / 10 : 0,
      },
      bookings: bookingsResult.rows[0],
      orders,
      income_today: round(incomeResult.rows[0].total),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load dashboard' });
  }
};

exports.getIncomeReport = async (req, res) => {
  const { from, to } = req.query;

  if (!DATE_REGEX.test(from || '') || !DATE_REGEX.test(to || '')) {
    return res.status(400).json({ message: 'from and to are required (YYYY-MM-DD)' });
  }
  if (to < from) {
    return res.status(400).json({ message: 'to must be the same day or after from' });
  }
  if ((new Date(to) - new Date(from)) / 86400000 > 366) {
    return res.status(400).json({ message: 'The date range cannot be longer than one year' });
  }

  try {
    const [roomsResult, chargesResult, paymentsResult] = await Promise.all([
      pool.query(
        `SELECT check_out::text AS day, SUM(total_price) AS amount
         FROM bookings
         WHERE status = 'checked_out' AND check_out BETWEEN $1 AND $2
         GROUP BY check_out`,
        [from, to]
      ),
      pool.query(
        `SELECT b.check_out::text AS day, c.category, SUM(c.amount) AS amount
         FROM charges c
         JOIN bookings b ON b.id = c.booking_id
         WHERE b.status = 'checked_out' AND b.check_out BETWEEN $1 AND $2
         GROUP BY b.check_out, c.category`,
        [from, to]
      ),
      pool.query(
        `SELECT method, SUM(amount) AS amount
         FROM payments
         WHERE (created_at AT TIME ZONE '${TZ}')::date BETWEEN $1 AND $2
         GROUP BY method
         ORDER BY method`,
        [from, to]
      ),
    ]);

    const daily = {};
    const dayRow = (day) => {
      if (!daily[day]) daily[day] = { day, rooms: 0, restaurant: 0, other: 0 };
      return daily[day];
    };

    for (const r of roomsResult.rows) dayRow(r.day).rooms += Number(r.amount);
    for (const c of chargesResult.rows) {
      const key = c.category === 'restaurant' ? 'restaurant' : 'other';
      dayRow(c.day)[key] += Number(c.amount);
    }

    const days = Object.values(daily)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({
        day: d.day,
        rooms: round(d.rooms),
        restaurant: round(d.restaurant),
        other: round(d.other),
        total: round(d.rooms + d.restaurant + d.other),
      }));

    const sum = (key) => round(days.reduce((s, d) => s + d[key], 0));
    const paymentsByMethod = paymentsResult.rows.map((p) => ({
      method: p.method,
      amount: round(p.amount),
    }));

    res.json({
      from,
      to,
      rooms_revenue: sum('rooms'),
      restaurant_revenue: sum('restaurant'),
      other_revenue: sum('other'),
      total_revenue: sum('total'),
      payments_received: round(paymentsByMethod.reduce((s, p) => s + p.amount, 0)),
      payments_by_method: paymentsByMethod,
      daily: days,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load income report' });
  }
};
