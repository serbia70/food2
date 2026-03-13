package handlers

import (
	"path/filepath"
	"testing"
	"time"

	"meituan-go/internal/db"
)

func setupCommissionAutoCompleteTestDB(t *testing.T) int64 {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "commission-auto-complete.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	if _, err := db.DB.Exec(`
		INSERT INTO shops (name, slug, password, status, commission_type, commission_value)
		VALUES ('Auto Shop', 'auto-shop', 'x', 'active', 'per_order', 30)
	`); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}

	var shopID int64
	if err := db.DB.Get(&shopID, "SELECT id FROM shops WHERE slug = 'auto-shop'"); err != nil {
		t.Fatalf("query shop id failed: %v", err)
	}

	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
		VALUES (?, 'subscription', 10000, date('now', 'start of month', '+1 month'), 'active')
	`, shopID); err != nil {
		t.Fatalf("seed billing account failed: %v", err)
	}

	setMasterSettings(t, map[string]interface{}{
		"subscription_delivery_commission_type":  "percentage",
		"subscription_delivery_commission_value": 3.0,
		"business_delivery_commission_type":      "percentage",
		"business_delivery_commission_value":     3.0,
	})

	return shopID
}

func TestAutoCompleteDeliveryOrders_CompletesImmediateOrderAfterFiveAM(t *testing.T) {
	shopID := setupCommissionAutoCompleteTestDB(t)
	createdAt := "2026-03-10 12:00:00"
	if _, err := db.DB.Exec(`
		INSERT INTO orders (id, order_no, shop_id, order_type, status, total_amount, items_json, created_at)
		VALUES (4001, '260310001', ?, 'delivery', 'pending', 500, '[]', ?)
	`, shopID, createdAt); err != nil {
		t.Fatalf("seed delivery order failed: %v", err)
	}

	now := time.Date(2026, 3, 11, 5, 1, 0, 0, time.UTC)
	count, err := AutoCompleteDeliveryOrders(now)
	if err != nil {
		t.Fatalf("AutoCompleteDeliveryOrders failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 auto completed order, got %d", count)
	}

	var status string
	if err := db.DB.Get(&status, "SELECT status FROM orders WHERE id = 4001"); err != nil {
		t.Fatalf("load order status failed: %v", err)
	}
	if status != "completed" {
		t.Fatalf("expected completed, got %s", status)
	}

	var recordCount int
	if err := db.DB.Get(&recordCount, "SELECT COUNT(*) FROM commission_records WHERE order_id = 4001"); err != nil {
		t.Fatalf("count commission records failed: %v", err)
	}
	if recordCount != 1 {
		t.Fatalf("expected one commission record after auto complete, got %d", recordCount)
	}
}

func TestAutoCompleteDeliveryOrders_DoesNotCompleteScheduledOrderBeforeBusinessDayEnds(t *testing.T) {
	shopID := setupCommissionAutoCompleteTestDB(t)
	scheduledFor := "2026-03-12T18:30:00"
	if _, err := db.DB.Exec(`
		INSERT INTO orders (id, order_no, shop_id, order_type, status, total_amount, items_json, scheduled_for, created_at)
		VALUES (4002, '260310002', ?, 'delivery', 'pending', 800, '[]', ?, '2026-03-10 10:00:00')
	`, shopID, scheduledFor); err != nil {
		t.Fatalf("seed scheduled order failed: %v", err)
	}

	now := time.Date(2026, 3, 12, 4, 59, 0, 0, time.UTC)
	count, err := AutoCompleteDeliveryOrders(now)
	if err != nil {
		t.Fatalf("AutoCompleteDeliveryOrders failed: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected 0 auto completed order, got %d", count)
	}

	var status string
	if err := db.DB.Get(&status, "SELECT status FROM orders WHERE id = 4002"); err != nil {
		t.Fatalf("load order status failed: %v", err)
	}
	if status != "pending" {
		t.Fatalf("expected pending before cutoff, got %s", status)
	}
}
