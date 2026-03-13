package cron

import (
	"testing"
	"time"

	"meituan-go/internal/db"
)

func TestOrderRetentionByType_SnapshotThenDelete(t *testing.T) {
	shopID := setupBillingCycleTestDB(t)
	setMasterBillingSettings(t, map[string]interface{}{
		"retention_dine_in_days":  7,
		"retention_delivery_days": 90,
		"stats_retention_mode":    "permanent",
		"subscription_fee_rsd":    1280,
		"grace_days":              3,
	})

	_, err := db.DB.Exec(`
		INSERT INTO orders (order_no, shop_id, order_type, status, total_amount, items_json, created_at)
		VALUES
		('d_old_1', ?, 'dine_in', 'completed', 500, '[]', '2026-02-20 12:00:00'),
		('d_old_2', ?, 'dine_in', 'paid', 300, '[]', '2026-02-20 12:30:00'),
		('del_old_1', ?, 'delivery', 'completed', 800, '[]', '2025-11-01 10:00:00'),
		('del_old_pending', ?, 'delivery', 'pending', 600, '[]', '2025-11-01 11:00:00'),
		('del_recent', ?, 'delivery', 'completed', 700, '[]', '2026-02-26 10:00:00')
	`, shopID, shopID, shopID, shopID, shopID)
	if err != nil {
		t.Fatalf("seed orders failed: %v", err)
	}

	now := time.Date(2026, 3, 1, 1, 0, 0, 0, time.UTC)
	if err := runOrderRetentionAt(now, getMasterSettings()); err != nil {
		t.Fatalf("runOrderRetentionAt failed: %v", err)
	}

	var remaining int
	if err := db.DB.Get(&remaining, "SELECT COUNT(*) FROM orders WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("count remaining orders failed: %v", err)
	}
	if remaining != 2 {
		t.Fatalf("expected 2 remaining orders (pending old + recent), got %d", remaining)
	}

	var statsCount int
	if err := db.DB.Get(&statsCount, "SELECT COUNT(*) FROM order_daily_stats WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("count stats rows failed: %v", err)
	}
	if statsCount < 2 {
		t.Fatalf("expected at least two stats snapshot rows, got %d", statsCount)
	}

	var dineInSum int64
	if err := db.DB.Get(&dineInSum, "SELECT COALESCE(SUM(total_rsd), 0) FROM order_daily_stats WHERE shop_id = ? AND order_type = 'dine_in'", shopID); err != nil {
		t.Fatalf("sum dine_in stats failed: %v", err)
	}
	if dineInSum != 800 {
		t.Fatalf("expected dine_in snapshot sum 800, got %d", dineInSum)
	}
}

func TestOrderRetentionByType_Stats3YModeCleanup(t *testing.T) {
	shopID := setupBillingCycleTestDB(t)
	setMasterBillingSettings(t, map[string]interface{}{
		"retention_dine_in_days":  7,
		"retention_delivery_days": 90,
		"stats_retention_mode":    "3y",
	})

	_, err := db.DB.Exec(`
		INSERT INTO order_daily_stats (shop_id, stat_date, order_type, order_count, total_rsd, created_at, updated_at)
		VALUES
		(?, '2021-01-01', 'delivery', 2, 2000, '2021-01-01 00:00:00', '2021-01-01 00:00:00'),
		(?, '2025-12-01', 'delivery', 1, 900, '2025-12-01 00:00:00', '2025-12-01 00:00:00')
	`, shopID, shopID)
	if err != nil {
		t.Fatalf("seed stats failed: %v", err)
	}

	now := time.Date(2026, 3, 1, 1, 0, 0, 0, time.UTC)
	if err := runOrderRetentionAt(now, getMasterSettings()); err != nil {
		t.Fatalf("runOrderRetentionAt failed: %v", err)
	}

	var count int
	if err := db.DB.Get(&count, "SELECT COUNT(*) FROM order_daily_stats WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("count stats rows failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected only one recent stats row in 3y mode, got %d", count)
	}
}
