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

func setupMasterImpersonateTestDB(t *testing.T) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "master-impersonate.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	if _, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status) VALUES ('Shop 02', '02', 'pass', 'active')"); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}
}

func TestMasterImpersonateShopReturnsGeneratedTokenWithoutAdminTokensTable(t *testing.T) {
	setupMasterImpersonateTestDB(t)

	r := gin.New()
	r.GET("/api/master/impersonate-shop", MasterImpersonateShop)

	req := httptest.NewRequest(http.MethodGet, "/api/master/impersonate-shop?id=1", nil)
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Success bool   `json:"success"`
		Slug    string `json:"slug"`
		Token   string `json:"token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	if !resp.Success {
		t.Fatalf("expected success=true, got false")
	}
	if resp.Slug != "02" {
		t.Fatalf("expected slug 02, got %q", resp.Slug)
	}
	if resp.Token == "" {
		t.Fatalf("expected generated token, got empty string")
	}
}
