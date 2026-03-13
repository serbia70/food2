package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func mustMasterToken(t *testing.T) string {
	t.Helper()
	token, err := generateMasterToken("admin")
	if err != nil {
		t.Fatalf("generate master token failed: %v", err)
	}
	return token
}

func setupCommissionRefundTestDB(t *testing.T) int64 {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "commission-refund-test.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	if _, err := db.DB.Exec(`
		INSERT INTO shops (name, slug, password, status, commission_type, commission_value)
		VALUES ('Refund Shop', 'refund-shop', 'x', 'active', 'per_order', 30)
	`); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}

	var shopID int64
	if err := db.DB.Get(&shopID, "SELECT id FROM shops WHERE slug = 'refund-shop'"); err != nil {
		t.Fatalf("query shop id failed: %v", err)
	}

	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
		VALUES (?, 'subscription', 10000, date('now', 'start of month', '+1 month'), 'active')
	`, shopID); err != nil {
		t.Fatalf("seed billing account failed: %v", err)
	}

	if _, err := db.DB.Exec(`
		INSERT INTO orders (id, order_no, shop_id, order_type, status, total_amount, items_json)
		VALUES (5001, '2603085001', ?, 'delivery', 'completed', 800, '[]')
	`, shopID); err != nil {
		t.Fatalf("seed completed order failed: %v", err)
	}

	if _, err := db.DB.Exec(`
		INSERT INTO commission_records (id, shop_id, order_id, order_no, total_amount, commission_rate, commission_amount, balance_after, order_type, refund_status)
		VALUES (7001, ?, 5001, '2603085001', 800, 3, 24, 9976, 'delivery', 'none')
	`, shopID); err != nil {
		t.Fatalf("seed commission record failed: %v", err)
	}

	return shopID
}

func TestAdminCreateCommissionRefundRequest(t *testing.T) {
	shopID := setupCommissionRefundTestDB(t)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/admin/commission-refund/request", func(c *gin.Context) {
		c.Set("shop_id", shopID)
		AdminCreateCommissionRefundRequest(c)
	})

	body, _ := json.Marshal(map[string]any{
		"orderId": 5001,
		"reason":  "缺货，忘记拒单",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/admin/commission-refund/request", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var count int
	if err := db.DB.Get(&count, "SELECT COUNT(*) FROM commission_refund_requests WHERE commission_record_id = 7001 AND status = 'pending'"); err != nil {
		t.Fatalf("count pending requests failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected one pending refund request, got %d", count)
	}
}

func TestAdminCreateCommissionRefundRequestRejectsDuplicatePending(t *testing.T) {
	shopID := setupCommissionRefundTestDB(t)
	if _, err := db.DB.Exec(`
		INSERT INTO commission_refund_requests (shop_id, order_id, commission_record_id, commission_amount, reason, status)
		VALUES (?, 5001, 7001, 24, '第一次申请', 'pending')
	`, shopID); err != nil {
		t.Fatalf("seed pending refund request failed: %v", err)
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/admin/commission-refund/request", func(c *gin.Context) {
		c.Set("shop_id", shopID)
		AdminCreateCommissionRefundRequest(c)
	})

	body, _ := json.Marshal(map[string]any{
		"orderId": 5001,
		"reason":  "再次申请",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/admin/commission-refund/request", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for duplicate pending request, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestMasterReviewCommissionRefundApproved(t *testing.T) {
	shopID := setupCommissionRefundTestDB(t)
	if _, err := db.DB.Exec(`
		INSERT INTO commission_refund_requests (id, shop_id, order_id, commission_record_id, commission_amount, reason, status)
		VALUES (9001, ?, 5001, 7001, 24, '缺货', 'pending')
	`, shopID); err != nil {
		t.Fatalf("seed pending refund request failed: %v", err)
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/master/commission-refund/review", func(c *gin.Context) {
		MasterReviewCommissionRefund(c)
	})

	body, _ := json.Marshal(map[string]any{
		"requestId":  9001,
		"action":     "approve",
		"reviewNote": "同意退回",
		"reviewedBy": "master-admin",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/master/commission-refund/review", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+mustMasterToken(t))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var balance int64
	if err := db.DB.Get(&balance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query balance failed: %v", err)
	}
	if balance != 10024 {
		t.Fatalf("expected refunded balance 10024, got %d", balance)
	}

	var refundStatus string
	if err := db.DB.Get(&refundStatus, "SELECT refund_status FROM commission_records WHERE id = 7001"); err != nil {
		t.Fatalf("query refund status failed: %v", err)
	}
	if refundStatus != "refunded" {
		t.Fatalf("expected refunded status, got %s", refundStatus)
	}
}
