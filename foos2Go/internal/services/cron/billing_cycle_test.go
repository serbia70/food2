package cron

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"meituan-go/internal/db"
)

func setupBillingCycleTestDB(t *testing.T) int64 {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "billing-cycle-test.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	res, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status, enable_reservation) VALUES (?, ?, ?, 'active', 1)", "Billing Shop", "billing-shop", "admin")
	if err != nil {
		t.Fatalf("insert shop failed: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func setMasterBillingSettings(t *testing.T, settings map[string]interface{}) {
	t.Helper()

	raw, err := json.Marshal(settings)
	if err != nil {
		t.Fatalf("marshal settings failed: %v", err)
	}
	if _, err := db.DB.Exec("UPDATE master_admin SET settings = ? WHERE id = 1", string(raw)); err != nil {
		t.Fatalf("update settings failed: %v", err)
	}
}

func TestMonthlyBillingCycle_SuccessCharge(t *testing.T) {
	shopID := setupBillingCycleTestDB(t)
	setMasterBillingSettings(t, map[string]interface{}{"subscription_fee_rsd": 1280, "grace_days": 3})

	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
		VALUES (?, 'subscription', 3000, '2026-02-01', 'active')
	`, shopID); err != nil {
		t.Fatalf("insert billing account failed: %v", err)
	}

	now := time.Date(2026, 2, 1, 0, 1, 0, 0, time.UTC)
	if err := runMonthlyBillingCycleAt(now, getMasterSettings()); err != nil {
		t.Fatalf("runMonthlyBillingCycleAt failed: %v", err)
	}

	var account struct {
		BalanceRSD     int64   `db:"balance_rsd"`
		BillingStatus  string  `db:"billing_status"`
		NextChargeDate *string `db:"next_charge_date"`
	}
	if err := db.DB.Get(&account, "SELECT balance_rsd, billing_status, next_charge_date FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query account failed: %v", err)
	}
	if account.BalanceRSD != 1720 {
		t.Fatalf("expected balance 1720 after charge, got %d", account.BalanceRSD)
	}
	if account.BillingStatus != "active" {
		t.Fatalf("expected active status after successful charge, got %s", account.BillingStatus)
	}
	if account.NextChargeDate == nil || *account.NextChargeDate == "" {
		t.Fatalf("expected next_charge_date set after successful charge")
	}
	if !strings.Contains(*account.NextChargeDate, "2026-03-01") {
		t.Fatalf("expected next_charge_date advanced to 2026-03-01, got %s", *account.NextChargeDate)
	}

	var ledger struct {
		EntryType string `db:"entry_type"`
		AmountRSD int64  `db:"amount_rsd"`
	}
	if err := db.DB.Get(&ledger, "SELECT entry_type, amount_rsd FROM billing_ledger WHERE shop_id = ? ORDER BY id DESC LIMIT 1", shopID); err != nil {
		t.Fatalf("query ledger failed: %v", err)
	}
	if ledger.EntryType != "subscription_charge" || ledger.AmountRSD != -1280 {
		t.Fatalf("unexpected ledger row: type=%s amount=%d", ledger.EntryType, ledger.AmountRSD)
	}
}

func TestMonthlyBillingCycle_InsufficientEntersGrace(t *testing.T) {
	shopID := setupBillingCycleTestDB(t)
	setMasterBillingSettings(t, map[string]interface{}{"subscription_fee_rsd": 1280, "grace_days": 3})

	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
		VALUES (?, 'subscription', 500, '2026-02-01', 'active')
	`, shopID); err != nil {
		t.Fatalf("insert billing account failed: %v", err)
	}

	now := time.Date(2026, 2, 1, 0, 1, 0, 0, time.UTC)
	if err := runMonthlyBillingCycleAt(now, getMasterSettings()); err != nil {
		t.Fatalf("runMonthlyBillingCycleAt failed: %v", err)
	}

	var account struct {
		BalanceRSD    int64   `db:"balance_rsd"`
		BillingStatus string  `db:"billing_status"`
		GraceUntil    *string `db:"grace_until"`
	}
	if err := db.DB.Get(&account, "SELECT balance_rsd, billing_status, grace_until FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query account failed: %v", err)
	}
	if account.BalanceRSD != 500 {
		t.Fatalf("balance should remain unchanged on failed charge, got %d", account.BalanceRSD)
	}
	if account.BillingStatus != "grace" {
		t.Fatalf("expected grace status, got %s", account.BillingStatus)
	}
	if account.GraceUntil == nil || *account.GraceUntil == "" {
		t.Fatalf("expected grace_until set after failed charge")
	}

	var failType string
	if err := db.DB.Get(&failType, "SELECT entry_type FROM billing_ledger WHERE shop_id = ? ORDER BY id DESC LIMIT 1", shopID); err != nil {
		t.Fatalf("query failed ledger type failed: %v", err)
	}
	if failType != "subscription_charge_failed" {
		t.Fatalf("expected failed charge ledger entry, got %s", failType)
	}
}

