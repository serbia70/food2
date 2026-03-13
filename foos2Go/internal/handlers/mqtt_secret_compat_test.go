package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func setupLegacyShopSchemaTestDB(t *testing.T) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "legacy-shop.db")
	var err error
	db.DB, err = db.OpenDB(dbPath)
	if err != nil {
		t.Fatalf("open db failed: %v", err)
	}
	t.Cleanup(db.Close)

	stmts := []string{
		`CREATE TABLE shops (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			slug TEXT NOT NULL UNIQUE,
			password TEXT NOT NULL DEFAULT '',
			phone TEXT,
			address TEXT,
			status TEXT NOT NULL DEFAULT 'active',
			settings TEXT,
			expire_date TEXT,
			last_paid_month TEXT,
			commission_type TEXT,
			commission_value INTEGER,
			enable_delivery INTEGER DEFAULT 1,
			enable_dine_in INTEGER DEFAULT 1,
			enable_reservation INTEGER DEFAULT 1,
			table_config TEXT,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE billing_accounts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			shop_id INTEGER NOT NULL,
			plan_type TEXT,
			balance_rsd INTEGER DEFAULT 0,
			next_charge_date TEXT,
			billing_status TEXT DEFAULT 'active',
			grace_until TEXT
		)`,
		`CREATE TABLE orders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			shop_id INTEGER NOT NULL,
			order_type TEXT,
			total_amount INTEGER DEFAULT 0,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE commission_records (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			shop_id INTEGER NOT NULL,
			commission_amount INTEGER DEFAULT 0,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE master_admin (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL,
			password TEXT NOT NULL
		)`,
		`CREATE TABLE master_settings (
			key TEXT PRIMARY KEY,
			value TEXT
		)`,
		`INSERT INTO shops (name, slug, password, status, settings) VALUES ('Shop 02', '02', 'x', 'active', '{}')`,
		`INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status) VALUES (1, 'subscription', 0, date('now', '+1 month'), 'active')`,
		`INSERT INTO master_admin (username, password) VALUES ('admin', 'admin123')`,
	}

	for _, stmt := range stmts {
		if _, err := db.DB.Exec(stmt); err != nil {
			t.Fatalf("exec stmt failed: %v\nSQL: %s", err, stmt)
		}
	}

	resetShopMQTTSecretColumnCache()
}

func TestHasShopMQTTSecretColumn_ReturnsFalseForLegacySchema(t *testing.T) {
	setupLegacyShopSchemaTestDB(t)

	if hasShopMQTTSecretColumn() {
		t.Fatalf("expected mqtt_secret column to be absent in legacy schema")
	}
}

func TestGetShopBySlugWithoutMQTTSecretColumn(t *testing.T) {
	setupLegacyShopSchemaTestDB(t)

	h := &ShopHandler{}
	r := gin.New()
	r.GET("/:slug/info", h.GetShopBySlug)

	req := httptest.NewRequest(http.MethodGet, "/02/info", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	if resp["slug"] != "02" {
		t.Fatalf("expected slug 02, got %v", resp["slug"])
	}
	if v, exists := resp["mqtt_secret"]; exists && v != nil && v != "" {
		t.Fatalf("expected empty mqtt_secret fallback, got %v", v)
	}
	if plan := resp["billing_plan_type"]; plan != "subscription" {
		t.Fatalf("expected subscription plan, got %v", plan)
	}
}

func TestMasterInitDataWithoutMQTTSecretColumn(t *testing.T) {
	setupLegacyShopSchemaTestDB(t)

	r := gin.New()
	r.GET("/api/master/init", MasterInitData)

	req := httptest.NewRequest(http.MethodGet, "/api/master/init", nil)
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Shops []map[string]interface{} `json:"shops"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	if len(resp.Shops) != 1 {
		t.Fatalf("expected 1 shop, got %d", len(resp.Shops))
	}
	if resp.Shops[0]["slug"] != "02" {
		t.Fatalf("expected shop slug 02, got %v", resp.Shops[0]["slug"])
	}
	if v, exists := resp.Shops[0]["mqtt_secret"]; exists && v != nil && v != "" {
		t.Fatalf("expected empty mqtt_secret fallback, got %v", v)
	}
	if _, ok := resp.Shops[0]["billing_balance_rsd"]; !ok {
		t.Fatalf("expected billing_balance_rsd in response")
	}
}

func TestHasShopMQTTSecretColumn_ReturnsTrueWhenColumnExists(t *testing.T) {
	setupShopTestDB(t, "subscription")
	resetShopMQTTSecretColumnCache()

	if !hasShopMQTTSecretColumn() {
		t.Fatalf("expected mqtt_secret column to exist in migrated schema")
	}

	var nullable sql.NullString
	if err := db.DB.Get(&nullable, "SELECT mqtt_secret FROM shops WHERE slug = 'test-shop'"); err != nil {
		t.Fatalf("expected selecting mqtt_secret to succeed, got %v", err)
	}
}
