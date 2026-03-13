package handlers

import (
	"path/filepath"
	"testing"
	"time"

	"meituan-go/internal/db"
)

func TestBuildMasterShopSummaryStats(t *testing.T) {
	// 1. Setup DB
	dbPath := filepath.Join(t.TempDir(), "master-stats-test.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	shopID := int64(1)
	_, _ = db.DB.Exec(`
		INSERT INTO shops (id, name, slug, status, commission_type, commission_value, settings) 
		VALUES (1, 'Test Shop', 'test-shop', 'active', 'percentage', 3, '{}')
	`)
	_, _ = db.DB.Exec("INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd) VALUES (1, 'subscription', 1000)")

	// 2. Insert Orders
	// Today Delivery: 2 orders, 1601 RSD total
	// Today DineIn: 3 orders, 3000 RSD total
	today := time.Now().Format("2006-01-02")

	// Delivery orders
	_, _ = db.DB.Exec("INSERT INTO orders (shop_id, order_no, order_type, total_amount, created_at, status, items_json) VALUES (1, 'D1', 'delivery', 800, ? || ' 10:00:00', 'completed', '[]')", today)
	_, _ = db.DB.Exec("INSERT INTO orders (shop_id, order_no, order_type, total_amount, created_at, status, items_json) VALUES (1, 'D2', 'delivery', 801, ? || ' 11:00:00', 'completed', '[]')", today)

	// DineIn orders
	_, _ = db.DB.Exec("INSERT INTO orders (shop_id, order_no, order_type, total_amount, created_at, status, items_json) VALUES (1, 'T1', 'dine_in', 1000, ? || ' 12:00:00', 'completed', '[]')", today)
	_, _ = db.DB.Exec("INSERT INTO orders (shop_id, order_no, order_type, total_amount, created_at, status, items_json) VALUES (1, 'T2', 'dine_in', 1000, ? || ' 13:00:00', 'completed', '[]')", today)
	_, _ = db.DB.Exec("INSERT INTO orders (shop_id, order_no, order_type, total_amount, created_at, status, items_json) VALUES (1, 'T3', 'dine_in', 1000, ? || ' 14:00:00', 'completed', '[]')", today)

	// Yesterday DineIn (Should not be counted in today)
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	_, _ = db.DB.Exec("INSERT INTO orders (shop_id, order_no, order_type, total_amount, created_at, status, items_json) VALUES (1, 'T_OLD', 'dine_in', 500, ? || ' 12:00:00', 'completed', '[]')", yesterday)

	// 3. Run Build Summary
	summary := buildMasterShopSummary(shopID)

	// 4. Assertions
	if summary["delivery_today_count"] != int64(2) {
		t.Errorf("expected delivery_today_count 2, got %v", summary["delivery_today_count"])
	}
	if summary["delivery_today_revenue"] != int64(1601) {
		t.Errorf("expected delivery_today_revenue 1601, got %v", summary["delivery_today_revenue"])
	}
	if summary["dine_in_today_count"] != int64(3) {
		t.Errorf("expected dine_in_today_count 3, got %v", summary["dine_in_today_count"])
	}
	if summary["dine_in_today_revenue"] != int64(3000) {
		t.Errorf("expected dine_in_today_revenue 3000, got %v", summary["dine_in_today_revenue"])
	}
	if summary["today_order_count"] != int64(5) {
		t.Errorf("expected today_order_count 5, got %v", summary["today_order_count"])
	}
}
