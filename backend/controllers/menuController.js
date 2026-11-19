const pool = require('../db');

exports.getMenu = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id AS category_id, c.name AS category_name,
             i.id, i.name, i.description, i.price, i.image_url, i.is_available
      FROM menu_categories c
      LEFT JOIN menu_items i ON i.category_id = c.id
      ORDER BY c.sort_order, c.name, i.name
    `);

    const categories = [];
    const byId = {};

    for (const row of result.rows) {
      if (!byId[row.category_id]) {
        byId[row.category_id] = { id: row.category_id, name: row.category_name, items: [] };
        categories.push(byId[row.category_id]);
      }
      if (row.id) {
        byId[row.category_id].items.push({
          id: row.id,
          name: row.name,
          description: row.description,
          price: Number(row.price),
          image_url: row.image_url,
          is_available: row.is_available,
        });
      }
    }

    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load menu' });
  }
};

exports.createCategory = async (req, res) => {
  const { name, sort_order } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'name is required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO menu_categories (name, sort_order) VALUES ($1, $2) RETURNING *',
      [name, sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Category already exists' });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to create category' });
  }
};

exports.createItem = async (req, res) => {
  const { category_id, name, description, price, image_url } = req.body;

  if (!category_id || !name || !(Number(price) > 0)) {
    return res.status(400).json({ message: 'category_id, name and a positive price are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO menu_items (category_id, name, description, price, image_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [category_id, name, description || null, price, image_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ message: 'Category does not exist' });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to create item' });
  }
};

exports.updateItem = async (req, res) => {
  const { category_id, name, description, price, image_url } = req.body;

  if (price !== undefined && !(Number(price) > 0)) {
    return res.status(400).json({ message: 'price must be a positive number' });
  }

  try {
    const result = await pool.query(
      `UPDATE menu_items
       SET category_id = COALESCE($1, category_id),
           name = COALESCE($2, name),
           description = COALESCE($3, description),
           price = COALESCE($4, price),
           image_url = COALESCE($5, image_url)
       WHERE id = $6 RETURNING *`,
      [category_id, name, description, price, image_url, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ message: 'Category does not exist' });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to update item' });
  }
};

exports.setItemAvailability = async (req, res) => {
  const { is_available } = req.body;

  if (typeof is_available !== 'boolean') {
    return res.status(400).json({ message: 'is_available must be true or false' });
  }

  try {
    const result = await pool.query(
      'UPDATE menu_items SET is_available = $1 WHERE id = $2 RETURNING *',
      [is_available, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update availability' });
  }
};
