package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func setupReservationTestDB(t *testing.T, planType string) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "reservation-test.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	if _, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status, enable_reservation) VALUES ('Test Shop', 'test-shop', 'x', 'active', 1)"); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}

	if strings.TrimSpace(planType) != "" {
		if _, err := db.DB.Exec(`
			INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
			VALUES ((SELECT id FROM shops WHERE slug = 'test-shop'), ?, 0, date('now', 'start of month', '+1 month'), 'active')
		`, planType); err != nil {
			t.Fatalf("seed billing account failed: %v", err)
		}
	}
}

func TestReservationDineInOnly(t *testing.T) {
	setupReservationTestDB(t, "subscription")

	h := &ReservationHandler{}
	r := gin.New()
	r.POST("/:slug/reservation", h.CreateReservation)

	reservationTime := time.Now().Add(3 * time.Hour).Format(time.RFC3339)
	payload := map[string]interface{}{
		"guest_count":      2,
		"reservation_time": reservationTime,
		"customer_phone":   "0612345678",
		"dine_type":        "delivery",
		"delivery_address": "Test street 1",
		"items":            []map[string]interface{}{{"name": "Noodle", "quantity": 1, "price": 500}},
		"customer_name":    "Bob",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/test-shop/reservation", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for delivery reservation, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestReservationRequiresSubscriptionOrBusinessPlan(t *testing.T) {
	setupReservationTestDB(t, "legacy")

	h := &ReservationHandler{}
	r := gin.New()
	r.POST("/:slug/reservation", h.CreateReservation)

	reservationTime := time.Now().Add(3 * time.Hour).Format(time.RFC3339)
	payload := map[string]interface{}{
		"guest_count":      2,
		"reservation_time": reservationTime,
		"customer_phone":   "0612345678",
		"dine_type":        "dine_in",
		"customer_name":    "Bob",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/test-shop/reservation", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for unsupported plan reservation, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestPrintReservationIsRemoved(t *testing.T) {
	setupReservationTestDB(t, "subscription")

	if _, err := db.DB.Exec(`
		INSERT INTO reservations (shop_id, guest_count, reservation_time, customer_phone, dine_type, status)
		VALUES ((SELECT id FROM shops WHERE slug = 'test-shop'), 2, datetime('now', '+3 hour'), '0612345678', 'dine_in', 'pending')
	`); err != nil {
		t.Fatalf("seed reservation failed: %v", err)
	}

	h := &ReservationHandler{}
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("shop_id", int64(1))
		c.Next()
	})
	r.POST("/api/admin/reservations/:id/print", h.PrintReservation)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/reservations/1/print", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusGone {
		t.Fatalf("expected 410 for removed reservation print, got %d body=%s", w.Code, w.Body.String())
	}
}
