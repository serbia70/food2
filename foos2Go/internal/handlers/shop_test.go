package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func setupShopTestDB(t *testing.T, planType string) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "shop-test.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	if _, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status, enable_reservation, table_config) VALUES ('Test Shop', 'test-shop', 'x', 'active', 1, '[]')"); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}

	if planType != "" {
		if _, err := db.DB.Exec(`
			INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
			VALUES ((SELECT id FROM shops WHERE slug = 'test-shop'), ?, 0, date('now', 'start of month', '+1 month'), 'active')
		`, planType); err != nil {
			t.Fatalf("seed billing account failed: %v", err)
		}
	}
}

func TestGetShopBySlugForcesReservationOffOnUnsupportedPlan(t *testing.T) {
	setupShopTestDB(t, "legacy")

	h := &ShopHandler{}
	r := gin.New()
	r.GET("/:slug/info", h.GetShopBySlug)

	req := httptest.NewRequest(http.MethodGet, "/test-shop/info", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	if got := int(resp["enable_reservation"].(float64)); got != 0 {
		t.Fatalf("expected enable_reservation=0 for unsupported plan, got %d", got)
	}
	if gotPlan := resp["billing_plan_type"]; gotPlan != "legacy" {
		t.Fatalf("expected billing_plan_type legacy passthrough, got %v", gotPlan)
	}
}

func TestGetShopBySlugKeepsReservationOnForSubscriptionPlan(t *testing.T) {
	setupShopTestDB(t, "subscription")

	h := &ShopHandler{}
	r := gin.New()
	r.GET("/:slug/info", h.GetShopBySlug)

	req := httptest.NewRequest(http.MethodGet, "/test-shop/info", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	if got := int(resp["enable_reservation"].(float64)); got != 1 {
		t.Fatalf("expected enable_reservation=1 for subscription plan, got %d", got)
	}
	if gotPlan := resp["billing_plan_type"]; gotPlan != "subscription" {
		t.Fatalf("expected billing_plan_type subscription, got %v", gotPlan)
	}
}

func TestGetShopBySlugKeepsReservationOnForBusinessPlan(t *testing.T) {
	setupShopTestDB(t, "business")

	h := &ShopHandler{}
	r := gin.New()
	r.GET("/:slug/info", h.GetShopBySlug)

	req := httptest.NewRequest(http.MethodGet, "/test-shop/info", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	if got := int(resp["enable_reservation"].(float64)); got != 1 {
		t.Fatalf("expected enable_reservation=1 for business plan, got %d", got)
	}
	if gotPlan := resp["billing_plan_type"]; gotPlan != "business" {
		t.Fatalf("expected billing_plan_type business, got %v", gotPlan)
	}
}
