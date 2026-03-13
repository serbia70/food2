package db

import (
	"log"

	"meituan-go/internal/security"
)

func RunMigrations() error {
	schema := `
	CREATE TABLE IF NOT EXISTS shops (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			slug TEXT UNIQUE NOT NULL,
			password TEXT,
			phone TEXT,
			address TEXT,
			status TEXT DEFAULT 'active',
			settings TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

	CREATE TABLE IF NOT EXISTS categories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			shop_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			sort_order INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
		);

	CREATE TABLE IF NOT EXISTS products (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			category_id INTEGER,
			shop_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			sub_name TEXT,
			price INTEGER NOT NULL,
			img TEXT,
			description TEXT,
			is_available INTEGER DEFAULT 1,
			sort_order INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
			FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
		);

	CREATE TABLE IF NOT EXISTS orders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			order_no TEXT UNIQUE NOT NULL,
			shop_id INTEGER NOT NULL,
			table_info TEXT,
			order_type TEXT NOT NULL,
			status TEXT DEFAULT 'pending',
			total_amount INTEGER NOT NULL,
			items_json TEXT NOT NULL,
			remarks_json TEXT,
			user_phone TEXT,
			scheduled_for DATETIME,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
		);

	CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			phone TEXT UNIQUE,
			name TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

	CREATE TABLE IF NOT EXISTS riders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			phone TEXT UNIQUE NOT NULL,
			password TEXT,
			status TEXT DEFAULT 'offline',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

	CREATE TABLE IF NOT EXISTS master_admin (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL,
			settings TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

	CREATE TABLE IF NOT EXISTS reservations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			shop_id INTEGER NOT NULL,
			guest_count INTEGER NOT NULL,
			reservation_time TEXT NOT NULL,
			customer_phone TEXT NOT NULL,
			dine_type TEXT NOT NULL DEFAULT 'dine_in',
			customer_name TEXT,
			items_json TEXT,
			remarks TEXT,
			status TEXT DEFAULT 'pending',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
		);

	CREATE TABLE IF NOT EXISTS billing_accounts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			shop_id INTEGER NOT NULL UNIQUE,
			plan_type TEXT NOT NULL,
			pending_plan_type TEXT,
			balance_rsd INTEGER NOT NULL DEFAULT 0,
			next_charge_date DATE,
			grace_until DATETIME,
			billing_status TEXT NOT NULL DEFAULT 'active',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
		);

	CREATE TABLE IF NOT EXISTS billing_ledger (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			shop_id INTEGER NOT NULL,
			entry_type TEXT NOT NULL,
			amount_rsd INTEGER NOT NULL,
			source_currency TEXT,
			source_amount REAL,
			fx_rate REAL,
			note TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
		);

	CREATE TABLE IF NOT EXISTS shop_loyalty_points (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			shop_id INTEGER NOT NULL,
			user_phone TEXT NOT NULL,
			points_balance INTEGER NOT NULL DEFAULT 0,
			is_vip INTEGER NOT NULL DEFAULT 0,
			vip_discount_percent REAL NOT NULL DEFAULT 0,
			total_spend_rsd INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (shop_id, user_phone),
			FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
		);

	CREATE TABLE IF NOT EXISTS shop_promotions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			shop_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			promo_type TEXT NOT NULL,
			discount_percent REAL,
			min_spend_rsd INTEGER,
			discount_amount_rsd INTEGER,
			bonus_points INTEGER,
			selected_products TEXT,
			special_price_rsd INTEGER,
			starts_at DATETIME,
			ends_at DATETIME,
			stackable INTEGER NOT NULL DEFAULT 0,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
		);

	CREATE TABLE IF NOT EXISTS order_daily_stats (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			shop_id INTEGER NOT NULL,
			stat_date DATE NOT NULL,
			order_type TEXT NOT NULL,
			order_count INTEGER NOT NULL DEFAULT 0,
			total_rsd INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (shop_id, stat_date, order_type),
			FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
		);

	CREATE TABLE IF NOT EXISTS commission_records (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		shop_id INTEGER NOT NULL,
		order_id INTEGER NOT NULL,
		order_no TEXT NOT NULL,
		total_amount INTEGER NOT NULL,
		commission_rate INTEGER NOT NULL,
		commission_amount INTEGER NOT NULL,
		balance_after INTEGER DEFAULT 0,
		order_type TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
		FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS commission_refund_requests (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		shop_id INTEGER NOT NULL,
		order_id INTEGER NOT NULL,
		commission_record_id INTEGER NOT NULL,
		commission_amount INTEGER NOT NULL,
		reason TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		review_note TEXT,
		reviewed_by TEXT,
		reviewed_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
		FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
		FOREIGN KEY (commission_record_id) REFERENCES commission_records(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS chat_messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		shop_id INTEGER NOT NULL,
		order_id INTEGER,
		user_phone TEXT,
		sender_role TEXT NOT NULL,
		sender_phone TEXT,
		message TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS user_identity_links (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		canonical_login_account TEXT NOT NULL,
		alias TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(alias)
	);

	CREATE INDEX IF NOT EXISTS idx_billing_accounts_status_next_charge ON billing_accounts(billing_status, next_charge_date);
	CREATE INDEX IF NOT EXISTS idx_billing_ledger_shop_created ON billing_ledger(shop_id, created_at);
	CREATE INDEX IF NOT EXISTS idx_commission_refund_shop_status ON commission_refund_requests(shop_id, status);
	CREATE INDEX IF NOT EXISTS idx_commission_refund_commission_record ON commission_refund_requests(commission_record_id);
	CREATE INDEX IF NOT EXISTS idx_loyalty_shop_phone ON shop_loyalty_points(shop_id, user_phone);
	CREATE INDEX IF NOT EXISTS idx_promo_shop_active ON shop_promotions(shop_id, is_active, starts_at, ends_at);
	CREATE INDEX IF NOT EXISTS idx_chat_shop_created ON chat_messages(shop_id, created_at);
	CREATE INDEX IF NOT EXISTS idx_commission_shop_created ON commission_records(shop_id, created_at);
	CREATE INDEX IF NOT EXISTS idx_order_daily_stats_shop_type_date ON order_daily_stats(shop_id, order_type, stat_date);
	`

	_, err := DB.Exec(schema)
	if err != nil {
		log.Printf("Error running migrations: %v\n", err)
		return err
	}

	// 安全列添加
	DB.Exec("ALTER TABLE commission_records ADD COLUMN balance_after INTEGER DEFAULT 0")
	DB.Exec("ALTER TABLE commission_records ADD COLUMN refund_status TEXT DEFAULT 'none'")
	DB.Exec("ALTER TABLE products ADD COLUMN updated_at DATETIME")
	DB.Exec("ALTER TABLE categories ADD COLUMN updated_at DATETIME")
	DB.Exec("ALTER TABLE orders ADD COLUMN updated_at DATETIME")
	DB.Exec("ALTER TABLE shops ADD COLUMN expire_date DATETIME")
	DB.Exec("ALTER TABLE shops ADD COLUMN last_paid_month TEXT")
	DB.Exec("ALTER TABLE shops ADD COLUMN commission_type TEXT DEFAULT 'per_order'")
	DB.Exec("ALTER TABLE shops ADD COLUMN commission_value INTEGER DEFAULT 30")
	DB.Exec("ALTER TABLE shops ADD COLUMN enable_delivery INTEGER DEFAULT 1")
	DB.Exec("ALTER TABLE shops ADD COLUMN enable_dine_in INTEGER DEFAULT 1")
	DB.Exec("ALTER TABLE shops ADD COLUMN enable_reservation INTEGER DEFAULT 0")
	DB.Exec("ALTER TABLE shops ADD COLUMN table_config TEXT")
	DB.Exec("ALTER TABLE shops ADD COLUMN mqtt_secret TEXT")
	DB.Exec("ALTER TABLE users ADD COLUMN password TEXT")
	DB.Exec("ALTER TABLE users ADD COLUMN login_account TEXT")
	DB.Exec("ALTER TABLE users ADD COLUMN last_address TEXT")
	DB.Exec("ALTER TABLE users ADD COLUMN email TEXT")
	DB.Exec("ALTER TABLE users ADD COLUMN avatar TEXT")
	DB.Exec("ALTER TABLE orders ADD COLUMN print_status TEXT DEFAULT 'pending'")
	DB.Exec("ALTER TABLE orders ADD COLUMN courier_phone TEXT")
	DB.Exec("ALTER TABLE orders ADD COLUMN courier_name TEXT")
	DB.Exec("ALTER TABLE orders ADD COLUMN archived INTEGER DEFAULT 0")
	DB.Exec("ALTER TABLE orders ADD COLUMN is_deleted INTEGER DEFAULT 0")
	DB.Exec("ALTER TABLE billing_accounts ADD COLUMN pending_plan_type TEXT")
	DB.Exec("DROP INDEX IF EXISTS idx_billing_ledger_period_unique")
	DB.Exec("CREATE INDEX IF NOT EXISTS idx_billing_ledger_shop_type_note ON billing_ledger(shop_id, entry_type, note)")

	// Seed master admin if not exists
	var masterCount int
	err = DB.QueryRow("SELECT COUNT(*) FROM master_admin WHERE id = 1").Scan(&masterCount)
	if err == nil && masterCount == 0 {
		log.Println("Seeding default master admin...")
		seedPassword := "admin"
		if hash, hashErr := security.HashPassword(seedPassword); hashErr == nil {
			seedPassword = hash
		}
		DB.Exec("INSERT INTO master_admin (id, username, password, settings) VALUES (1, 'admin', ?, '{}')", seedPassword)
	}

	log.Println("Database migrations applied successfully")
	return nil
}
