package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func setupOrderScheduleTestDB(t *testing.T) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "order-schedule-test.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	if _, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status) VALUES ('Test Shop', 'test-shop', 'x', 'active')"); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}
	if _, err := db.DB.Exec(`
		UPDATE shops
		SET commission_type = 'per_order', commission_value = 30
		WHERE slug = 'test-shop'
	`); err != nil {
		t.Fatalf("seed shop commission failed: %v", err)
	}
	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
		VALUES ((SELECT id FROM shops WHERE slug = 'test-shop'), 'subscription', 10000, date('now', 'start of month', '+1 month'), 'active')
	`); err != nil {
		t.Fatalf("seed billing account failed: %v", err)
	}
}

func TestCreateOrderStoresScheduledForForDelivery(t *testing.T) {
	setupOrderScheduleTestDB(t)

	h := &OrderHandler{}
	r := gin.New()
	r.POST("/:slug/order", h.CreateOrder)

	payload := map[string]interface{}{
		"table_info":     "Test street 1",
		"order_type":     "delivery",
		"total_amount":   500,
		"items":          []map[string]interface{}{{"name": "Noodle", "quantity": 1, "price": 500}},
		"remarks":        "no onion",
		"user_phone":     "0612345678",
		"scheduled_for":  "2026-03-01T18:30:00",
		"dine_in_action": "",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/test-shop/order", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 create order, got %d body=%s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	orderID := int64(resp["order_id"].(float64))

	var scheduled sql.NullString
	if err := db.DB.QueryRow("SELECT scheduled_for FROM orders WHERE id = ?", orderID).Scan(&scheduled); err != nil {
		t.Fatalf("query scheduled_for failed: %v", err)
	}
	if !scheduled.Valid || scheduled.String == "" {
		t.Fatalf("expected scheduled_for to be stored for delivery order")
	}
}

func TestCreateOrderRejectsScheduledForForDineIn(t *testing.T) {
	setupOrderScheduleTestDB(t)

	h := &OrderHandler{}
	r := gin.New()
	r.POST("/:slug/order", h.CreateOrder)

	payload := map[string]interface{}{
		"table_info":    "1号桌",
		"order_type":    "dine_in",
		"total_amount":  300,
		"items":         []map[string]interface{}{{"name": "Soup", "quantity": 1, "price": 300}},
		"scheduled_for": "2026-03-01T18:30:00",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/test-shop/order", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 when dine_in has scheduled_for, got %d body=%s", w.Code, w.Body.String())
	}
}
