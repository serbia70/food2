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

func setupMasterInitStatusTestDB(t *testing.T) int64 {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "master-init-status.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	res, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status, expire_date, settings) VALUES ('Legacy Shop', 'legacy-shop', 'pass', 'active', '', '{}')")
	if err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}
	shopID, _ := res.LastInsertId()

	if _, err := db.DB.Exec("INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, billing_status, next_charge_date) VALUES (?, 'subscription', 9800, 'inactive', date('now', '+1 month'))", shopID); err != nil {
		t.Fatalf("seed billing failed: %v", err)
	}

	return shopID
}

func TestMasterInitDataIncludesResolvedShopStatus(t *testing.T) {
	shopID := setupMasterInitStatusTestDB(t)

	r := gin.New()
	r.GET("/api/master/init", MasterInitData)

	req := httptest.NewRequest(http.MethodGet, "/api/master/init", nil)
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Shops []map[string]interface{} `json:"shops"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}

	var found map[string]interface{}
	for _, shop := range resp.Shops {
		if int64(shop["id"].(float64)) == shopID {
			found = shop
			break
		}
	}
	if found == nil {
		t.Fatalf("expected shop %d in response", shopID)
	}

	if found["status"] != "active" {
		t.Fatalf("expected status active, got %v", found["status"])
	}
	if found["billing_status"] != "warning" {
		t.Fatalf("expected normalized billing_status warning for legacy inactive shop with positive balance, got %v", found["billing_status"])
	}
	if found["display_status"] != "营业中" {
		t.Fatalf("expected display_status 营业中, got %v", found["display_status"])
	}
	if found["display_billing_status"] != "正常" {
		t.Fatalf("expected display_billing_status 正常, got %v", found["display_billing_status"])
	}
	if found["display_expiry_status"] != "未设置" {
		t.Fatalf("expected display_expiry_status 未设置, got %v", found["display_expiry_status"])
	}
	if found["display_shop_state"] != "正常运营" {
		t.Fatalf("expected display_shop_state 正常运营, got %v", found["display_shop_state"])
	}
	if found["display_shop_state_reason"] != "" {
		t.Fatalf("expected empty display_shop_state_reason, got %v", found["display_shop_state_reason"])
	}
}

func TestMasterInitDataOperationalShopStates(t *testing.T) {
	shopID := setupMasterInitStatusTestDB(t)

	if _, err := db.DB.Exec("UPDATE shops SET enable_dine_in = 0 WHERE id = ?", shopID); err != nil {
		t.Fatalf("disable dine in failed: %v", err)
	}

	r := gin.New()
	r.GET("/api/master/init", MasterInitData)
	req := httptest.NewRequest(http.MethodGet, "/api/master/init", nil)
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Shops []map[string]interface{} `json:"shops"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}

	var found map[string]interface{}
	for _, shop := range resp.Shops {
		if int64(shop["id"].(float64)) == shopID {
			found = shop
			break
		}
	}
	if found == nil {
		t.Fatalf("expected shop %d in response", shopID)
	}

	if found["display_shop_state"] != "堂食点餐停止" {
		t.Fatalf("expected display_shop_state 堂食点餐停止, got %v", found["display_shop_state"])
	}
	if found["display_shop_state_reason"] != "店铺已手动关闭堂食" {
		t.Fatalf("expected display_shop_state_reason 店铺已手动关闭堂食, got %v", found["display_shop_state_reason"])
	}
}

func TestMasterInitDataDoesNotTreatManualDoubleDisableAsBalanceStop(t *testing.T) {
	shopID := setupMasterInitStatusTestDB(t)

	if _, err := db.DB.Exec("UPDATE shops SET enable_delivery = 0, enable_dine_in = 0 WHERE id = ?", shopID); err != nil {
		t.Fatalf("disable delivery and dine in failed: %v", err)
	}

	r := gin.New()
	r.GET("/api/master/init", MasterInitData)
	req := httptest.NewRequest(http.MethodGet, "/api/master/init", nil)
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Shops []map[string]interface{} `json:"shops"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}

	var found map[string]interface{}
	for _, shop := range resp.Shops {
		if int64(shop["id"].(float64)) == shopID {
			found = shop
			break
		}
	}
	if found == nil {
		t.Fatalf("expected shop %d in response", shopID)
	}

	if found["display_shop_state"] == "外卖堂食均停止" {
		t.Fatalf("manual disable should not be shown as balance stop: %+v", found)
	}
	if found["display_shop_state_reason"] == "外卖和堂食当前都不可用" {
		t.Fatalf("manual disable should not use generic balance-stop wording: %+v", found)
	}
}
