package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"meituan-go/internal/db"
	"meituan-go/internal/security"

	"github.com/gin-gonic/gin"
)

func mustMasterAuthHeader(t *testing.T) string {
	t.Helper()
	token, err := generateMasterToken("admin")
	if err != nil {
		t.Fatalf("generate master token failed: %v", err)
	}
	return "Bearer " + token
}

func setupMasterManageTestDB(t *testing.T) int64 {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "master-manage.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	res, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status, commission_type, commission_value, enable_delivery, enable_dine_in, enable_reservation, settings) VALUES ('Shop 02', '02', 'pass', 'active', 'percentage', 3, 1, 1, 1, '{}')")
	if err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}
	shopID, _ := res.LastInsertId()

	if _, err := db.DB.Exec("INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, billing_status) VALUES (?, 'subscription', 0, 'active')", shopID); err != nil {
		t.Fatalf("seed billing account failed: %v", err)
	}

	return shopID
}

func TestMasterManageUpdateShopWithFrontendPayload(t *testing.T) {
	shopID := setupMasterManageTestDB(t)

	r := gin.New()
	r.PUT("/api/master/shops/:id", MasterUpdateShop)

	body, _ := json.Marshal(map[string]interface{}{
		"name":            "Shop 02 Updated",
		"slug":            "02-new",
		"password":        "new-pass",
		"billingPlanType": "business",
		"commissionType":  "percentage",
		"commissionValue": 5,
		"status":          "disabled",
	})

	req := httptest.NewRequest(http.MethodPut, "/api/master/shops/1", bytes.NewReader(body))
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var shop struct {
		Name            string `db:"name"`
		Slug            string `db:"slug"`
		Password        string `db:"password"`
		Status          string `db:"status"`
		CommissionType  string `db:"commission_type"`
		CommissionValue int64  `db:"commission_value"`
	}
	if err := db.DB.Get(&shop, "SELECT name, slug, password, status, commission_type, commission_value FROM shops WHERE id = ?", shopID); err != nil {
		t.Fatalf("reload updated shop failed: %v", err)
	}

	if shop.Name != "Shop 02 Updated" || shop.Slug != "02-new" || shop.Status != "disabled" {
		t.Fatalf("unexpected updated shop values: %+v", shop)
	}
	if !security.LooksLikeBcryptHash(shop.Password) {
		t.Fatalf("expected updated shop password to be hashed, got %s", shop.Password)
	}
	if shop.CommissionType != "percentage" || shop.CommissionValue != 5 {
		t.Fatalf("unexpected commission fields: %+v", shop)
	}
	var planType string
	if err := db.DB.Get(&planType, "SELECT plan_type FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("reload billing account failed: %v", err)
	}
	if planType != "business" {
		t.Fatalf("expected plan_type business, got %s", planType)
	}
}

func TestMasterManageUpdateShopPreservesEnableFlagsWhenFrontendOmitsThem(t *testing.T) {
	shopID := setupMasterManageTestDB(t)

	r := gin.New()
	r.PUT("/api/master/shops/:id", MasterUpdateShop)

	body, _ := json.Marshal(map[string]interface{}{
		"name":            "Shop 02 Updated",
		"slug":            "02-new",
		"billingPlanType": "subscription",
		"commissionType":  "per_order",
		"commissionValue": 18,
		"status":          "active",
	})

	req := httptest.NewRequest(http.MethodPut, "/api/master/shops/1", bytes.NewReader(body))
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var shop struct {
		EnableDelivery    int64  `db:"enable_delivery"`
		EnableDineIn      int64  `db:"enable_dine_in"`
		EnableReservation int64  `db:"enable_reservation"`
		CommissionType    string `db:"commission_type"`
		CommissionValue   int64  `db:"commission_value"`
	}
	if err := db.DB.Get(&shop, "SELECT enable_delivery, enable_dine_in, enable_reservation, commission_type, commission_value FROM shops WHERE id = ?", shopID); err != nil {
		t.Fatalf("reload updated shop failed: %v", err)
	}

	if shop.EnableDelivery != 1 || shop.EnableDineIn != 1 || shop.EnableReservation != 1 {
		t.Fatalf("expected enable flags to be preserved, got %+v", shop)
	}
	if shop.CommissionType != "per_order" || shop.CommissionValue != 18 {
		t.Fatalf("expected commission fields updated, got %+v", shop)
	}
}

func TestMasterManageUpdateShopUpdatesEnableFlagsWhenFrontendProvidesThem(t *testing.T) {
	shopID := setupMasterManageTestDB(t)

	r := gin.New()
	r.PUT("/api/master/shops/:id", MasterUpdateShop)

	body, _ := json.Marshal(map[string]interface{}{
		"name":              "Shop 02 Updated",
		"slug":              "02-new",
		"billingPlanType":   "business",
		"commissionType":    "percentage",
		"commissionValue":   6,
		"status":            "active",
		"enableDelivery":    false,
		"enableDineIn":      true,
		"enableReservation": false,
	})

	req := httptest.NewRequest(http.MethodPut, "/api/master/shops/1", bytes.NewReader(body))
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var shop struct {
		EnableDelivery    int64 `db:"enable_delivery"`
		EnableDineIn      int64 `db:"enable_dine_in"`
		EnableReservation int64 `db:"enable_reservation"`
	}
	if err := db.DB.Get(&shop, "SELECT enable_delivery, enable_dine_in, enable_reservation FROM shops WHERE id = ?", shopID); err != nil {
		t.Fatalf("reload updated shop failed: %v", err)
	}

	if shop.EnableDelivery != 0 || shop.EnableDineIn != 1 || shop.EnableReservation != 0 {
		t.Fatalf("expected enable flags to follow payload, got %+v", shop)
	}
}

func TestMasterManageTopupShopBalanceWithFrontendPayload(t *testing.T) {
	shopID := setupMasterManageTestDB(t)

	r := gin.New()
	r.POST("/api/master/shop-balance", MasterTopupShopBalance)

	body, _ := json.Marshal(map[string]interface{}{
		"id":        shopID,
		"amountRsd": 5000,
		"note":      "manual topup from master",
	})

	req := httptest.NewRequest(http.MethodPost, "/api/master/shop-balance", bytes.NewReader(body))
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var balance int64
	if err := db.DB.Get(&balance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("reload balance failed: %v", err)
	}
	if balance != 5000 {
		t.Fatalf("expected balance 5000, got %d", balance)
	}

	var entry struct {
		EntryType string `db:"entry_type"`
		Note      string `db:"note"`
	}
	if err := db.DB.Get(&entry, "SELECT entry_type, note FROM billing_ledger WHERE shop_id = ? ORDER BY id DESC LIMIT 1", shopID); err != nil {
		t.Fatalf("reload ledger entry failed: %v", err)
	}
	if entry.EntryType != "manual_topup" {
		t.Fatalf("expected manual_topup entry, got %s", entry.EntryType)
	}
	if entry.Note != "manual topup from master" {
		t.Fatalf("unexpected ledger note: %s", entry.Note)
	}
}
