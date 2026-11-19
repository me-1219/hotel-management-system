CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL
    CHECK (role IN ('manager', 'receptionist', 'kitchen', 'housekeeping')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  price_per_night NUMERIC(10, 2) NOT NULL CHECK (price_per_night >= 0),
  capacity INT NOT NULL DEFAULT 2 CHECK (capacity > 0)
);

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  room_number VARCHAR(10) UNIQUE NOT NULL,
  floor INT NOT NULL,
  room_type_id INT NOT NULL REFERENCES room_types(id),
  status VARCHAR(20) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'booked', 'occupied', 'cleaning', 'out_of_service')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


///CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS guests (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(150),
  id_number VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  guest_id INT NOT NULL REFERENCES guests(id),
  room_id INT NOT NULL REFERENCES rooms(id),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  num_guests INT NOT NULL DEFAULT 1 CHECK (num_guests > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled')),
  total_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (check_out > check_in),
  EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in, check_out) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'checked_out'))
);



//digitall menu 
CREATE TABLE IF NOT EXISTS menu_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES menu_categories(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO menu_categories (name, sort_order) VALUES
  ('Breakfast', 1), ('Main Dishes', 2), ('Drinks', 3);

INSERT INTO menu_items (category_id, name, description, price) VALUES
  (1, 'Firfir', 'Shredded injera with spiced butter sauce', 180),
  (1, 'Scrambled Eggs', 'With toast and butter', 150),
  (2, 'Doro Wat', 'Chicken stew with egg and injera', 450),
  (2, 'Tibs', 'Sauteed beef with onions and peppers', 400),
  (3, 'Macchiato', 'Ethiopian coffee with milk', 60),
  (3, 'Fresh Juice', 'Avocado, mango or papaya', 120);


//guest orders, where a guest picks items from the menu with a room number,
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS qr_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE;

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  booking_id INT NOT NULL REFERENCES bookings(id),
  room_id INT NOT NULL REFERENCES rooms(id),
  status VARCHAR(20) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'preparing', 'ready', 'delivered', 'cancelled')),
  notes TEXT,
  total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INT NOT NULL REFERENCES menu_items(id),
  name VARCHAR(100) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0)
);
