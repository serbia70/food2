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

func setupDailyReportTestDB(t *testing.T) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "daily-report-test.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)
}

func TestDailyReportSummary(t *testing.T) {
	setupDailyReportTestDB(t)
	t.Setenv("MEITUAN_CRON_TOKEN", "cron-secret")

	shop1, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status) VALUES ('A Shop', 'ashop', 'x', 'active')")
	if err != nil {
		t.Fatalf("insert shop1 failed: %v", err)
	}
	shop1ID, _ := shop1.LastInsertId()

	shop2, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status) VALUES ('B Shop', 'bshop', 'x', 'active')")
	if err != nil {
		t.Fatalf("insert shop2 failed: %v", err)
	}
	shop2ID, _ := shop2.LastInsertId()

	_, err = db.DB.Exec(`
		INSERT INTO orders (order_no, shop_id, order_type, status, total_amount, items_json, created_at)
		VALUES
		('o1', ?, 'delivery', 'completed', 1000, '[]', '2026-02-23 10:00:00'),
		('o2', ?, 'dine_in', 'completed', 500, '[]', '2026-02-23 11:00:00'),
		('o3', ?, 'delivery', 'cancelled', 800, '[]', '2026-02-23 12:00:00'),
		('o4', ?, 'delivery', 'completed', 1200, '[]', '2026-02-23 13:00:00')
	`, shop1ID, shop1ID, shop1ID, shop2ID)
	if err != nil {
		t.Fatalf("insert orders failed: %v", err)
	}

	g := gin.New()
	g.GET("/api/cron/daily-report", DailyReportCron)

	req := httptest.NewRequest(http.MethodGet, "/api/cron/daily-report?date=2026-02-23", nil)
	req.Header.Set("Authorization", "Bearer cron-secret")
	w := httptest.NewRecorder()
	g.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("unexpected status=%d body=%s", w.Code, w.Body.String())
	}

	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}

	if body["date"] != "2026-02-23" {
		t.Fatalf("unexpected date %v", body["date"])
	}
	if ok, _ := body["success"].(bool); !ok {
		t.Fatalf("expected success=true in response")
	}

	totals, _ := body["totals"].(map[string]interface{})
	if int64(totals["revenue_rsd"].(float64)) != 2700 {
		t.Fatalf("expected total revenue 2700, got %v", totals["revenue_rsd"])
	}
	if int64(totals["order_count"].(float64)) != 3 {
		t.Fatalf("expected total order count 3, got %v", totals["order_count"])
	}
}

func TestDailyReportSummary_Unauthorized(t *testing.T) {
	setupDailyReportTestDB(t)
	t.Setenv("MEITUAN_CRON_TOKEN", "cron-secret")

	g := gin.New()
	g.GET("/api/cron/daily-report", DailyReportCron)

	req := httptest.NewRequest(http.MethodGet, "/api/cron/daily-report?date=2026-02-23", nil)
	req.Header.Set("Authorization", "Bearer wrong-token")
	w := httptest.NewRecorder()
	g.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for invalid token, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestDailyReportSummary_MissingTokenConfig(t *testing.T) {
	setupDailyReportTestDB(t)
	t.Setenv("MEITUAN_CRON_TOKEN", "")

	g := gin.New()
	g.GET("/api/cron/daily-report", DailyReportCron)

	req := httptest.NewRequest(http.MethodGet, "/api/cron/daily-report?date=2026-02-23", nil)
	w := httptest.NewRecorder()
	g.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when cron token is not configured, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestDailyReportSummary_InvalidDate(t *testing.T) {
	setupDailyReportTestDB(t)
	t.Setenv("MEITUAN_CRON_TOKEN", "cron-secret")

	g := gin.New()
	g.GET("/api/cron/daily-report", DailyReportCron)

	req := httptest.NewRequest(http.MethodGet, "/api/cron/daily-report?date=2026-99-99", nil)
	req.Header.Set("Authorization", "Bearer cron-secret")
	w := httptest.NewRecorder()
	g.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid date, got %d body=%s", w.Code, w.Body.String())
	}
}