func TestApplyGraceDowngradesAt_DowngradesExpiredShops(t *testing.T) {
	shopID := setupBillingCycleTestDB(t)
	setMasterBillingSettings(t, map[string]interface{}{"subscription_fee_rsd": 1280, "grace_days": 3})

	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, grace_until, billing_status)
		VALUES (?, 'subscription', 100, '2026-02-01', '2026-01-31 00:00:00', 'grace')
	`, shopID); err != nil {
		t.Fatalf("insert billing account failed: %v", err)
	}

	now := time.Date(2026, 2, 2, 0, 5, 0, 0, time.UTC)
	if err := applyGraceDowngradesAt(now, getMasterSettings()); err != nil {
		t.Fatalf("applyGraceDowngradesAt failed: %v", err)
	}

	var account struct {
		PlanType      string `db:"plan_type"`
		BillingStatus string `db:"billing_status"`
	}
	if err := db.DB.Get(&account, "SELECT plan_type, billing_status FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query billing account failed: %v", err)
	}
	if account.PlanType != "subscription" {
		t.Fatalf("expected plan_type to remain subscription, got %s", account.PlanType)
	}
	if account.BillingStatus != "inactive" {
		t.Fatalf("expected billing_status inactive after grace timeout, got %s", account.BillingStatus)
	}
}

func TestMonthlyBillingCycle_BusinessPlanChargeUsesBusinessFee(t *testing.T) {
	shopID := setupBillingCycleTestDB(t)
	setMasterBillingSettings(t, map[string]interface{}{"subscription_fee_rsd": 1200, "business_fee_rsd": 1800, "grace_days": 3})

	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
		VALUES (?, 'business', 3000, '2026-02-01', 'active')
	`, shopID); err != nil {
		t.Fatalf("insert billing account failed: %v", err)
	}

	now := time.Date(2026, 2, 1, 0, 1, 0, 0, time.UTC)
	if err := runMonthlyBillingCycleAt(now, getMasterSettings()); err != nil {
		t.Fatalf("runMonthlyBillingCycleAt failed: %v", err)
	}

	var account struct {
		BalanceRSD int64  `db:"balance_rsd"`
		PlanType   string `db:"plan_type"`
	}
	if err := db.DB.Get(&account, "SELECT balance_rsd, plan_type FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query account failed: %v", err)
	}
	if account.PlanType != "business" {
		t.Fatalf("expected business plan kept, got %s", account.PlanType)
	}
	if account.BalanceRSD != 1200 {
		t.Fatalf("expected balance 1200 after business monthly charge, got %d", account.BalanceRSD)
	}
}

func TestMonthlyBillingCycle_PendingDowngradeAppliesOnMonthStart(t *testing.T) {
	shopID := setupBillingCycleTestDB(t)
	setMasterBillingSettings(t, map[string]interface{}{"subscription_fee_rsd": 1200, "business_fee_rsd": 1800, "grace_days": 3})

	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, pending_plan_type, balance_rsd, next_charge_date, billing_status)
		VALUES (?, 'business', 'subscription', 2000, '2026-02-01', 'active')
	`, shopID); err != nil {
		t.Fatalf("insert billing account failed: %v", err)
	}

	now := time.Date(2026, 2, 1, 0, 1, 0, 0, time.UTC)
	if err := runMonthlyBillingCycleAt(now, getMasterSettings()); err != nil {
		t.Fatalf("runMonthlyBillingCycleAt failed: %v", err)
	}

	var account struct {
		BalanceRSD      int64   `db:"balance_rsd"`
		PlanType        string  `db:"plan_type"`
		PendingPlanType *string `db:"pending_plan_type"`
	}
	if err := db.DB.Get(&account, "SELECT balance_rsd, plan_type, pending_plan_type FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query account failed: %v", err)
	}
	if account.PlanType != "subscription" {
		t.Fatalf("expected plan switched to subscription on due date, got %s", account.PlanType)
	}
	if account.PendingPlanType != nil && *account.PendingPlanType != "" {
		t.Fatalf("expected pending_plan_type cleared after apply, got %v", account.PendingPlanType)
	}
	if account.BalanceRSD != 800 {
		t.Fatalf("expected subscription fee charged after downgrade apply, got balance %d", account.BalanceRSD)
	}
}
