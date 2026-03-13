import type { Database } from 'better-sqlite3';

export function runMigrations(db: Database) {
  // 创建基础表结构
  const migrations = [
    // 初始表结构
    `
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT,
      settings TEXT,
      mqtt_secret TEXT,
      expire_date TEXT,
      commission_type TEXT DEFAULT 'per_order',
      commission_value INTEGER DEFAULT 30,
      last_paid_month TEXT,
      table_config TEXT,
      phone TEXT,
      status TEXT DEFAULT 'active',
      enable_delivery INTEGER DEFAULT 0,
      enable_dine_in INTEGER DEFAULT 1,
      enable_reservation INTEGER DEFAULT 0,
      owner_user_id INTEGER,
      delivery_fee_settings TEXT,
      city TEXT,
      zone TEXT,
      delivery_type TEXT DEFAULT 'merchant',
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sub_name TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      category_id INTEGER,
      name TEXT NOT NULL,
      sub_name TEXT,
      price INTEGER NOT NULL,
      img TEXT,
      is_available INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      stock INTEGER DEFAULT -1,
      description TEXT,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL,
      restaurant_id INTEGER NOT NULL,
      table_info TEXT,
      order_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      total_amount INTEGER NOT NULL,
      items_json TEXT NOT NULL,
      original_items_json TEXT,
      remarks_json TEXT,
      user_phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER DEFAULT 0,
      deleted_at TEXT,
      archived INTEGER DEFAULT 0,
      archived_at TEXT,
      paid_at TEXT,
      courier_name TEXT,
      courier_phone TEXT,
      modification_count INTEGER DEFAULT 0,
      delivery_fee_status TEXT,
      allow_add INTEGER DEFAULT 0,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      password TEXT,
      last_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      google_id TEXT,
      email TEXT,
      avatar TEXT,
      role TEXT DEFAULT 'customer'
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS riders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT,
      status TEXT DEFAULT 'offline',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS master_admin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password TEXT NOT NULL,
      settings TEXT
    );
    `
  ];

  // 执行所有迁移
  migrations.forEach(migration => {
    try {
      db.exec(migration);
    } catch (e) {
      console.error('Migration failed:', e);
    }
  });

  console.log('✅ Database migrations completed');
}
