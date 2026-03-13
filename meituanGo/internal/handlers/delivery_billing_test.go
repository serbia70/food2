package handlers

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"meituan-go/internal/db"
)

func setupDeliveryBillingTestDB(t *testing.T) int64 {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "delivery-billing-test.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	if _, err := db.DB.Exec(`
		INSERT INTO shops (name, slug, password, status, commission_type, commission_value)
		VALUES ('Test Shop', 'test-shop', 'x', 'active', 'per_order', 30)
	`); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}

	var shopID int64
	if err := db.DB.Get(&shopID, "SELECT id FROM shops WHERE slug = 'test-shop'"); err != nil {
		t.Fatalf("query shop id failed: %v", err)
	}

	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
		VALUES (?, 'subscription', 10000, date('now', 'start of month', '+1 month'), 'active')
	`, shopID); err != nil {
		t.Fatalf("seed billing account failed: %v", err)
	}

	globalModeSettings := map[string]interface{}{"commission_mode": "global"}
	globalModeBytes, _ := json.Marshal(globalModeSettings)
	if _, err := db.DB.Exec("UPDATE shops SET settings = ? WHERE id = ?", string(globalModeBytes), shopID); err != nil {
		t.Fatalf("seed shop commission mode failed: %v", err)
	}

	settings := map[string]interface{}{
		"subscription_delivery_commission_type":  "percentage",
		"subscription_delivery_commission_value": 3.0,
		"business_delivery_commission_type":      "percentage",
		"business_delivery_commission_value":     3.0,
	}
	bytes, _ := json.Marshal(settings)
	if _, err := db.DB.Exec("UPDATE master_admin SET settings = ? WHERE id = 1", string(bytes)); err != nil {
		t.Fatalf("seed master settings failed: %v", err)
	}

	return shopID
}

func TestLoadDeliveryChargeForOrderUsesGlobalPlanRates(t *testing.T) {
	shopID := setupDeliveryBillingTestDB(t)

	chargeSubscription, err := loadDeliveryChargeForOrder(shopID, 1000)
	if err != nil {
		t.Fatalf("load delivery charge for subscription plan failed: %v", err)
	}
	if chargeSubscription != 30 {
		t.Fatalf("expected subscription plan charge 30, got %d", chargeSubscription)
	}

	if _, err := db.DB.Exec("UPDATE billing_accounts SET plan_type = 'business' WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("update plan failed: %v", err)
	}

	chargeBusiness, err := loadDeliveryChargeForOrder(shopID, 1000)
	if err != nil {
		t.Fatalf("load delivery charge for business plan failed: %v", err)
	}
	if chargeBusiness != 30 {
		t.Fatalf("expected business plan charge 30, got %d", chargeBusiness)
	}
}

func TestLoadDeliveryChargeForOrderUsesShopOverride(t *testing.T) {
	shopID := setupDeliveryBillingTestDB(t)

	overrideSettings := map[string]interface{}{
		"commission_mode":           "override",
		"commission_override_type":  "per_order",
		"commission_override_value": 12.5,
	}
	bytes, _ := json.Marshal(overrideSettings)
	if _, err := db.DB.Exec("UPDATE shops SET settings = ? WHERE id = ?", string(bytes), shopID); err != nil {
		t.Fatalf("set override settings failed: %v", err)
	}

	charge, err := loadDeliveryChargeForOrder(shopID, 1000)
	if err != nil {
		t.Fatalf("load delivery charge with override failed: %v", err)
	}
	if charge != 13 {
		t.Fatalf("expected per-order override charge 13, got %d", charge)
	}
}

func TestResolveDeliveryCommissionConfigUsesResolvedCommissionRate(t *testing.T) {
	shopID := setupDeliveryBillingTestDB(t)
	commissionType, commissionValue, _, _, _, err := resolveDeliveryCommissionConfig(shopID)
	if err != nil {
		t.Fatalf("resolve delivery commission config failed: %v", err)
	}
	if commissionType != "percentage" {
		t.Fatalf("expected commission type percentage, got %s", commissionType)
	}
	if int(commissionValue) != 3 {
		t.Fatalf("expected resolved commission rate 3, got %v", commissionValue)
	}
}

func TestResolveDeliveryChargeOrAbortSkipsDineInCommission(t *testing.T) {
	shopID := setupDeliveryBillingTestDB(t)

	charge, aborted := resolveDeliveryChargeOrAbort(nil, shopID, CreateOrderRequest{
		OrderType:   "dine_in",
		TotalAmount: 999,
	})

	if aborted {
		t.Fatalf("expected dine_in not to abort")
	}
	if charge != 0 {
		t.Fatalf("expected dine_in charge 0, got %d", charge)
	}
}

func TestRecordCommissionForOrderSkipsDineInOrders(t *testing.T) {
	shopID := setupDeliveryBillingTestDB(t)

	if _, err := db.DB.Exec(`
		INSERT INTO orders (id, order_no, shop_id, order_type, status, total_amount, items_json)
		VALUES (2001, '260307002', ?, 'dine_in', 'completed', 611, '[]')
	`, shopID); err != nil {
		t.Fatalf("seed dine_in order failed: %v", err)
	}

	var beforeBalance int64
	if err := db.DB.Get(&beforeBalance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("load starting balance failed: %v", err)
	}

	RecordCommissionForOrder(shopID, 2001)

	var recordCount int
	if err := db.DB.Get(&recordCount, "SELECT COUNT(*) FROM commission_records WHERE order_id = ?", 2001); err != nil {
		t.Fatalf("count commission records failed: %v", err)
	}
	if recordCount != 0 {
		t.Fatalf("expected no commission record for dine_in order, got %d", recordCount)
	}

	var afterBalance int64
	if err := db.DB.Get(&afterBalance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("load ending balance failed: %v", err)
	}
	if afterBalance != beforeBalance {
		t.Fatalf("expected dine_in order not to deduct balance, before=%d after=%d", beforeBalance, afterBalance)
	}
}

func TestRecordCommissionForOrderDeductsOnlyOnCompletedDelivery(t *testing.T) {
	shopID := setupDeliveryBillingTestDB(t)

	if _, err := db.DB.Exec(`
		INSERT INTO orders (id, order_no, shop_id, order_type, status, total_amount, items_json)
		VALUES (3001, '260307003', ?, 'delivery', 'confirmed', 611, '[]')
	`, shopID); err != nil {
		t.Fatalf("seed confirmed delivery order failed: %v", err)
	}

	RecordCommissionForOrder(shopID, 3001)

	var confirmedCount int
	if err := db.DB.Get(&confirmedCount, "SELECT COUNT(*) FROM commission_records WHERE order_id = ?", 3001); err != nil {
		t.Fatalf("count commission records for confirmed order failed: %v", err)
	}
	if confirmedCount != 0 {
		t.Fatalf("expected confirmed order not to deduct commission, got %d records", confirmedCount)
	}

	if _, err := db.DB.Exec(`
		UPDATE orders
		SET status = 'completed'
		WHERE id = 3001
	`); err != nil {
		t.Fatalf("update order to completed failed: %v", err)
	}

	RecordCommissionForOrder(shopID, 3001)

	var recordCount int
	if err := db.DB.Get(&recordCount, "SELECT COUNT(*) FROM commission_records WHERE order_id = ?", 3001); err != nil {
		t.Fatalf("count commission records after completion failed: %v", err)
	}
	if recordCount != 1 {
		t.Fatalf("expected one commission record after completion, got %d", recordCount)
	}
}
