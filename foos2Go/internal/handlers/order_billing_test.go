package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func TestCreateDeliveryOrderRequiresWalletBalance(t *testing.T) {
	setupOrderScheduleTestDB(t)

	h := &OrderHandler{}
	r := gin.New()
	r.POST("/:slug/order", h.CreateOrder)

	payload := map[string]interface{}{
		"table_info":   "Test street 1",
		"order_type":   "delivery",
		"total_amount": 500,
		"items":        []map[string]interface{}{{"name": "Noodle", "quantity": 1, "price": 500}},
		"remarks":      "no onion",
		"user_phone":   "0612345678",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/test-shop/order", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 create order, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestCreateDeliveryOrderDoesNotDeductWalletBalanceOrWriteLedgerBeforeCompletion(t *testing.T) {
	setupOrderScheduleTestDB(t)

	h := &OrderHandler{}
	r := gin.New()
	r.POST("/:slug/order", h.CreateOrder)

	payload := map[string]interface{}{
		"table_info":   "Test street 1",
		"order_type":   "delivery",
		"total_amount": 500,
		"items":        []map[string]interface{}{{"name": "Noodle", "quantity": 1, "price": 500}},
		"remarks":      "no onion",
		"user_phone":   "0612345678",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/test-shop/order", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 create order, got %d body=%s", w.Code, w.Body.String())
	}

	var balance int64
	if err := db.DB.Get(&balance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = (SELECT id FROM shops WHERE slug = 'test-shop')"); err != nil {
		t.Fatalf("query balance failed: %v", err)
	}
	if balance != 10000 {
		t.Fatalf("expected balance unchanged before completion, got %d", balance)
	}

	var ledgerCount int
	if err := db.DB.Get(&ledgerCount, `
		SELECT COUNT(*)
		FROM billing_ledger
		WHERE shop_id = (SELECT id FROM shops WHERE slug = 'test-shop') AND entry_type IN ('delivery_commission', 'commission_deduction')
	`); err != nil {
		t.Fatalf("query ledger count failed: %v", err)
	}
	if ledgerCount != 0 {
		t.Fatalf("expected no commission ledger before completion, got %d", ledgerCount)
	}

	var recordCount int
	if err := db.DB.Get(&recordCount, `
		SELECT COUNT(*)
		FROM commission_records
		WHERE shop_id = (SELECT id FROM shops WHERE slug = 'test-shop')
	`); err != nil {
		t.Fatalf("query commission record count failed: %v", err)
	}
	if recordCount != 0 {
		t.Fatalf("expected no commission record before completion, got %d", recordCount)
	}
}
